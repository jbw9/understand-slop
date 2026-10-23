"use client";

import "@xterm/xterm/css/xterm.css";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { readSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * One tab's program: the user's shell, or their Claude Code, on a real pty in
 * the open map's checkout (src-tauri/src/pty.rs), drawn by xterm. The
 * workspace window (components/workspace.tsx) holds a row of these. A Shell
 * lives as long as its tab: hiding the window or switching tabs only takes it
 * out of sight, so scrollback and a running process survive.
 */

/**
 * The palettes, one per theme (app/globals.css). The background is the
 * window's own, `surface-container-low`, so the terminal sits in the page as a
 * tool rather than another card. The light one darkens every ANSI colour so
 * it still reads on paper.
 */
const DARK = {
  background: "#1f2128",
  foreground: "#e7e5e0",
  cursor: "#cfe6d4",
  cursorAccent: "#1f2128",
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

const LIGHT = {
  background: "#f4f4f2",
  foreground: "#1a1c1b",
  cursor: "#1f5c4d",
  cursorAccent: "#f4f4f2",
  selectionBackground: "#cfe6d4",
  black: "#1a1a2e",
  red: "#8e3320",
  green: "#2e7d32",
  yellow: "#8a6416",
  blue: "#2f5d9e",
  magenta: "#7b3f9e",
  cyan: "#1f6f6a",
  white: "#555b63",
  brightBlack: "#6b7280",
  brightRed: "#b5452b",
  brightGreen: "#3c9441",
  brightYellow: "#a87b1c",
  brightBlue: "#3f73bd",
  brightMagenta: "#9653bd",
  brightCyan: "#26877f",
  brightWhite: "#9aa0a6",
};

/* ── keys ─────────────────────────────────────────────────────── */

/**
 * What a terminal app does with a key before the program sees it, as GNOME
 * Terminal and VS Code do. Ctrl+←/→ and Home/End are left alone: xterm sends
 * their standard sequences, which shells and Claude Code read themselves.
 */
type Action = { send: string } | { copy: true } | { paste: true } | { zoom: number | null };

function actionFor(e: KeyboardEvent, selected: boolean): Action | null {
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  if (ctrl && !e.shiftKey) {
    // Delete a word: Ctrl+W back (shells, readline, Claude Code), Alt+D on.
    // Ctrl+W itself closes the tab (components/workspace.tsx), so this is the
    // way to send it.
    if (e.key === "Backspace") return { send: "\x17" };
    if (e.key === "Delete") return { send: "\x1bd" };
    // With text selected, Ctrl+C copies it rather than interrupting.
    if (e.code === "KeyC" && selected) return { copy: true };
    if (e.code === "Equal" || e.code === "NumpadAdd") return { zoom: 1 };
    if (e.code === "Minus" || e.code === "NumpadSubtract") return { zoom: -1 };
    if (e.code === "Digit0" || e.code === "Numpad0") return { zoom: null };
  }
  if (ctrl && e.shiftKey) {
    if (e.code === "KeyC") return { copy: true };
    if (e.code === "KeyV") return { paste: true };
  }
  // A new line without sending: Claude Code reads Alt+Enter as one, and a
  // shell keeps editing a multi-line command.
  if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) return { send: "\x1b\r" };
  return null;
}

/** One font size for every tab, kept per machine like the window's width. */
const FONT_KEY = "slop.terminal.fontSize";
const FONT = { min: 9, base: 13, max: 24 };
const ZOOMED = "slop:terminal-zoom";

function storedFont() {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    if (n >= FONT.min && n <= FONT.max) return n;
  } catch {
    /* storage blocked: the default is fine */
  }
  return FONT.base;
}

function zoom(by: number | null) {
  const next = by === null ? FONT.base : Math.max(FONT.min, Math.min(FONT.max, storedFont() + by));
  try {
    localStorage.setItem(FONT_KEY, String(next));
  } catch {
    /* applies until reload */
  }
  window.dispatchEvent(new CustomEvent(ZOOMED, { detail: next }));
}

/** The palette for the theme on screen: `<html data-theme>`, set by lib/settings.ts. */
const palette = () => (document.documentElement.dataset.theme === "dark" ? DARK : LIGHT);

/**
 * Programs that assume a dark terminal pick their own colours in RGB, which no
 * palette reaches: Claude Code in its default dark theme draws white bullets,
 * pale links and dim grey on paper. On the light palette xterm lifts any
 * foreground below this contrast with the cell it sits on, so they still read.
 */
const contrast = () => (document.documentElement.dataset.theme === "dark" ? 1 : 4.5);

/**
 * One tab's terminal: the user's shell on a pty, an xterm drawing it. Lives as
 * long as its tab. With Claude Code found (as Settings says, or wherever it is
 * installed), the shell can run it through the app's launcher, and with
 * `startClaude` it runs it first (src-tauri/src/claude.rs); quitting Claude
 * leaves the shell.
 */
export function Shell({
  startClaude = false,
  run,
  cwd,
  visible,
  onTitle,
  onSpawn,
  onClaude,
  onExit,
}: {
  startClaude?: boolean;
  /** A command to type into the shell once it starts, as if the user had: another agent's CLI. */
  run?: string;
  /** Where it starts. A tab keeps the one it was opened with. */
  cwd?: string;
  visible: boolean;
  onTitle?: (title: string) => void;
  onSpawn?: (pty: number) => void;
  /** Whether Claude Code was found, so this tab can run it. */
  onClaude?: (found: boolean) => void;
  onExit: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  /** Re-fit and focus, set once the terminal exists. */
  const show = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest callbacks, so the effect below runs once per shell, not per render.
  const handlers = useRef({ onTitle, onSpawn, onClaude, onExit });
  useEffect(() => {
    handlers.current = { onTitle, onSpawn, onClaude, onExit };
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
      // Every tab can run Claude, so it is looked for every time; without it
      // the tab is still a shell.
      const { claudePath, model } = readSettings();
      const found = await invoke<{ path: string } | null>("claude_detect", {
        configured: claudePath || null,
      }).catch(() => null);
      if (gone) return;
      handlers.current.onClaude?.(!!found);
      const launch = found ? { path: found.path, model: model || null } : null;
      // xterm measures one glyph to size every cell, so it needs the face's
      // name (not a var()) and the face itself loaded: measured against the
      // fallback, the real font lands in cells of the wrong width once it
      // arrives. A web font is only fetched when something asks for it.
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
      const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-webgl"),
        document.fonts.load(`${storedFont()}px ${family}`),
        document.fonts.load(`bold ${storedFont()}px ${family}`),
      ]);
      if (gone || !el.current) return;
      const term = new Terminal({
        theme: palette(),
        minimumContrastRatio: contrast(),
        fontFamily: `${family}, ui-monospace, monospace`,
        // A whole pixel size: a fractional one gives fractional cells, which
        // drift out of line across a row.
        fontSize: storedFont(),
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
      term.attachCustomKeyEventHandler((e) => {
        // Ctrl+` and Ctrl+W belong to the workspace window, never the program in a tab.
        if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "KeyW") return false;
        if (e.ctrlKey && e.code === "Backquote") return false;
        const action = actionFor(e, term.hasSelection());
        if (!action) return true;
        e.preventDefault();
        if (e.type !== "keydown") return false;
        if ("send" in action) {
          if (id !== null) void invoke("pty_write", { id, data: action.send });
        } else if ("copy" in action) {
          void writeText(term.getSelection());
          term.clearSelection();
        } else if ("paste" in action) {
          // paste() wraps it for programs that asked for bracketed paste.
          void readText().then((t) => t && term.paste(t), () => {});
        } else {
          zoom(action.zoom);
        }
        return false;
      });

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
          launch,
          startClaude: startClaude && !!launch,
          cwd: cwd ?? null,
        });
        id = spawned.id;
        // Unmounted while the shell was starting: end it rather than leak it.
        if (gone) {
          void invoke("pty_kill", { id });
          term.dispose();
          return;
        }
        // Typed ahead: the terminal holds it until the shell is ready to read.
        if (run) void invoke("pty_write", { id, data: `${run}\r` });
        handlers.current.onTitle?.(spawned.shell);
        handlers.current.onSpawn?.(spawned.id);
      } catch (e) {
        term.dispose();
        setError(`Could not start a shell: ${String(e)}`);
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
      // The theme can change under a running shell: Settings, or the system's.
      const themed = new MutationObserver(() => {
        term.options.theme = palette();
        term.options.minimumContrastRatio = contrast();
      });
      themed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      // Zoom in one tab, and every tab follows; the grid is re-fitted to the new cells.
      const onZoom = (e: Event) => {
        term.options.fontSize = (e as CustomEvent<number>).detail;
        refit();
      };
      window.addEventListener(ZOOMED, onZoom);
      cleanup = () => {
        window.removeEventListener(ZOOMED, onZoom);
        themed.disconnect();
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
    // A tab's kind and directory are fixed at birth, so this runs once per tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) show.current?.();
  }, [visible]);

  return (
    <div className={cn("absolute inset-0 px-3 pb-1", !visible && "hidden")}>
      {error ? (
        <p className="font-mono text-[11.5px] text-clay-ink">{error}</p>
      ) : (
        <div ref={el} className="h-full w-full" />
      )}
    </div>
  );
}
