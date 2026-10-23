"use client";

import "@xterm/xterm/css/xterm.css";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { claudeEnded, claudeFocused, claudeStarted, clearPicks, onOpenClaude, unpick, usePicks } from "@/lib/context";
import { openSettings, readSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * A terminal along the bottom of the window, the way VS Code has one.
 *
 * Ctrl+` shows and hides it, Ctrl+Shift+` opens another shell. Shells run in
 * the mapped repo (src-tauri/src/pty.rs), so the code a card quotes is one
 * `cd`-free command away. Hiding the panel or switching tabs never ends a
 * shell — every tab stays mounted, only out of sight — so scrollback and a
 * running process survive a toggle. A shell ends when its tab is closed or it
 * exits by itself.
 *
 * A tab can run Claude Code instead of a shell. Sections picked on the map go
 * to it (lib/context.ts), and the strip above it shows what is waiting for
 * the next prompt and what has gone.
 */

/** Anything can ask for the panel: the chrome's button dispatches this. */
const TOGGLE = "slop:terminal";
export const toggleTerminal = () => window.dispatchEvent(new Event(TOGGLE));

const HEIGHT_KEY = "slop.terminal.height";
const MIN_HEIGHT = 120;
/** What the map keeps, however far the panel is dragged up. */
const MAP_RESERVE = 160;

/** The palette, dark: a terminal reads as a separate tool, not another card. */
const THEME = {
  background: "#1a1a2e",
  foreground: "#e7e5e0",
  cursor: "#cfe6d4",
  cursorAccent: "#1a1a2e",
  selectionBackground: "#404945",
  black: "#1a1a2e",
  red: "#e0b3a5",
  green: "#9fd3b0",
  yellow: "#e2c77e",
  blue: "#9cb8e0",
  magenta: "#c9a8de",
  cyan: "#8fd0c8",
  white: "#e7e5e0",
  brightBlack: "#6b7280",
  brightRed: "#f0c4b6",
  brightGreen: "#cfe6d4",
  brightYellow: "#f2dca0",
  brightBlue: "#bcd0ee",
  brightMagenta: "#ddc2ec",
  brightCyan: "#b4e3dc",
  brightWhite: "#ffffff",
};

interface Tab {
  key: number;
  title: string;
  kind: "shell" | "claude";
  /** The pty behind it, once started. */
  pty?: number;
}

function storedHeight() {
  try {
    const h = Number(localStorage.getItem(HEIGHT_KEY));
    if (h >= MIN_HEIGHT) return h;
  } catch {
    /* storage blocked: the default is fine */
  }
  return 300;
}

export function TerminalPanel() {
  const [shown, setShown] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<number | null>(null);
  // Safe to read during render: the panel renders nothing until a tab is
  // opened, so the prerendered page never depends on it.
  const [height, setHeight] = useState(storedHeight);
  const nextKey = useRef(1);

  const add = useCallback((kind: Tab["kind"] = "shell") => {
    const key = nextKey.current++;
    setTabs((t) => [...t, { key, title: kind === "claude" ? "claude" : "terminal", kind }]);
    setActive(key);
    setShown(true);
  }, []);

  const select = useCallback(
    (key: number) => {
      setActive(key);
      const pty = tabs.find((t) => t.key === key && t.kind === "claude")?.pty;
      if (pty !== undefined) claudeFocused(pty);
    },
    [tabs],
  );

  // The Claude tab picks go to, shown; or a new one when there is none.
  const showClaude = useCallback(() => {
    const last = tabs.findLast((t) => t.kind === "claude");
    if (!last) return add("claude");
    select(last.key);
    setShown(true);
  }, [tabs, add, select]);

  const close = useCallback(
    (key: number) => {
      const i = tabs.findIndex((x) => x.key === key);
      if (i < 0) return;
      const rest = tabs.filter((x) => x.key !== key);
      setTabs(rest);
      if (tabs[i].pty !== undefined && tabs[i].kind === "claude") claudeEnded(tabs[i].pty);
      // The neighbour takes over, as in VS Code; the last one closing hides the panel.
      if (active === key) setActive(rest[Math.min(i, rest.length - 1)]?.key ?? null);
      if (!rest.length) setShown(false);
    },
    [tabs, active],
  );

  const toggle = useCallback(() => {
    if (!tabs.length) add();
    else setShown((s) => !s);
  }, [tabs.length, add]);

  // Capture phase, so the shortcut wins before xterm's own textarea sees the
  // key and sends it to the shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== "Backquote") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) add();
      else toggle();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOGGLE, toggle);
    const offClaude = onOpenClaude(showClaude);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
      offClaude();
    };
  }, [add, toggle, showClaude]);

  // Drag the top edge. The height is kept per machine, like VS Code's.
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const from = e.clientY;
    const start = height;
    let last = start;
    const move = (m: PointerEvent) => {
      last = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - MAP_RESERVE, start + from - m.clientY));
      setHeight(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(HEIGHT_KEY, String(last));
      } catch {
        /* not kept; it still applies until reload */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!tabs.length) return null;
  const current = tabs.find((t) => t.key === active);
  return (
    <section
      aria-label="Terminal"
      style={{ height }}
      className={cn("relative flex shrink-0 flex-col border-t border-ink bg-ink", !shown && "hidden")}
    >
      <div
        onPointerDown={drag}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize hover:bg-deep-green/40"
      />
      <div className="flex h-8 shrink-0 items-center gap-1 px-2" role="tablist">
        {tabs.map((t, i) => (
          <div
            key={t.key}
            role="tab"
            aria-selected={t.key === active}
            className={cn(
              "group flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11.5px]",
              t.key === active ? "bg-white/10 text-pure-white" : "text-faint hover:text-surface-dim",
            )}
          >
            <button type="button" onClick={() => select(t.key)} className="cursor-pointer">
              {t.title} {i + 1}
            </button>
            <button
              type="button"
              onClick={() => close(t.key)}
              aria-label={`Close ${t.title} ${i + 1}`}
              className="cursor-pointer text-faint opacity-0 hover:text-pure-white group-hover:opacity-100 group-aria-selected:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => add()}
          aria-label="New terminal"
          title="New terminal (Ctrl+Shift+`)"
          className="cursor-pointer rounded-[6px] px-2 text-[14px] text-faint hover:text-pure-white"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => add("claude")}
          title="New Claude Code tab — right-click a card on the map to hand it over"
          className="cursor-pointer rounded-[6px] px-2 font-mono text-[11.5px] text-faint hover:text-pure-white"
        >
          ✳ claude
        </button>
        <button
          type="button"
          onClick={() => setShown(false)}
          aria-label="Hide terminal"
          title="Hide terminal (Ctrl+`)"
          className="ml-auto cursor-pointer rounded-[6px] px-2 text-[12px] text-faint hover:text-pure-white"
        >
          ⌄
        </button>
      </div>
      {current?.kind === "claude" && current.pty !== undefined ? <Tray pty={current.pty} /> : null}
      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <Shell
            key={t.key}
            kind={t.kind}
            visible={shown && t.key === active}
            onTitle={(title) => setTabs((all) => all.map((x) => (x.key === t.key ? { ...x, title } : x)))}
            onSpawn={(pty) => {
              setTabs((all) => all.map((x) => (x.key === t.key ? { ...x, pty } : x)));
              if (t.kind === "claude") claudeStarted(pty);
            }}
            onExit={() => close(t.key)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The sections handed to this Claude tab: waiting (◷) until the next prompt
 * takes them, then sent (✓). Only a waiting one can still be taken back.
 */
function Tray({ pty }: { pty: number }) {
  const picks = usePicks(pty);
  if (!picks.length) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-1.5 font-mono text-[11px]">
      <span className="shrink-0 text-faint">context</span>
      {picks.map((p) => (
        <span
          key={p.key}
          title={p.status === "queued" ? "Goes with your next prompt" : "Sent to Claude"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5",
            p.status === "queued" ? "border-mint-line/60 text-pure-white" : "border-white/15 text-faint",
          )}
        >
          <span aria-hidden>{p.status === "queued" ? "◷" : "✓"}</span>
          {p.title}
          <button
            type="button"
            onClick={() => void unpick(pty, p.key)}
            aria-label={`Remove ${p.title}`}
            className="cursor-pointer text-faint hover:text-pure-white"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => void clearPicks(pty)}
        className="ml-1 shrink-0 cursor-pointer text-faint hover:text-pure-white"
      >
        clear
      </button>
    </div>
  );
}

/** One shell, or Claude Code: an xterm on a pty. Lives as long as its tab. */
function Shell({
  kind,
  visible,
  onTitle,
  onSpawn,
  onExit,
}: {
  kind: Tab["kind"];
  visible: boolean;
  onTitle: (title: string) => void;
  onSpawn: (pty: number) => void;
  onExit: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  /** Re-fit and focus, set once the terminal exists. */
  const show = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest callbacks, so the effect below runs once per shell, not per render.
  const handlers = useRef({ onTitle, onSpawn, onExit });
  useEffect(() => {
    handlers.current = { onTitle, onSpawn, onExit };
  });

  useEffect(() => {
    if (!isTauri()) {
      // queueMicrotask, so the effect body itself sets no state.
      queueMicrotask(() => setError("The terminal needs the desktop app: run `npm run app:dev`."));
      return;
    }
    let gone = false;
    let id: number | null = null;
    let cleanup = () => {};

    (async () => {
      // The user's own Claude Code, wherever Settings says or it was found.
      let claude: { path: string; model: string | null } | null = null;
      if (kind === "claude") {
        const { claudePath, model } = readSettings();
        const found = await invoke<{ path: string } | null>("claude_detect", {
          configured: claudePath || null,
        });
        if (gone) return;
        if (!found) {
          setError(
            claudePath
              ? `Claude Code is not at ${claudePath}.`
              : "Claude Code was not found. Install it, or set where it is in Settings.",
          );
          return;
        }
        claude = { path: found.path, model: model || null };
      }
      // xterm measures one glyph to size every cell, so it needs the face's
      // name (not a var()) and the face itself loaded: measured against the
      // fallback, the real font lands in cells of the wrong width once it
      // arrives. A web font is only fetched when something asks for it.
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
      const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-webgl"),
        document.fonts.load(`13px ${family}`),
        document.fonts.load(`bold 13px ${family}`),
      ]);
      if (gone || !el.current) return;
      const term = new Terminal({
        theme: THEME,
        fontFamily: `${family}, ui-monospace, monospace`,
        // A whole pixel size: a fractional one gives fractional cells, which
        // drift out of line across a row.
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        scrollback: 5000,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el.current);
      // The GPU renderer, as VS Code uses: glyphs from a texture atlas on an
      // exact grid. If WebGL is missing or the context is lost, xterm falls
      // back to its DOM renderer by itself once the addon is disposed.
      try {
        const gl = new WebglAddon();
        gl.onContextLoss(() => gl.dispose());
        term.loadAddon(gl);
      } catch {
        /* no WebGL: the DOM renderer stays */
      }
      // Ctrl+` belongs to the panel, never the shell.
      term.attachCustomKeyEventHandler((e) => !(e.ctrlKey && e.code === "Backquote"));

      /** Fit to the box — skipped while hidden, when it has no size to fit. */
      const refit = () => {
        if (!el.current?.offsetWidth) return;
        fit.fit();
        if (id !== null) void invoke("pty_resize", { id, cols: term.cols, rows: term.rows });
      };
      refit();

      const out = new Channel<ArrayBuffer | { exit: number }>();
      out.onmessage = (m) => {
        if (gone) return;
        if (m instanceof ArrayBuffer) term.write(new Uint8Array(m));
        else handlers.current.onExit();
      };
      try {
        const spawned = await invoke<{ id: number; shell: string }>("pty_spawn", {
          cols: term.cols,
          rows: term.rows,
          onData: out,
          claude,
        });
        id = spawned.id;
        // Unmounted while the shell was starting: end it rather than leak it.
        if (gone) {
          void invoke("pty_kill", { id });
          term.dispose();
          return;
        }
        handlers.current.onTitle(spawned.shell);
        handlers.current.onSpawn(spawned.id);
      } catch (e) {
        term.dispose();
        setError(`Could not start ${kind === "claude" ? "Claude Code" : "a shell"}: ${String(e)}`);
        return;
      }

      const input = term.onData((data) => void invoke("pty_write", { id, data }));
      const seen = new ResizeObserver(refit);
      seen.observe(el.current);
      show.current = () => {
        refit();
        term.focus();
      };
      show.current();
      cleanup = () => {
        seen.disconnect();
        input.dispose();
        term.dispose();
        if (id !== null) void invoke("pty_kill", { id });
      };
    })();

    return () => {
      gone = true;
      show.current = null;
      cleanup();
    };
    // A tab's kind never changes, so this still runs once per tab.
  }, [kind]);

  useEffect(() => {
    if (visible) show.current?.();
  }, [visible]);

  return (
    <div className={cn("absolute inset-0 px-3 pb-1", !visible && "hidden")}>
      {error ? (
        <p className="font-mono text-[11.5px] text-clay-line">
          {error}
          {kind === "claude" ? (
            <button
              type="button"
              onClick={openSettings}
              className="ml-2 cursor-pointer text-mint-line underline hover:text-pure-white"
            >
              Open Settings
            </button>
          ) : null}
        </p>
      ) : (
        <div ref={el} className="h-full w-full" />
      )}
    </div>
  );
}
