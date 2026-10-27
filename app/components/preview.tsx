"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Menu } from "@/components/menu";
import { PRESETS, hostOf, registerPreview, type Call } from "@/lib/preview";
import { cn } from "@/lib/utils";

/**
 * A project's running web app, in a workspace tab (components/workspace.tsx).
 * The page is framed through the app's proxy (src-tauri/src/preview.rs), which
 * adds an agent to it (agent.js): that is how the page's address and console
 * reach this tab, and how Claude reads and uses the page (lib/preview.ts).
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [ping, setPing] = useState<{ x: number; y: number; n: number } | null>(null);

  // What the calls below read: they outlive any one render.
  const proxy = useRef<{ id: number; port: number } | null>(null);
  const here = useRef("");
  const server = useRef(target);
  const log = useRef<Line[]>([]);
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
  const view = useRef({ vw, vh });
  useEffect(() => {
    view.current = { vw, vh };
    server.current = target;
  });

  /** The page's address as the dev server knows it, not the proxy. */
  const display = (url: string) => {
    const p = proxy.current;
    if (!p || !server.current) return bare(url);
    const mine = `http://localhost:${p.port}`;
    return bare(url.startsWith(mine) ? originOf(server.current) + url.slice(mine.length) : url);
  };

  /** Opens a page in the frame without a step in the window's history. */
  const go = (url: string) => {
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
    },
    [],
  );

  // What the agent in the page says: where it is, what it logged, its answers.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow || !e.data?.__slop) return;
      const m = e.data;
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
        log.current.push({ level: m.level, text: m.text });
        if (log.current.length > 1000) log.current.shift();
      } else if (m.type === "pointer") {
        setPing({ x: m.x, y: m.y, n: Date.now() });
      } else if (m.type === "reply") {
        const p = pending.current.get(m.id);
        if (!p) return;
        pending.current.delete(m.id);
        if (m.ok) p.resolve(m.value);
        else p.reject(new Error(m.value));
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

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

  const agent = (name: string, args: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const w = frame.current?.contentWindow;
      const p = proxy.current;
      if (!w || !p) return reject(new Error("The preview has no page open yet."));
      const id = nextCall++;
      pending.current.set(id, { resolve, reject });
      w.postMessage({ __slopCmd: true, id, name, args }, `http://localhost:${p.port}`);
      const wait = args.action === "wait" ? 15000 : 10000;
      setTimeout(() => {
        if (pending.current.delete(id))
          reject(new Error("The page did not answer. It may still be loading: take a screenshot, or try again."));
      }, wait);
    });

  /** A path, an address on this machine, or back, forward, reload. */
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
        const r = frame.current?.getBoundingClientRect();
        if (!r || !proxy.current) throw new Error("The preview has no page open yet.");
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
        };
      }
      case "agent": {
        const said = await agent(call.name, call.args);
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
  useEffect(() => registerPreview(root, { run: (c) => handle.current.run(c) }), [root]);

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
  const ready = src !== null && !!target;

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
              // No server yet: an address typed here is the one to preview.
              if (!target) onTarget(/^https?:/.test(v) ? v : `http://${v.replace(/^\/+/, "")}`);
              else void navigate(v).catch(() => {});
            }
            setDraft(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            aria-label="Address"
            value={draft ?? shown}
            placeholder={target ? "" : "localhost:3000"}
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
        <Tool
          label="Open in your browser"
          onClick={() => void invoke("preview_external", { url: `http://${display(here.current)}` }).catch(() => {})}
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
            <div className="absolute overflow-hidden bg-pure-white" style={{ left, top, width: bw, height: bh }}>
              <iframe
                ref={frame}
                src={src}
                title="Preview"
                onLoad={loaded}
                style={{ width: vw, height: vh, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "0 0" }}
                className={cn("block border-0", !fill && "shadow-[0_0_0_1px_var(--color-border-strong)]")}
              />
              {ping ? (
                <motion.span
                  key={ping.n}
                  aria-hidden
                  initial={{ opacity: 0.9, scale: 0.4 }}
                  animate={{ opacity: 0, scale: 1.8 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="pointer-events-none absolute size-5 rounded-full border-2 border-deep-green"
                  style={{ left: ping.x * scale - 10, top: ping.y * scale - 10 }}
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
                <p className="text-[12px] text-muted-slate">Type an address above, like localhost:3000.</p>
              </>
            )}
          </div>
        )}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-night/80 px-3 py-1.5 font-mono text-[13px] text-white tabular-nums",
            // On at once, as Ghostty's is; it fades only on the way out.
            badge ? "opacity-100" : "opacity-0 transition-opacity duration-300",
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
