"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu } from "@/components/menu";
import { PRESETS, hostOf, registerPreview, type Call } from "@/lib/preview";
import { cn } from "@/lib/utils";

/**
 * A project's running web app, in a workspace tab (components/workspace.tsx).
 * The page is framed through the app's proxy (src-tauri/src/preview.rs), which
 * adds an agent to it (agent.js): that is how the page's address and console
 * reach this tab, and how Claude reads and uses the page (lib/preview.ts).
 *
 * A page from the web (a search, a library's docs) cannot be framed: it opens
 * in a webview of its own, laid over the viewport and kept there
 * (src-tauri/src/browser.rs), with the same agent inside it, asked through the
 * app instead of by message. Both kinds are one trail of pages, back and forth.
 *
 * Claude's clicks and keys are real on macOS: AppKit events at the point on
 * screen, so every button that works for a person works for Claude. The
 * agent draws Claude's pointer gliding to each one. Where they cannot be real
 * (the frame is out of sight, or not on a Mac), the agent acts in the page.
 *
 * The viewport fills the tab until it is given a size: by dragging its right
 * or bottom edge, from the size menu, or by Claude. A size bigger than the tab
 * is scaled down to fit, and the page still lays out at its real width. While
 * the size changes, it is shown in the middle in pixels, as Ghostty shows a
 * terminal's.
 */

type Size = { w: number; h: number };

/** Space around a sized viewport, where its handles sit. */
const PAD = 20;
const MIN = 200;
const MAX = 3840;
const SIZE_KEY = "slop.preview.size:";

const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Math.round(n)));

function storedSize(root: string): Size | null {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY + root) ?? "null") as Size | null;
    if (v && v.w >= MIN && v.h >= MIN) return v;
  } catch {
    /* storage blocked: fill the tab */
  }
  return null;
}

function keepSize(root: string, size: Size | null) {
  try {
    if (size) localStorage.setItem(SIZE_KEY + root, JSON.stringify(size));
    else localStorage.removeItem(SIZE_KEY + root);
  } catch {
    /* applies until reload */
  }
}

/** Everything after the host: `/about?x` of `http://localhost:5173/about?x`. */
const pathOf = (url: string) => url.replace(/^(?:https?:\/\/)?[^/?#]+/, "") || "/";
const originOf = (url: string) => (url.match(/^(?:https?:\/\/)?[^/?#]+/)?.[0] ?? url).replace(/^(?!https?:)/, "http://");
const bare = (url: string) => url.replace(/^https?:\/\//, "");

/** An address off this machine: the web, not a dev server. */
const isWeb = (url: string) => /^https?:\/\//.test(url) && !hostOf(url);

/** What was typed, as a page from the web: an address, or else a search. */
const toWeb = (v: string) =>
  /^https?:\/\//.test(v)
    ? v
    : /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(v)
      ? `https://${v}`
      : `https://www.google.com/search?q=${encodeURIComponent(v)}`;

// Real input is AppKit's (src-tauri/src/browser.rs).
const REAL = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

type Act = { kind: "move" | "down" | "up" | "drag" | "key" | "text"; x?: number; y?: number; button?: number; clicks?: number; text?: string };

/** Where the agent found a click's target (agent.js `locate`). */
type Located = { x: number; y: number; what: string; native: { kind: "select" | "file" | "color"; ref: string; options?: string } | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The toolbar's device toggles: the whole tab, then presets (lib/preview.ts). */
const DEVICES = [
  { id: "fill", label: "Fill the tab", icon: <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" /> },
  { id: "mobile", label: "Phone", icon: <><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7.2 12.2h1.6" /></> },
  { id: "tablet", label: "Tablet", icon: <><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" /><path d="M7.2 12.2h1.6" /></> },
  { id: "desktop", label: "Desktop", icon: <><rect x="1.5" y="2.5" width="13" height="8.5" rx="1" /><path d="M5.5 13.5h5M8 11v2.5" /></> },
];

/** A message from the agent in the page (src-tauri/src/agent.js). */
type Said =
  | { type: "location"; url: string; title?: string }
  | { type: "console"; level: string; text: string }
  | { type: "open"; url: string }
  | { type: "reply"; id: number; ok: boolean; value: unknown }
  | { type: "loaded" };

/** What a page from the web has said since it was last asked (agent.js). */
const DRAIN = "window.__slop ? window.__slop.drain() : []";

interface Line {
  level: string;
  text: string;
}

let nextCall = 1;

export function Preview({
  root,
  target,
  visible,
  waiting,
  onTarget,
  onShowServer,
  docked,
}: {
  root: string;
  /** The dev server's address, once it has printed one. */
  target?: string;
  visible: boolean;
  /** The command starting the dev server, until it prints an address. */
  waiting?: string;
  /** The preview was pointed at another server: from the address bar, or by Claude. */
  onTarget: (url: string) => void;
  /** Bring the dev server's terminal to the front. */
  onShowServer?: () => void;
  /** In the main view rather than the window (components/workspace.tsx). */
  docked?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  // Where the frame starts. Set once: every later move is made on the frame itself.
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The address bar: where the page is, or what is being typed into it.
  const [shown, setShown] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(() => storedSize(root));
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [badge, setBadge] = useState(false);
  const sizeBadge = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // A page from the web is in front, in the webview of this label.
  const [web, setWeb] = useState<string | null>(null);
  const [claude, setClaude] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const replace = useRef(() => {});

  // What the calls below read: they outlive any one render.
  const proxy = useRef<{ id: number; port: number } | null>(null);
  const browser = useRef<string | null>(null);
  const onWeb = useRef(false);
  const here = useRef("");
  const server = useRef(target);
  const log = useRef<Line[]>([]);
  // The page's alerts and confirms since Claude last acted (agent.js answers them).
  const dialogs = useRef<string[]>([]);
  const pending = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const loads = useRef<(() => void)[]>([]);
  // The pages this tab has shown, for its own back and forward. The page's
  // history is shared with the app's window, so it is never stepped through:
  // every move is a replace, and adds nothing to the app's back.
  const trail = useRef<{ list: string[]; at: number; stepping: boolean }>({ list: [], at: -1, stepping: false });

  const fill = size === null;
  const vw = fill ? Math.round(box.w) : size.w;
  const vh = fill ? Math.round(box.h) : size.h;
  const scale = fill ? 1 : Math.max(0.1, Math.min(1, (box.w - 2 * PAD) / size.w, (box.h - 2 * PAD) / size.h));
  const view = useRef({ vw, vh, scale });
  useEffect(() => {
    view.current = { vw, vh, scale };
    server.current = target;
  });

  /** The page's address as the dev server knows it, not the proxy. */
  const display = (url: string) => {
    const p = proxy.current;
    if (!p || !server.current) return bare(url);
    const mine = `http://localhost:${p.port}`;
    return bare(url.startsWith(mine) ? originOf(server.current) + url.slice(mine.length) : url);
  };

  /**
   * Opens a page: one from the web in its webview, opened the first time;
   * the dev server's in the frame, without a step in the window's history.
   */
  const go = (url: string) => {
    if (isWeb(url)) {
      onWeb.current = true;
      const label = browser.current;
      if (label) {
        setWeb(label);
        return void invoke("browser_go", { label, url }).catch((e) => setError(String(e)));
      }
      const r = sheet.current?.getBoundingClientRect();
      const { scale: zoom } = view.current;
      return void invoke<string>("browser_open", { url, x: r?.x ?? 0, y: r?.y ?? 0, width: r?.width || 1, height: r?.height || 1, zoom })
        .then((label) => {
          browser.current = label;
          if (onWeb.current) setWeb(label);
        })
        .catch((e) => setError(String(e)));
    }
    onWeb.current = false;
    setWeb(null);
    const w = frame.current?.contentWindow;
    if (w) w.location.replace(url);
  };

  // A proxy in front of the dev server, opened once it has an address and
  // kept for the tab's life: a server that restarts elsewhere is followed on
  // the same port, so the page keeps its storage.
  useEffect(() => {
    if (!target || !isTauri()) return;
    const open = proxy.current;
    if (open) {
      void invoke("preview_target", { id: open.id, target }).then(() => {
        go(`http://localhost:${open.port}${pathOf(target)}`);
      });
      return;
    }
    let gone = false;
    invoke<{ id: number; port: number }>("preview_open", { target })
      .then((p) => {
        if (gone) return void invoke("preview_close", { id: p.id });
        proxy.current = p;
        here.current = `http://localhost:${p.port}${pathOf(target)}`;
        setShown(display(here.current));
        setSrc(here.current);
        setError(null);
      })
      .catch((e) => setError(String(e)));
    return () => {
      gone = true;
    };
  }, [target]);

  useEffect(
    () => () => {
      // Forgotten as well as closed: an effect run again (a hot reload) opens a fresh one.
      if (proxy.current) void invoke("preview_close", { id: proxy.current.id });
      proxy.current = null;
      if (browser.current) void invoke("browser_close", { label: browser.current });
      browser.current = null;
    },
    [],
  );

  const loaded = () => {
    // A page that navigated took its unanswered calls with it.
    for (const p of pending.current.values()) p.resolve(`The page navigated to ${display(here.current)}.`);
    pending.current.clear();
    // The new page says where it is just after this; wait to hear it.
    const waiting = loads.current.splice(0);
    setTimeout(() => waiting.forEach((f) => f()), 80);
  };

  const nextLoad = () =>
    new Promise<void>((resolve) => {
      loads.current.push(resolve);
      setTimeout(resolve, 15000);
    });

  // Moved between the window and the main view, the frame is taken out of
  // the page and put back, which loads it afresh from its src: made the page
  // it was showing, not the one it started on. Before the move, which the
  // workspace makes after this.
  const place = useRef(docked);
  useLayoutEffect(() => {
    if (place.current === docked) return;
    place.current = docked;
    const el = frame.current;
    if (el && here.current && !isWeb(here.current)) el.src = here.current;
  }, [docked]);

  // What the agent in the page says: where it is, what it logged, its answers.
  const hear = useRef<(m: Said) => void>(() => {});
  useEffect(() => {
    hear.current = (m) => {
      if (m.type === "location") {
        here.current = m.url;
        setShown(display(m.url));
        const t = trail.current;
        if (t.stepping) t.stepping = false;
        else if (t.list[t.at] !== m.url) {
          t.list = [...t.list.slice(0, t.at + 1), m.url];
          t.at = t.list.length - 1;
        }
      } else if (m.type === "console") {
        if (m.level === "dialog") dialogs.current.push(m.text);
        log.current.push({ level: m.level, text: m.text });
        if (log.current.length > 1000) log.current.shift();
      } else if (m.type === "open") {
        // A link off this machine, from the dev server's page.
        go(m.url);
      } else if (m.type === "reply") {
        const p = pending.current.get(m.id);
        if (!p) return;
        pending.current.delete(m.id);
        if (m.ok) p.resolve(m.value);
        else p.reject(new Error(String(m.value)));
      } else if (m.type === "loaded") {
        loaded();
      }
    };
  });
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (frame.current && e.source === frame.current.contentWindow && e.data?.__slop) hear.current(e.data);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  // A page from the web keeps what it says until it is collected; and says
  // when it has loaded through the app.
  useEffect(() => {
    if (!web) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      invoke<Said[] | null>("browser_eval", { label: web, js: DRAIN })
        .then((all) => all?.forEach((m) => hear.current(m)))
        .catch(() => {})
        .finally(() => (busy = false));
    }, 120);
    const off = listen<{ label: string; url: string; done: boolean }>("slop:browser", (e) => {
      if (e.payload.label !== web || !onWeb.current) return;
      replace.current();
      if (!e.payload.done) return setShown(bare(e.payload.url));
      // Where it ended up, before the page's own word on it is next collected.
      hear.current({ type: "location", url: e.payload.url });
      hear.current({ type: "loaded" });
    });
    return () => {
      clearInterval(timer);
      void off.then((f) => f());
    };
  }, [web]);

  // The webview of a page from the web, kept over the viewport: moved with
  // it, and hidden while it is out of sight or anything of the app's (a menu,
  // a dialog) is over it, as it would otherwise cover that.
  useEffect(() => {
    if (!web) return;
    let last = "";
    let frameId = 0;
    const place = () => {
      const el = sheet.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inside = (x: number, y: number) => {
        const top = document.elementFromPoint(x, y);
        return !!top && el.contains(top);
      };
      const shown =
        r.width > 0 &&
        inside(r.x + r.width / 2, r.y + r.height / 2) &&
        inside(r.x + 4, r.y + 4) &&
        inside(r.right - 4, r.y + 4) &&
        inside(r.x + 4, r.bottom - 4) &&
        inside(r.right - 4, r.bottom - 4);
      const at = { x: r.x, y: r.y, width: r.width, height: r.height, zoom: view.current.scale, shown };
      const key = JSON.stringify(at);
      if (key === last) return;
      last = key;
      void invoke("browser_place", { label: web, ...at }).catch(() => {});
    };
    const loop = () => {
      frameId = requestAnimationFrame(loop);
      place();
    };
    // WebKit sets the zoom back to 1 for each new page: given again.
    replace.current = () => {
      last = "";
      place();
    };
    loop();
    return () => {
      cancelAnimationFrame(frameId);
      void invoke("browser_place", { label: web, x: 0, y: 0, width: 1, height: 1, zoom: 1, shown: false }).catch(() => {});
    };
  }, [web]);

  const agent = (name: string, args: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const w = frame.current?.contentWindow;
      const p = proxy.current;
      const label = onWeb.current ? browser.current : null;
      if (!label && (!w || !p)) return reject(new Error("The preview has no page open yet."));
      const id = nextCall++;
      pending.current.set(id, { resolve, reject });
      if (label)
        void invoke<boolean>("browser_eval", { label, js: `window.__slop ? (window.__slop.run(${id}, ${JSON.stringify(name)}, ${JSON.stringify(args)}), true) : false` })
          .then((ok) => {
            if (!ok && pending.current.delete(id)) reject(new Error("This page cannot be read or used yet: it may still be loading."));
          })
          .catch((e) => pending.current.delete(id) && reject(new Error(String(e))));
      else w!.postMessage({ __slopCmd: true, id, name, args }, `http://localhost:${p!.port}`);
      const wait = args.action === "wait" ? 15000 : 10000;
      setTimeout(() => {
        if (pending.current.delete(id))
          reject(new Error("The page did not answer. It may still be loading: take a screenshot, or try again."));
      }, wait);
    });

  /** A path, an address on this machine or the web, a search, or back, forward, reload. */
  const navigate = async (raw: string): Promise<string> => {
    const v = raw.trim();
    const p = proxy.current;
    if (v === "back" || v === "forward" || v === "reload") {
      const t = trail.current;
      const at = v === "back" ? t.at - 1 : v === "forward" ? t.at + 1 : t.at;
      const url = v === "reload" ? here.current : t.list[at];
      if (!url) return `There is no page to go ${v} to.`;
      if (v !== "reload") {
        t.at = at;
        t.stepping = true;
      }
      const done = nextLoad();
      go(url);
      await done;
      return `Now at ${display(here.current)}.`;
    }
    const host = hostOf(v);
    if (!host && !v.startsWith("/")) {
      const done = nextLoad();
      go(toWeb(v));
      await done;
      return `Now at ${display(here.current)}.`;
    }
    if (host && host !== hostOf(server.current ?? "")) {
      // Another server: the preview follows it (the effect above).
      onTarget(/^https?:/.test(v) ? v : `http://${v}`);
      return `Opening ${bare(v)}.`;
    }
    if (!p || !frame.current) throw new Error("The preview has no page open yet.");
    const path = host ? pathOf(v) : v.startsWith("/") ? v : `/${v}`;
    const done = nextLoad();
    go(`http://localhost:${p.port}${path}`);
    await done;
    return `Now at ${display(here.current)}.`;
  };

  /**
   * Whether real input can reach the page: always for a page from the web,
   * which has its own webview; for the frame, only while it is on screen and
   * nothing is over it, since the input lands at that point of the window.
   */
  const reachable = () => {
    if (!REAL) return false;
    if (onWeb.current) return !!browser.current;
    const el = frame.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width < 2) return false;
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el;
  };

  /**
   * Mouse and key events at CSS pixels of the page, as points in its webview.
   * Whether the window was active, as a hover needs it to be.
   */
  const real = async (acts: Act[]) => {
    const label = onWeb.current ? browser.current : null;
    const { scale: k } = view.current;
    const r = frame.current?.getBoundingClientRect();
    const ox = label ? 0 : (r?.x ?? 0);
    const oy = label ? 0 : (r?.y ?? 0);
    // Only when the keyboard is elsewhere in the app: focusing the frame's
    // window takes it from a frame inside the page that a click just gave it to.
    if (!label && document.activeElement !== frame.current) frame.current?.contentWindow?.focus();
    return invoke<boolean>("native_input", {
      view: label,
      acts: acts.map((a) => (a.x === undefined ? a : { ...a, x: ox + a.x * k, y: oy + (a.y ?? 0) * k })),
    });
  };

  /** One of Claude's `computer` actions done with real input, or null to leave it to the agent. */
  const act = async (a: Record<string, unknown>): Promise<string | null> => {
    const action = a.action as string;
    const clicks = { left_click: 1, right_click: 1, double_click: 2, triple_click: 3 } as Record<string, number>;
    if (clicks[action]) {
      const { x, y, what, native } = (await agent("locate", a)) as Located;
      // Its menu, file picker or color panel would open on the user's screen,
      // out of Claude's sight and reach, and stay there.
      if (native?.kind === "select")
        return `${what} is a dropdown, whose menu is the system's: it was not opened. Choose an option with form_input on ${native.ref}. Options: ${native.options}.`;
      if (native?.kind === "file")
        return `${what} opens the system's file picker, which you cannot use, so it was not opened. Files cannot be chosen from these tools.`;
      if (native?.kind === "color")
        return `${what} opens the system's color panel, which you cannot use, so it was not opened. Set a color with form_input on ${native.ref}, as #rrggbb.`;
      const button = action === "right_click" ? 2 : 0;
      const acts: Act[] = [{ kind: "move", x, y }];
      for (let n = 1; n <= clicks[action]; n++) acts.push({ kind: "down", x, y, button, clicks: n }, { kind: "up", x, y, button, clicks: n });
      await real(acts);
      void agent("press", { x, y }).catch(() => {});
      await sleep(250);
      const done = `Clicked ${what} at (${Math.round(x)}, ${Math.round(y)}).`;
      if (button === 2 && !(await agent("menu", {}).catch(() => true)))
        return `${done} The page has no menu of its own there; the browser's was kept closed.`;
      return done;
    }
    if (action === "hover") {
      const { x, y, what } = (await agent("locate", a)) as Located;
      // WebKit hit-tests a move only in the active window: with the app in
      // the back, the agent's events at least reach the page's own listeners.
      if (!(await real([{ kind: "move", x, y }])))
        return `${await agent("computer", a)} The app is behind other windows, so this reached the page's mouse listeners but not its :hover styles.`;
      await sleep(150);
      return `Hovering ${what}.`;
    }
    if (action === "left_click_drag") {
      const [x0, y0] = (a.start_coordinate as number[]) ?? [];
      const [x1, y1] = (a.coordinate as number[]) ?? [];
      if ([x0, y0, x1, y1].some((n) => typeof n !== "number")) throw new Error("A drag needs start_coordinate and coordinate.");
      // AppKit's drag session follows the real mouse, never these events: the agent drags instead.
      if (await agent("draggable", { x: x0, y: y0 })) return null;
      await agent("glide", { x: x0, y: y0 });
      await real([{ kind: "move", x: x0, y: y0 }, { kind: "down", x: x0, y: y0 }]);
      void agent("glide", { x: x1, y: y1 }).catch(() => {});
      const steps: Act[] = [];
      for (let i = 1; i <= 12; i++) steps.push({ kind: "drag", x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 });
      for (const step of steps) {
        await real([step]);
        await sleep(25);
      }
      await real([{ kind: "up", x: x1, y: y1 }]);
      await sleep(200);
      return `Dragged from (${x0}, ${y0}) to (${x1}, ${y1}).`;
    }
    if (action === "type") {
      const into = (await agent("focused", {})) as string | null;
      if (!into) throw new Error("Nothing has focus to type into: click a field first.");
      await real([{ kind: "text", text: String(a.text ?? "") }]);
      await sleep(150);
      return `Typed into ${into}.`;
    }
    if (action === "key") {
      const text = String(a.text ?? "").trim();
      // One at a time: the page takes keys in turn, but an edit (cmd+v) at once.
      for (const k of text.split(/\s+/)) {
        await real([{ kind: "key", text: k }]);
        await sleep(60);
      }
      await sleep(140);
      return `Pressed ${text}.`;
    }
    return null;
  };

  const resize = (next: Size | null) => {
    setSize(next);
    keepSize(root, next);
  };

  // Claude's calls (src-tauri/src/mcp.rs), by way of the workspace.
  const run = async (call: Call): Promise<unknown> => {
    switch (call.op) {
      case "frame": {
        // Drawn first: the tab may have just come to the front.
        await Promise.race([
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
          new Promise((r) => setTimeout(r, 200)),
        ]);
        // Claude's pointer is not part of the page, nor is the size over it:
        // gone at once, not faded out after the picture is taken.
        sizeBadge.current?.style.setProperty("display", "none");
        setBadge(false);
        await agent("veil", {}).catch(() => {});
        const label = onWeb.current ? browser.current : null;
        const r = (label ? sheet.current : frame.current)?.getBoundingClientRect();
        if (!r || (!label && !proxy.current)) throw new Error("The preview has no page open yet.");
        // Whole pixels inside the frame, so no edge of what surrounds it is caught.
        const x = Math.ceil(r.x);
        const y = Math.ceil(r.y);
        return {
          x,
          y,
          width: Math.floor(r.right) - x,
          height: Math.floor(r.bottom) - y,
          viewportWidth: view.current.vw,
          viewportHeight: view.current.vh,
          dpr: window.devicePixelRatio || 1,
          url: display(here.current),
          view: label,
        };
      }
      case "agent": {
        dialogs.current = [];
        let said = call.name === "computer" && reachable() ? await act(call.args) : null;
        if (said === null) said = (await agent(call.name, call.args)) as string;
        // A page from the web is heard by polling: heard once more, so a dialog the action set off is in its answer.
        if (onWeb.current && browser.current)
          (await invoke<Said[] | null>("browser_eval", { label: browser.current, js: DRAIN }).catch(() => null))?.forEach((m) => hear.current(m));
        if (dialogs.current.length) said += ` The page showed a dialog, answered OK: ${dialogs.current.join("; ")}.`;
        // The page knows itself by the proxy's address; Claude knows the dev server's.
        const p = proxy.current;
        return typeof said === "string" && p && server.current
          ? said.replaceAll(`http://localhost:${p.port}`, originOf(server.current))
          : said;
      }
      case "navigate":
        return navigate(call.url);
      case "resize": {
        const { width, height, preset } = call.args;
        if (preset === "fill") {
          resize(null);
          return "The viewport fills the tab again.";
        }
        const p = PRESETS.find((x) => x.id === preset);
        const w = clamp(p?.w ?? width ?? view.current.vw);
        const h = clamp(p?.h ?? height ?? view.current.vh);
        resize({ w, h });
        return `The viewport is now ${w}×${h}.`;
      }
      case "console": {
        const { pattern, only_errors, clear, limit } = call.args;
        let test: RegExp | null = null;
        try {
          test = pattern ? new RegExp(pattern, "i") : null;
        } catch {
          throw new Error(`Not a pattern: ${pattern}`);
        }
        const lines = log.current
          .filter((l) => (!only_errors || l.level === "error") && (!test || test.test(l.text)))
          .slice(-(limit ?? 100));
        if (clear) log.current = [];
        return lines.length ? lines.map((l) => `[${l.level}] ${l.text}`).join("\n") : "Nothing logged.";
      }
    }
  };
  const handle = useRef({ run });
  useEffect(() => {
    handle.current.run = run;
  });
  // Said in the toolbar while Claude is using the page, and for a moment after.
  const quiet = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () =>
      registerPreview(root, {
        run: (c) => {
          setClaude(true);
          clearTimeout(quiet.current);
          return handle.current.run(c).finally(() => {
            quiet.current = setTimeout(() => setClaude(false), 2500);
          });
        },
      }),
    [root],
  );

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const seen = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  // The size, in the middle, whenever it changes and for a moment after.
  const first = useRef(true);
  useEffect(() => {
    if (first.current || !vw || !vh) {
      first.current = !vw;
      return;
    }
    sizeBadge.current?.style.removeProperty("display");
    setBadge(true);
    const t = setTimeout(() => setBadge(false), 900);
    return () => clearTimeout(t);
  }, [vw, vh]);

  const drag = (edge: "x" | "y" | "xy") => (e: React.PointerEvent) => {
    e.preventDefault();
    // From filling the tab, the drag starts at the size that fits inside the handles.
    const from = fill ? { w: clamp(box.w - 2 * PAD), h: clamp(box.h - 2 * PAD), s: 1 } : { w: vw, h: vh, s: scale };
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last: Size = { w: from.w, h: from.h };
    // The frame would take the pointer's moves for its own page.
    document.body.dataset.dragging = "";
    const move = (m: PointerEvent) => {
      // Centred, so the edge follows the pointer when the width grows twice as fast.
      last = {
        w: edge === "y" ? from.w : clamp(from.w + (2 * (m.clientX - x0)) / from.s),
        h: edge === "x" ? from.h : clamp(from.h + (m.clientY - y0) / from.s),
      };
      setSize(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      delete document.body.dataset.dragging;
      keepSize(root, last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const bw = vw * scale;
  const bh = vh * scale;
  const left = fill ? 0 : (box.w - bw) / 2;
  const top = fill ? 0 : PAD;
  const dims = `${vw} × ${vh}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}`;
  const ready = (src !== null && !!target) || web !== null;

  return (
    <div className={cn("absolute inset-0 flex flex-col", !visible && "pointer-events-none invisible")}>
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border-gray px-1.5">
        <Tool label="Back" onClick={() => void navigate("back").catch(() => {})} disabled={!ready}>
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </Tool>
        <Tool label="Forward" onClick={() => void navigate("forward").catch(() => {})} disabled={!ready}>
          <path d="M6 3.5 10.5 8 6 12.5" />
        </Tool>
        <Tool label="Reload" onClick={() => void navigate("reload").catch(() => {})} disabled={!ready}>
          <path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 3v2.5H10" />
        </Tool>
        <form
          className="mx-1 min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft?.trim()) {
              const v = draft.trim();
              // No server yet: an address on this machine typed here is the one to preview.
              if (!target && hostOf(v)) onTarget(/^https?:/.test(v) ? v : `http://${v}`);
              else void navigate(v).catch(() => {});
            }
            setDraft(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            aria-label="Address"
            value={draft ?? shown}
            placeholder={target ? "" : "localhost:3000, or search the web"}
            onFocus={(e) => {
              setDraft(shown);
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") (e.target as HTMLElement).blur();
            }}
            spellCheck={false}
            className="h-6 w-full rounded-[6px] border border-border-gray bg-pure-white px-2 font-mono text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-deep-green/60"
          />
        </form>
        {/* The sizes a page is most often checked at, a click apart, as in Chrome's device toolbar. */}
        <div role="group" aria-label="Device" className="mr-1 flex shrink-0 items-center rounded-[7px] bg-surface-container p-0.5">
          {DEVICES.map((d) => {
            const p = PRESETS.find((x) => x.id === d.id);
            const on = p ? !!size && ((size.w === p.w && size.h === p.h) || (size.w === p.h && size.h === p.w)) : fill;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                title={p ? `${d.label} · ${p.w} × ${p.h}` : d.label}
                onClick={() => resize(p ? { w: p.w, h: p.h } : null)}
                className={cn(
                  "flex h-5 w-6 cursor-pointer items-center justify-center rounded-[5px]",
                  on ? "bg-pure-white text-ink shadow-[0_0_0_1px_var(--color-border-gray)]" : "text-muted-slate hover:text-ink",
                )}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {d.icon}
                </svg>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
          title="Viewport size: drag the page's right or bottom edge, or pick one"
          className="flex h-6 shrink-0 cursor-pointer items-center rounded-[6px] px-2 font-mono text-[11px] text-muted-slate tabular-nums hover:bg-surface-container hover:text-ink"
        >
          {vw && vh ? dims : "—"}
        </button>
        {claude ? (
          <span className="mr-1 flex shrink-0 items-center gap-1.5 rounded-full bg-[#d97757]/12 px-2 py-0.5 text-[11px] text-[#b4553a]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#d97757]" />
            Claude
          </span>
        ) : null}
        <Tool
          label="Open in your browser"
          onClick={() =>
            void invoke("preview_external", { url: isWeb(here.current) ? here.current : `http://${display(here.current)}` }).catch(() => {})
          }
          disabled={!ready}
        >
          <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4" />
        </Tool>
      </div>
      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          title="Viewport"
          onClose={() => setMenu(null)}
          items={[
            { label: "Fill the tab", onClick: () => resize(null), disabled: fill },
            ...PRESETS.map((p) => ({ label: `${p.label} · ${p.w} × ${p.h}`, onClick: () => resize({ w: p.w, h: p.h }) })),
            { label: "Rotate", onClick: () => size && resize({ w: size.h, h: size.w }), disabled: fill },
          ]}
        />
      ) : null}
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden bg-surface-container">
        {ready ? (
          <>
            <div
              ref={sheet}
              className={cn("absolute overflow-hidden bg-pure-white", !fill && "shadow-[0_0_0_1px_var(--color-border-strong)]")}
              style={{ left, top, width: bw, height: bh }}
            >
              {src ? (
                <iframe
                  ref={frame}
                  src={src}
                  title="Preview"
                  onLoad={loaded}
                  style={{ width: vw, height: vh, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "0 0" }}
                  className={cn("block border-0", web && "invisible")}
                />
              ) : null}
            </div>
            <Handle
              label="Resize width"
              cursor="cursor-ew-resize"
              style={{ left: Math.min(left + bw, box.w - 10), top, width: 10, height: bh }}
              onPointerDown={drag("x")}
              bar="h-8 w-1"
            />
            <Handle
              label="Resize height"
              cursor="cursor-ns-resize"
              style={{ left, top: Math.min(top + bh, box.h - 10), width: bw, height: 10 }}
              onPointerDown={drag("y")}
              bar="h-1 w-8"
            />
            <Handle
              label="Resize"
              cursor="cursor-nwse-resize"
              style={{ left: Math.min(left + bw, box.w - 12), top: Math.min(top + bh, box.h - 12), width: 12, height: 12 }}
              onPointerDown={drag("xy")}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-8 text-center">
            {error ? (
              <p className="font-mono text-[11.5px] text-clay-ink">{error}</p>
            ) : waiting ? (
              <>
                <p className="text-[13px] text-ink">Starting the dev server…</p>
                <p className="max-w-full truncate font-mono text-[11.5px] text-faint">{waiting}</p>
                <p className="text-[12px] text-muted-slate">The page opens here as soon as it prints its address.</p>
                {onShowServer ? (
                  <button type="button" onClick={onShowServer} className="mt-1 cursor-pointer text-[12px] text-deep-green hover:underline">
                    Show its terminal
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-[13px] text-ink">Nothing to preview yet</p>
                <p className="text-[12px] text-muted-slate">Type an address above, like localhost:3000, or anything to search the web.</p>
              </>
            )}
          </div>
        )}
        <div
          ref={sizeBadge}
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-night/80 px-3 py-1.5 font-mono text-[13px] text-white tabular-nums",
            // On at once, as Ghostty's is; it fades only on the way out, and
            // not at all in a hidden window, where the fade would never run.
            badge ? "opacity-100" : cn("opacity-0", typeof document !== "undefined" && document.visibilityState === "visible" && "transition-opacity duration-300"),
          )}
        >
          {dims}
        </div>
      </div>
    </div>
  );
}

function Tool({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-muted-slate hover:bg-surface-container hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** An edge of the viewport to drag, with a grip that shows on hover. */
function Handle({
  label,
  cursor,
  style,
  bar,
  onPointerDown,
}: {
  label: string;
  cursor: string;
  style: React.CSSProperties;
  bar?: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      onPointerDown={onPointerDown}
      style={style}
      className={cn("group absolute z-10 flex items-center justify-center", cursor)}
    >
      {bar ? <span className={cn("rounded-full bg-border-strong opacity-0 transition-opacity group-hover:opacity-100", bar)} /> : null}
    </div>
  );
}
