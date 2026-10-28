"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { AgentIcon, CLAUDE, TerminalIcon, agentById, useAgents, type Agent } from "@/components/agents";
import { useMap } from "@/components/map-context";
import { Menu } from "@/components/menu";
import { Shell } from "@/components/shell";
import { Preview } from "@/components/preview";
import { Device, PLATFORM, type Platform } from "@/components/device";
import { announceAnswer, announceDraft } from "@/components/keep";
import { announceAct, type Act } from "@/lib/act";
import { clearPicks, onHand, onOpenClaude, prompt, retarget, section, tabEnded, tabStarted, unpick, usePicks } from "@/lib/context";
import { useLocation } from "@/components/chrome";
import { findAddress, hostOf, previewOf, type Call } from "@/lib/preview";
import { openSettings, readSettings } from "@/lib/settings";
import type { Exchange } from "@/lib/keep";
import { cn } from "@/lib/utils";

/**
 * The workspace: one window, floating over the map's right edge, with a row
 * of tabs. Every tab is a terminal — the user's shell on a pty in the open
 * map's checkout (components/shell.tsx) — opened straight into a coding agent
 * (components/agents.tsx) or as a plain shell, from the `+` menu. Quitting the
 * agent leaves the shell, in the same folder, and the strip under the terminal
 * starts one again. A tab's label says what is in front: Claude, another
 * agent, or the shell.
 *
 * Map context goes to a tab running Claude (lib/context.ts): the strip shows
 * what is waiting for its next prompt and what has gone.
 *
 * It floats rather than docks, so opening it never takes height or width from
 * the map, and its width gives way to the window's. Hiding it, or switching
 * tabs, never ends a program; a tab ends when it is closed or its shell exits.
 * Tabs belong to the project they were opened in.
 *
 * Besides terminals, a tab can be the project running: a Preview of its web
 * app (components/preview.tsx), or its phone app on the Android emulator or
 * the iOS Simulator (components/device.tsx). When a project with a web dev
 * server opens, its server starts in a tab of its own and the Preview opens
 * beside it, showing the page once the server prints its address. A project
 * with a phone app is offered its simulator, once; nothing is installed for
 * one until the user asks. Claude reaches the preview through the app's MCP
 * server (src-tauri/src/mcp.rs), and this is where its calls find the right
 * project's preview.
 *
 * A tab can be dragged out of the window onto the map, into the main view:
 * there it takes the map's place, with a strip of its own whose first tab is
 * the map, and it is dragged back the same way. A tab is the same tab in
 * either place: it is moved, never started again.
 */

const TOGGLE = "slop:workspace";
export const toggleWorkspace = () => window.dispatchEvent(new Event(TOGGLE));

const WIDTH_KEY = "slop.workspace.width";
const MIN_WIDTH = 380;
/** The gap kept around the window. */
const GAP = 12;
/** The custom title bar's height, in the desktop app. */
const TITLEBAR = 36;
/** The status bar's height (components/statusbar.tsx), which it floats above. */
const STATUSBAR = 24;

interface Tab {
  key: number;
  /** A terminal, or the project running: its web app, or a phone. */
  kind: "shell" | "preview" | Platform;
  /** The agent it opened into, or null for a plain shell. */
  start: string | null;
  /** The agent last started in it, from the menu or the strip: what a busy shell is running. */
  ran: string | null;
  /** The shell's own name, `zsh` for `/usr/bin/zsh`. */
  title: string;
  /** The checkout it was opened in: which project's tab it is. */
  cwd: string;
  /** The pty behind it, once started. */
  pty?: number;
  /** Claude is running in it, through the app's launcher. */
  live: boolean;
  /** Some other program is in front of the shell. */
  busy: boolean;
  /** Whether Claude Code was found for it; unknown while it starts. */
  found?: boolean;
  /** A command the app typed into it when it opened: the dev server, a setup, a build. */
  run?: string;
  /** What it is called instead of its shell's name, when the app opened it for something. */
  label?: string;
  /** It runs the dev server: its output is watched for the server's address. */
  dev?: boolean;
  /** Moved out of the window, into the main view in front of the map. */
  main?: boolean;
}

/** How a project is run, from its files (src-tauri/src/devices.rs). */
interface Project {
  web: string | null;
  android: boolean;
  ios: boolean;
}

const OFFER_KEY = "slop.offer:";

function offered(root: string) {
  try {
    return localStorage.getItem(OFFER_KEY + root) !== null;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls for something to exist, giving up after `ms`. */
async function until<T>(get: () => T | undefined, ms: number): Promise<T> {
  for (let waited = 0; waited < ms; waited += 100) {
    const v = get();
    if (v) return v;
    await sleep(100);
  }
  throw new Error("The preview did not open in time.");
}

function storedWidth() {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w >= MIN_WIDTH) return w;
  } catch {
    /* storage blocked: the default is fine */
  }
  return 640;
}

/** Tab keys, unique for the app's life. */
let nextKey = 1;

const noSubscribe = () => () => {};

export function Workspace() {
  const map = useMap();
  const here = map.RUN.root ?? "";
  // The section in front (components/tabs.tsx), which every prompt to Claude
  // here is told about without being shown (src-tauri/src/claude.rs, place).
  const { path, crumbs } = useLocation();
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  // Hidden once it has slid away, so it takes no clicks and no focus.
  const [settled, setSettled] = useState(true);
  const [open, setOpen] = useState(false);
  // Safe to read during render: nothing is drawn until a tab is opened.
  const [width, setWidth] = useState(storedWidth);
  const [tabs, setTabs] = useState<Tab[]>([]);
  // The tab last in view, per project.
  const [active, setActive] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // The tab in the main view, per project; none, or one moved away, is the map.
  const [front, setFront] = useState<Record<string, number | null>>({});
  const mine = tabs.filter((t) => t.cwd === here);
  const panel = mine.filter((t) => !t.main);
  const docked = mine.filter((t) => t.main);
  const current = panel.find((t) => t.key === active[here]) ?? panel.at(-1);
  const upFront = docked.find((t) => t.key === front[here]);
  // Where tab bodies are drawn: the window's and the main view's.
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
  const [mainSlot, setMainSlot] = useState<HTMLElement | null>(null);
  const mainPane = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<{ key: number; x: number; y: number; to: "main" | "panel" } | null>(null);
  const { agents, others, main: mainAgent } = useAgents();
  const main = mainAgent.id;
  const aside = useRef<HTMLElement>(null);
  // Text waiting to be pasted into a new tab's agent once it is up, by tab;
  // sent, not only pasted, when it carries a question.
  const [toPaste, setToPaste] = useState<Record<number, { text: string; send: boolean }>>({});

  const patch = (key: number, next: Partial<Tab>) =>
    setTabs((all) => all.map((x) => (x.key === key ? { ...x, ...next } : x)));

  const show = useCallback((next: boolean) => {
    setOpen(next);
    setSettled(false);
  }, []);

  const add = useCallback(
    (start: string | null, extra?: Partial<Tab>) => {
      const key = nextKey++;
      const cwd = extra?.cwd ?? here;
      setTabs((t) => [...t, { key, kind: "shell", start, ran: start, title: "terminal", cwd, live: false, busy: false, ...extra }]);
      setActive((a) => ({ ...a, [cwd]: key }));
      if (cwd === here) show(true);
      return key;
    },
    [here, show],
  );

  // Each project's dev server address, once it has printed one; and how each
  // project is run, read when it is first opened.
  const [servers, setServers] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [offers, setOffers] = useState<Record<string, boolean>>({});
  const tabsNow = useRef(tabs);
  useEffect(() => {
    tabsNow.current = tabs;
  });

  /** A project's one Preview tab: brought to the front, or opened. */
  const preview = useCallback(
    (root: string) => {
      const open = tabsNow.current.find((x) => x.kind === "preview" && x.cwd === root);
      if (!open) return add(null, { kind: "preview", title: "Preview", cwd: root });
      if (open.main) setFront((f) => ({ ...f, [root]: open.key }));
      else {
        setActive((a) => ({ ...a, [root]: open.key }));
        if (root === here) show(true);
      }
      return open.key;
    },
    [add, here, show],
  );

  /** This project's phone of a kind: brought to the front, or opened. */
  const phone = (platform: Platform) => {
    const open = mine.find((x) => x.kind === platform);
    if (!open) return add(null, { kind: platform, title: PLATFORM[platform].label });
    if (open.main) return setFront((f) => ({ ...f, [here]: open.key }));
    setActive((a) => ({ ...a, [here]: open.key }));
    show(true);
  };
  const touching = useRef(phone);
  useEffect(() => {
    touching.current = phone;
  });

  // A project opening for the first time this session: how it runs is read,
  // its dev server started with a Preview in front, and a phone app offered
  // its simulator.
  const launched = useRef(new Set<string>());
  useEffect(() => {
    if (!desktop || !here || launched.current.has(here)) return;
    launched.current.add(here);
    const root = here;
    invoke<Project>("project_detect", { root })
      .then((p) => {
        setProjects((all) => ({ ...all, [root]: p }));
        if (p.web && readSettings().devServer) {
          add(null, { run: p.web, dev: true, label: "dev server", cwd: root });
          add(null, { kind: "preview", title: "Preview", cwd: root });
        }
      })
      .catch(() => {});
  }, [desktop, here, add]);

  // The dev server's tab, read as it prints until it gives its address. Only
  // whole lines, so an address split across two reads is never taken short.
  const tails = useRef<Record<number, string>>({});
  const heard = (t: Tab, text: string) => {
    if (tails.current[t.key] === null) return;
    const tail = ((tails.current[t.key] ?? "") + text).slice(-4000);
    const url = findAddress(tail.slice(0, tail.lastIndexOf("\n") + 1));
    if (!url) {
      tails.current[t.key] = tail;
      return;
    }
    (tails.current as Record<number, string | null>)[t.key] = null;
    setServers((all) => ({ ...all, [t.cwd]: url }));
    preview(t.cwd);
  };

  // Claude's calls on the preview (src-tauri/src/mcp.rs): the project is the
  // one of the tab Claude runs in. A screenshot needs the preview on screen,
  // and so does a click or a key, to be real input (components/preview.tsx).
  const latest = useRef({ here, shown: false });
  const answer = async ({ id, tab, cmd }: { id: number; tab: number; cmd: Call }) => {
    const reply = (ok: boolean, value: unknown) => void invoke("preview_reply", { id, ok, value });
    try {
      const root = tabsNow.current.find((x) => x.pty === tab)?.cwd ?? latest.current.here;
      let handle = previewOf(root);
      if (!handle) {
        const asked = cmd.op === "navigate" && hostOf(cmd.url) ? (/^https?:/.test(cmd.url) ? cmd.url : `http://${cmd.url}`) : undefined;
        // Anything else to navigate to is a page from the web, which needs no server.
        const web = cmd.op === "navigate" && !asked && !cmd.url.trim().startsWith("/");
        if (!asked && !web && !servers[root])
          throw new Error(
            "No preview is open for this project, and no dev server has printed an address. Start the dev server in a terminal tab, or navigate to its address, like http://localhost:3000.",
          );
        if (asked) setServers((all) => ({ ...all, [root]: asked }));
        preview(root);
        handle = await until(() => previewOf(root), 8000);
        if (asked) return reply(true, `Opened ${asked} in the preview.`);
      }
      const seen = cmd.op === "frame" || (cmd.op === "agent" && cmd.name === "computer");
      if (seen && root === latest.current.here) {
        const hidden = !latest.current.shown;
        preview(root);
        await sleep(hidden ? 520 : 80);
        // A window behind others draws no frames, so the slide in never runs:
        // it is put where it would have ended.
        if (document.visibilityState === "hidden" && aside.current) aside.current.style.transform = "none";
      } else if (cmd.op === "frame") {
        throw new Error("That preview belongs to a project that is not open in the window, so it cannot be seen.");
      }
      reply(true, await handle.run(cmd));
    } catch (e) {
      reply(false, e instanceof Error ? e.message : String(e));
    }
  };
  // The latest of everything above, for a call that arrives between renders.
  const answering = useRef(answer);
  useEffect(() => {
    answering.current = answer;
    latest.current = { here, shown: open && panel.length > 0 };
  });
  useEffect(() => {
    if (!desktop) return;
    const off = listen<{ id: number; tab: number; cmd: Call }>("slop:preview", (e) => void answering.current(e.payload));
    // Claude touching a phone brings its tab forward, as acting on a page brings the Preview.
    const touched = listen<{ platform: Platform }>("slop:device-touch", (e) => {
      const { here } = latest.current;
      if (tabsNow.current.some((t) => t.kind === e.payload.platform && t.cwd === here)) touching.current(e.payload.platform);
    });
    return () => {
      void off.then((f) => f());
      void touched.then((f) => f());
    };
  }, [desktop]);

  const select = useCallback(
    (key: number) => {
      if (tabsNow.current.find((x) => x.key === key)?.main) setFront((f) => ({ ...f, [here]: key }));
      else setActive((a) => ({ ...a, [here]: key }));
    },
    [here],
  );
  /** A tab in view, wherever it is: the window is opened for one of its own. */
  const bring = useCallback(
    (key: number) => {
      select(key);
      if (!tabsNow.current.find((x) => x.key === key)?.main) show(true);
    },
    [select, show],
  );

  // What is in front in each tab: Claude (the launcher keeps a marker), some
  // other program, or the shell at its prompt. Polled, since programs start
  // and quit inside the shell, unseen.
  // A turn of Claude's that edited the checkout, or found the map wrong,
  // updates that project's map. Separately, EVERY finished turn is offered to
  // the map as an answer worth keeping (components/keep.tsx) — a turn that only
  // explained something edits nothing, so `turn` never fires for the very case
  // a reader most wants to keep.
  const started = JSON.stringify(tabs.filter((t) => t.pty !== undefined).map((t) => [t.key, t.pty, t.cwd]));
  useEffect(() => {
    const ids: [number, number, string][] = JSON.parse(started);
    if (!ids.length) return;
    const tick = () =>
      ids.forEach(([key, pty, cwd]) =>
        invoke<{ claude: boolean; busy: boolean; turn: Turn | null; ended: string | null; acts: Act[] }>("pty_state", { id: pty })
          .then(({ claude: live, busy, turn, ended, acts }) => {
            if (turn && cwd) void updateMap(cwd, turn);
            if (ended) void offerAnswer(ended);
            // Mid-turn, deliberately: Claude shows a section while it is still
            // explaining it (lib/act.ts).
            acts?.forEach(announceAct);
            // Same array when nothing moved: a new one every tick would reset
            // the paste effect's timer below before it could ever fire.
            setTabs((all) =>
              all.some((x) => x.key === key && (x.live !== live || x.busy !== busy))
                ? all.map((x) => (x.key === key ? { ...x, live, busy } : x))
                : all,
            );
          })
          .catch(() => {}),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started]);

  // A new tab's agent is up once something is in front of its shell; give it
  // a moment to draw its prompt, then paste what was handed to it.
  useEffect(() => {
    const ready = tabs.filter((t) => t.busy && t.pty !== undefined && toPaste[t.key] !== undefined);
    if (!ready.length) return;
    const timer = setTimeout(() => {
      for (const t of ready) (toPaste[t.key].send ? prompt : paste)(t.pty!, toPaste[t.key].text);
      setToPaste((all) => {
        const rest = { ...all };
        for (const t of ready) delete rest[t.key];
        return rest;
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [tabs, toPaste]);

  // Where the reader is, kept beside every tab of this project, so whatever
  // runs Claude there can say "you are reading X" without a pick in the strip.
  const reading = `[Reading now: ${[map.RUN.repo, ...crumbs.map((c) => c.title)].join(" › ")}]\n${section(map, path).text}`;
  const terminals = JSON.stringify(tabs.filter((t) => t.cwd === here && t.pty !== undefined).map((t) => t.pty));
  useEffect(() => {
    for (const id of JSON.parse(terminals) as number[]) void invoke("context_where", { id, text: reading }).catch(() => {});
  }, [terminals, reading]);

  // Picks go to the tab in view if Claude runs there, else this project's
  // newest tab running it; with none, a pick opens a tab (lib/context.ts).
  const claudeHere =
    (current?.live ? current.pty : undefined) ??
    (upFront?.live ? upFront.pty : undefined) ??
    mine.findLast((t) => t.live && t.pty !== undefined)?.pty ??
    null;
  useEffect(() => retarget(claudeHere), [claudeHere]);

  const close = useCallback(
    (key: number) => {
      const gone = tabs.find((x) => x.key === key);
      if (!gone) return;
      const rest = tabs.filter((x) => x.key !== key);
      setTabs(rest);
      if (gone.pty !== undefined) tabEnded(gone.pty);
      // The neighbour in the same place takes over: in the window, whose last
      // one closing hides it; in the main view, where none left is the map.
      const near = (x: Tab) => x.cwd === gone.cwd && !x.main === !gone.main;
      const group = tabs.filter(near);
      const left = rest.filter(near);
      const i = group.findIndex((x) => x.key === key);
      const next = left[Math.min(i, left.length - 1)]?.key;
      if (gone.main) {
        if (front[gone.cwd] === key) setFront((f) => ({ ...f, [gone.cwd]: next ?? null }));
      } else {
        if (active[gone.cwd] === key) setActive((a) => ({ ...a, [gone.cwd]: next ?? -1 }));
        if (!left.length && gone.cwd === here) show(false);
      }
    },
    [tabs, active, front, here, show],
  );

  useEffect(() => {
    const toggle = () => (open && panel.length ? show(false) : panel.length ? show(true) : add(main));
    // Asked for from the map: a tab running Claude, shown; or a new one.
    const toClaude = () => {
      const last = (current?.live ? current : undefined) ?? (upFront?.live ? upFront : undefined) ?? mine.findLast((t) => t.live);
      if (!last) return add(CLAUDE.id);
      bring(last.key);
    };
    // Capture phase, so the shortcut wins before xterm's own textarea sees
    // the key and sends it to the program.
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Shift+T: a new tab running the default agent.
      if (e.code === "KeyT" && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        add(main);
        return;
      }
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      // Ctrl+T: a new terminal tab.
      if (e.code === "KeyT" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        add(null);
        return;
      }
      // Ctrl+W closes the tab in view, as in a browser — only from inside the
      // window, so the map never loses a tab to a stray key.
      if (e.code === "KeyW" && !e.shiftKey) {
        const into = e.target as globalThis.Node;
        const tab = aside.current?.contains(into) ? current : mainPane.current?.contains(into) ? upFront : undefined;
        if (!tab) return;
        e.preventDefault();
        e.stopPropagation();
        close(tab.key);
        return;
      }
      if (e.code !== "Backquote" || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    // Handed to an agent other than Claude: pasted into a tab running it,
    // or into a new one once it is up; with a question, sent as a prompt.
    const toAgent = (agent: string, t: { text: string }, question?: string) => {
      const text = question ? `${t.text}\n\n${question}` : t.text;
      const running = mine.find((x) => x.pty !== undefined && inFront(x)?.id === agent);
      if (running) {
        (question ? prompt : paste)(running.pty!, text);
        bring(running.key);
        return;
      }
      const key = add(agent);
      setToPaste((all) => ({ ...all, [key]: { text, send: !!question } }));
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOGGLE, toggle);
    const off = onOpenClaude(toClaude);
    const offHand = onHand(toAgent);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
      off();
      offHand();
    };
  }, [open, mine, panel, current, upFront, main, add, close, bring, show]);

  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    // A preview's frame would take the pointer's moves for its own page.
    document.body.dataset.dragging = "";
    const from = e.clientX;
    // What is on screen, which a narrow window may have clamped.
    const start = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
    let last = start;
    const move = (m: PointerEvent) => {
      last = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 2 * GAP, start + from - m.clientX));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      delete document.body.dataset.dragging;
      try {
        localStorage.setItem(WIDTH_KEY, String(last));
      } catch {
        /* not kept; it still applies until reload */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const shown = open && panel.length > 0;

  /** Where the window is, or would be: dropped there, a tab goes back into it. */
  const panelLeft = () => window.innerWidth - GAP - Math.min(width, window.innerWidth - 2 * GAP);

  // A tab dragged from either strip: onto the window's side it goes there,
  // anywhere else into the main view. A press that hardly moves is a click,
  // so the button's own click only selects from the keyboard.
  const grab = (t: Tab) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-close]")) return;
    const handle = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let to: "main" | "panel" | null = null;
    const move = (m: PointerEvent) => {
      if (to === null && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
      if (to === null) {
        handle.setPointerCapture(e.pointerId);
        // A preview's frame would take the pointer's moves for its own page.
        document.body.dataset.dragging = "";
      }
      to = m.clientX >= panelLeft() ? "panel" : "main";
      setDragging({ key: t.key, x: m.clientX, y: m.clientY, to });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Hardly moved: a click, which selects the tab.
      if (to === null) return select(t.key);
      delete document.body.dataset.dragging;
      setDragging(null);
      const main = to === "main";
      if (main !== !!t.main) patch(t.key, { main });
      if (main) setFront((f) => ({ ...f, [t.cwd]: t.key }));
      else {
        setActive((a) => ({ ...a, [t.cwd]: t.key }));
        show(true);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const nameOf = (t: Tab) => {
    const i = mine.indexOf(t);
    const front = inFront(t);
    return t.kind === "preview"
      ? "Preview"
      : t.kind !== "shell"
        ? PLATFORM[t.kind].label
        : front
          ? `${front.command.replace(/^slop-/, "")} ${i + 1}`
          : (t.label ?? `${t.title} ${i + 1}`);
  };
  const iconOf = (t: Tab) => {
    const front = inFront(t);
    return t.kind === "preview" ? <GlobeIcon /> : t.kind !== "shell" ? <PhoneIcon /> : front ? <AgentIcon id={front.id} /> : <TerminalIcon />;
  };

  /** A tab in either strip, drawn as an editor draws one. */
  const tabView = (t: Tab, selected: boolean) => (
    <div
      key={t.key}
      role="tab"
      aria-selected={selected}
      onPointerDown={grab(t)}
      title="Drag onto the map to open it in the main view, or back onto the window"
      className={cn(
        "group flex shrink-0 cursor-default items-center gap-2 border-r border-border-gray pl-3 pr-2 text-[12px]",
        selected ? "bg-surface-container-low text-ink" : "border-b text-muted-slate hover:text-ink",
        dragging?.key === t.key && "opacity-40",
      )}
    >
      <button type="button" onClick={(c) => c.detail === 0 && select(t.key)} className="flex cursor-pointer items-center gap-1.5">
        {iconOf(t)}
        {nameOf(t)}
      </button>
      <button
        type="button"
        data-close
        onClick={() => close(t.key)}
        aria-label={`Close ${nameOf(t)}`}
        className="flex size-[18px] cursor-pointer items-center justify-center rounded-[4px] text-faint opacity-0 hover:bg-surface-container hover:text-ink group-hover:opacity-100 group-aria-selected:opacity-100"
      >
        ×
      </button>
    </div>
  );
  const project = projects[here];
  const phones = (["ios", "android"] as const).filter((p) => project?.[p]);
  const offer =
    phones.length && !offers[here] && !offered(here) && !mine.some((t) => t.kind === "ios" || t.kind === "android") ? (
      <Offer
        phones={phones}
        onPick={(p) => {
          phone(p);
          setOffers((all) => ({ ...all, [here]: true }));
        }}
        onDismiss={() => {
          try {
            localStorage.setItem(OFFER_KEY + here, "1");
          } catch {
            /* asked again next time */
          }
          setOffers((all) => ({ ...all, [here]: true }));
        }}
      />
    ) : null;
  if (!tabs.length) return offer;
  return (
    <>
    {offer}
    <motion.aside
      ref={aside}
      aria-label="Workspace"
      aria-hidden={!shown}
      initial={{ x: "110%" }}
      animate={{ x: shown ? 0 : "110%" }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      onAnimationComplete={() => setSettled(true)}
      style={{
        top: (desktop ? TITLEBAR : 0) + GAP,
        bottom: STATUSBAR + GAP,
        right: GAP,
        // Never wider than the window allows, whatever was dragged out before.
        width: `min(${width}px, calc(100vw - ${2 * GAP}px))`,
        visibility: !shown && settled ? "hidden" : "visible",
      }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-[10px] border border-border-gray bg-surface-container-low shadow-[0_8px_28px_-8px_rgba(26,26,46,0.14)]"
    >
      <div
        onPointerDown={drag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        className="absolute inset-y-6 left-0 z-10 w-1.5 cursor-col-resize hover:bg-deep-green/20"
      />
      {/* Tabs as an editor draws them: the open one is the colour of the
          pane below it and has no line under it, so it reads as the front of
          the terminal rather than a pill above it. */}
      <header className="flex h-9 shrink-0 items-stretch bg-surface-container" role="tablist">
        <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
          {panel.map((t) => tabView(t, t.key === current?.key))}
        </div>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
          aria-label="New tab"
          aria-haspopup="menu"
          title="New tab (Ctrl+T for a terminal, Ctrl+Shift+T for the default agent)"
          className="flex w-9 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[15px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
        >
          +
        </button>
        <div className="flex-1 border-b border-border-gray" />
        <button
          type="button"
          onClick={() => show(false)}
          aria-label="Hide workspace"
          title="Hide (Ctrl+`) — everything keeps running. Ctrl+W closes a tab."
          className="flex w-9 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[12px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
        >
          ✕
        </button>
      </header>
      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // The default agent first, then the rest in their usual order.
            ...[...agents]
              .sort((a, b) => Number(b.id === main) - Number(a.id === main))
              .map((a) => ({ label: a.label, icon: <AgentIcon id={a.id} />, onClick: () => add(a.id) })),
            { label: "Terminal", icon: <TerminalIcon />, onClick: () => add(null) },
            { label: "Preview", icon: <GlobeIcon />, onClick: () => preview(here) },
            ...phones.map((p) => ({ label: PLATFORM[p].label === "iOS" ? "iOS Simulator" : "Android emulator", icon: <PhoneIcon />, onClick: () => phone(p) })),
          ]}
        />
      ) : null}
      <div ref={setPanelSlot} className="relative min-h-0 flex-1 pt-1.5" />
      {/* Under the terminal, beside where a prompt is typed: Claude Code draws
          its input at the foot of the tab, so what the next prompt will carry
          sits next to it rather than across the top of the window. */}
      {current?.pty !== undefined ? (
        <Strip
          tab={current}
          pty={current.pty}
          agents={current.found === false ? others : agents}
          onRun={(id) => patch(current.key, { ran: id })}
        />
      ) : null}
    </motion.aside>
    <section
      ref={mainPane}
      aria-label="Main view"
      hidden={!docked.length}
      style={{ top: desktop ? TITLEBAR : 0, bottom: STATUSBAR }}
      className="pointer-events-none fixed inset-x-0 z-30 flex flex-col"
    >
      <header role="tablist" className="pointer-events-auto flex h-9 shrink-0 items-stretch bg-surface-container">
        <div
          role="tab"
          aria-selected={!upFront}
          className={cn(
            "flex shrink-0 items-center border-r border-border-gray px-3 text-[12px]",
            upFront ? "border-b text-muted-slate hover:text-ink" : "bg-surface-container-low text-ink",
          )}
        >
          <button type="button" onClick={() => setFront((f) => ({ ...f, [here]: null }))} className="flex cursor-pointer items-center gap-1.5">
            <MapIcon />
            Map
          </button>
        </div>
        <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
          {docked.map((t) => tabView(t, t.key === upFront?.key))}
        </div>
        <div className="flex-1 border-b border-border-gray" />
      </header>
      <div
        ref={setMainSlot}
        className={cn("relative min-h-0 flex-1 bg-surface-container-low", upFront ? "pointer-events-auto" : "invisible")}
      />
      {upFront?.pty !== undefined ? (
        <div className="pointer-events-auto bg-surface-container-low">
          <Strip
            tab={upFront}
            pty={upFront.pty}
            agents={upFront.found === false ? others : agents}
            onRun={(id) => patch(upFront.key, { ran: id })}
          />
        </div>
      ) : null}
    </section>
    {dragging ? (
      <>
        {/* Where the tab will go, shown before it is let go. */}
        <div
          aria-hidden
          style={
            dragging.to === "panel"
              ? { top: (desktop ? TITLEBAR : 0) + GAP, bottom: STATUSBAR + GAP, right: GAP, left: panelLeft() }
              : { top: desktop ? TITLEBAR : 0, bottom: STATUSBAR, left: 0, right: shown ? window.innerWidth - panelLeft() + GAP : 0 }
          }
          className="pointer-events-none fixed z-50 rounded-[10px] border-2 border-dashed border-deep-green/60 bg-deep-green/8"
        />
        <div
          aria-hidden
          style={{ left: dragging.x + 12, top: dragging.y + 10 }}
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-[6px] border border-border-gray bg-pure-white px-2.5 py-1 text-[12px] text-ink shadow-lift"
        >
          {(() => {
            const t = tabs.find((x) => x.key === dragging.key);
            return t ? (
              <>
                {iconOf(t)}
                {nameOf(t)}
                <span className="text-faint">→ {dragging.to === "panel" ? "window" : "main view"}</span>
              </>
            ) : null;
          })()}
        </div>
      </>
    ) : null}
    {tabs.map((t) => {
          const visible = t.main ? t.cwd === here && t.key === upFront?.key : shown && t.key === current?.key;
          const slot = t.main ? mainSlot : panelSlot;
          if (t.kind === "preview") {
            const dev = tabs.find((x) => x.dev && x.cwd === t.cwd);
            return (
              <Held key={t.key} slot={slot}>
              <Preview
                root={t.cwd}
                target={servers[t.cwd]}
                visible={visible}
                waiting={servers[t.cwd] ? undefined : dev?.run}
                onTarget={(url) => setServers((all) => ({ ...all, [t.cwd]: url }))}
                onShowServer={dev ? () => bring(dev.key) : undefined}
                docked={!!t.main}
              />
              </Held>
            );
          }
          if (t.kind !== "shell")
            return (
              <Held key={t.key} slot={slot}>
              <Device
                platform={t.kind}
                root={t.cwd}
                visible={visible}
                onCommand={(command, label) => add(null, { run: command, label, cwd: t.cwd })}
              />
              </Held>
            );
          return (
          <Held key={t.key} slot={slot}>
          <Shell
            startClaude={t.start === CLAUDE.id}
            run={t.run ?? (t.start && t.start !== CLAUDE.id ? agentById(t.start)?.command : undefined)}
            cwd={t.cwd || undefined}
            visible={visible}
            onOutput={t.dev ? (text) => heard(t, text) : undefined}
            onTitle={(title) => patch(t.key, { title })}
            onClaude={(found) => patch(t.key, { found })}
            onSpawn={(pty) => {
              patch(t.key, { pty });
              tabStarted(pty, t.start === CLAUDE.id);
            }}
            onExit={() => close(t.key)}
          />
          </Held>
          );
        })}
    </>
  );
}

/**
 * A tab's body, drawn into one element for the tab's life and moved, never
 * drawn again, between the window and the main view: a terminal drawn again
 * would be a new shell.
 */
function Held({ slot, children }: { slot: HTMLElement | null; children: React.ReactNode }) {
  const [box] = useState(() => {
    if (typeof document === "undefined") return null;
    // No box of its own: the body is laid out in the slot, and a hidden tab's
    // holder never lies over the one in view.
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  });
  useLayoutEffect(() => {
    if (box && slot && box.parentElement !== slot) slot.appendChild(box);
  }, [box, slot]);
  useEffect(() => () => box?.remove(), [box]);
  return box ? createPortal(children, box) : null;
}

/** The map, as the main view's first tab. */
function MapIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3 shrink-0">
      <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5Z" />
      <path d="M5.5 2v10.5M10.5 3.5V14" />
    </svg>
  );
}

/**
 * A project with a phone app is asked, once, whether to run it here. Picking
 * one opens its tab, which says what it needs before anything is installed.
 */
function Offer({ phones, onPick, onDismiss }: { phones: Platform[]; onPick: (p: Platform) => void; onDismiss: () => void }) {
  const what = phones.length > 1 ? "iOS and Android apps" : phones[0] === "ios" ? "an iOS app" : "an Android app";
  return (
    <motion.div
      role="dialog"
      aria-label="Run the phone app here"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ bottom: STATUSBAR + GAP }}
      className="fixed left-3 z-40 flex max-w-[340px] flex-col gap-2.5 rounded-[10px] border border-border-gray bg-pure-white p-3.5 shadow-lift"
    >
      <p className="text-[13px] leading-snug text-ink">
        This project has {what}. Run {phones.length > 1 ? "them" : "it"} here, in the app?
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {phones.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-border-strong px-2.5 py-1 text-[12px] text-ink hover:bg-surface-container"
          >
            <PhoneIcon />
            {p === "ios" ? "iOS Simulator" : "Android emulator"}
          </button>
        ))}
        <button type="button" onClick={onDismiss} className="ml-auto cursor-pointer px-1 text-[12px] text-faint hover:text-ink">
          Not now
        </button>
      </div>
    </motion.div>
  );
}

/** A page: the Preview tab. Drawn like the terminal glyph. */
function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden className="size-3 shrink-0">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2Z" />
    </svg>
  );
}

/** A phone: the iOS and Android tabs. */
function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden className="size-3 shrink-0">
      <rect x="4" y="1.5" width="8" height="13" rx="2" />
      <path d="M7 12h2" />
    </svg>
  );
}

/**
 * A turn of Claude's the map follows (src-tauri/src/claude.rs): its session's
 * transcript, for what it did and why, and the sections it reported wrong
 * with slop-map-fix.
 */
interface Turn {
  transcript: string | null;
  corrections: { section: string; note: string }[];
}

/**
 * Asks for the map of the project at `root` to be brought up to its code
 * (lib/vault.ts): only the sections the edits touched, or the agent found
 * wrong, are redone, by the same Claude Code the tabs run. Nothing happens
 * for a map that is not the user's own project.
 */
async function updateMap(root: string, turn: Turn) {
  const found = await invoke<{ path: string } | null>("claude_detect", { configured: readSettings().claudePath || null }).catch(() => null);
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "update", root, claude: found?.path, turn }),
  })
    .then((r) => r.json())
    .catch(() => null);
  // Not one of the user's projects: the title bar says so, and offers to import it.
  if (res?.skipped) window.dispatchEvent(new CustomEvent(UNFOLLOWED, { detail: root }));
}

/**
 * Reads back what Claude just asked and answered, and offers it to the map.
 *
 * A draft the reader asked for (components/keep.tsx) comes back as an ordinary
 * answer, so it is announced on its own channel first: the dialog is waiting
 * for one and the level is not.
 */
async function offerAnswer(transcript: string) {
  const r = await fetch(`/api/answer?transcript=${encodeURIComponent(transcript)}`)
    .then((x) => x.json())
    .catch(() => null);
  const e = r?.exchange as Exchange | null | undefined;
  if (!e?.said) return;
  if (!announceDraft(e.said)) announceAnswer(e);
}

/** An agent edited a checkout whose map cannot follow it; the detail is the checkout. */
export const UNFOLLOWED = "slop:map-unfollowed";

/**
 * Puts text in a program's prompt as a paste, without pressing Enter: agents'
 * TUIs ask for bracketed paste, so it lands as one block they can tell from
 * typing.
 */
function paste(pty: number, text: string) {
  void invoke("pty_write", { id: pty, data: `\x1b[200~${text}\x1b[201~` });
}

/**
 * The agent in front in a tab, if any: Claude when its launcher says so,
 * else the agent last started there while the shell is busy with something.
 */
function inFront(t: Tab): Agent | undefined {
  if (t.live) return CLAUDE;
  if (t.busy && t.ran !== CLAUDE.id) return agentById(t.ran ?? undefined);
  return undefined;
}

/**
 * The line under the terminal. With Claude running: the map context handed to
 * it, waiting (◷) until the next prompt takes it, then sent (✓); only a
 * waiting one can still be taken back. With the shell at its prompt: the
 * agents to start here. With anything else in front, only waiting picks.
 */
function Strip({
  tab,
  pty,
  agents,
  onRun,
}: {
  tab: Tab;
  pty: number;
  agents: Agent[];
  onRun: (id: string) => void;
}) {
  const picks = usePicks(pty);
  const idle = !tab.live && !tab.busy;
  if (!tab.live && !idle && !picks.length) return null;
  const run = (a: Agent) => {
    onRun(a.id);
    void invoke("pty_write", { id: pty, data: `${a.command}\r` });
  };
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-torder-gray px-3 py-1.5 font-mono text-[11px] [scrollbar-width:none]">
      {tab.live ? <span className="shrink-0 text-faint">context</span> : null}
      {idle
        ? agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => run(a)}
              title={
                a.id === CLAUDE.id
                  ? "Runs slop-claude in this shell: your Claude Code, able to take map context"
                  : `Runs ${a.command} in this shell`
              }
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-border-strong px-2 py-px text-ink hover:bg-surface-container"
            >
              <AgentIcon id={a.id} />
              {a.id === CLAUDE.id ? "Claude" : a.label}
            </button>
          ))
        : null}
      {idle && tab.found === false ? (
        <span className="shrink-0 text-faint">
          Claude Code was not found.{" "}
          <button type="button" onClick={openSettings} className="cursor-pointer text-deep-green underline">
            Open Settings
          </button>
        </span>
      ) : null}
      {picks.map((p) => (
        <span
          key={p.key}
          title={p.status === "queued" ? "Goes with the next prompt to Claude here" : "Sent to Claude"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-px",
            p.status === "queued" ? "border-deep-green/50 text-ink" : "border-border-gray text-faint",
          )}
        >
          <span aria-hidden className={p.status === "queued" ? "text-deep-green" : undefined}>
            {p.status === "queued" ? "◷" : "✓"}
          </span>
          {p.title}
          <button
            type="button"
            onClick={() => void unpick(pty, p.key)}
            aria-label={`Remove ${p.title}`}
            className="cursor-pointer text-faint hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      {picks.length ? (
        <button
          type="button"
          onClick={() => void clearPicks(pty)}
          className="ml-1 shrink-0 cursor-pointer text-faint hover:text-ink"
        >
          clear
        </button>
      ) : tab.live ? (
        <span className="truncate text-faint/80">right-click a card on the map to add it</span>
      ) : null}
    </div>
  );
}
