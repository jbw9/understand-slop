import { useSyncExternalStore } from "react";
import { SETTINGS_KEY, themeOf, type Theme } from "@/lib/theme";

/**
 * What the user can change, kept per machine in localStorage like the
 * terminal's height. Blank means "work it out": the `claude` binary is found
 * by the app (src-tauri/src/claude.rs), the model is Claude Code's own
 * default, the theme is Classic, the landing page's look, and new tabs open in Claude Code.
 */
export type { Theme };
export type Ground = "dots" | "plain" | "squares";

export interface Settings {
  claudePath: string;
  model: string;
  theme: Theme;
  /** The agent a tab opens into when the app opens one for you (components/agents.tsx). */
  agent: string;
  /** What the map is drawn on. */
  ground: Ground;
  /** Start a project's dev server when it opens, and show it in a Preview tab. */
  devServer: boolean;
  /** Claude Code's own dictation (hold Space) in Claude tabs; it needs a claude.ai sign-in. */
  voice: boolean;
  /** Let Claude load skills and search or read the web without asking each time. */
  research: boolean;
  /** Pause Music and Spotify and mute the rest while dictating; null until the first dictation asks. */
  quietMedia: boolean | null;
  /** The first-run tour on the blank page (components/welcome.tsx) was finished or skipped. */
  onboarded: boolean;
}

const KEY = SETTINGS_KEY;
const CHANGED = "slop:settings-changed";
const OPEN = "slop:settings";
const DEFAULTS: Settings = { claudePath: "", model: "", theme: "classic", agent: "claude", ground: "plain", devServer: true, voice: true, research: true, quietMedia: null, onboarded: false };

/** Anything can ask for the settings dialog: the chrome's gear dispatches this. */
export const openSettings = () => window.dispatchEvent(new Event(OPEN));
export const onOpenSettings = (f: () => void) => {
  window.addEventListener(OPEN, f);
  return () => window.removeEventListener(OPEN, f);
};

function raw() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

// Parsed once per distinct value, so the snapshot keeps its identity between
// renders, as useSyncExternalStore requires.
let cached: { raw: string; value: Settings } = { raw: "", value: DEFAULTS };

export function readSettings(): Settings {
  const r = raw();
  if (r !== cached.raw) {
    let value = DEFAULTS;
    try {
      const saved = { ...DEFAULTS, ...JSON.parse(r) };
      value = { ...saved, theme: themeOf(saved.theme) };
    } catch {
      /* unreadable: the defaults stand */
    }
    cached = { raw: r, value };
  }
  return cached.value;
}

export function saveSettings(next: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* not kept; nothing else to do */
  }
  window.dispatchEvent(new Event(CHANGED));
}

const subscribe = (f: () => void) => {
  window.addEventListener(CHANGED, f);
  return () => window.removeEventListener(CHANGED, f);
};

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULTS);
}

/* ── the theme ────────────────────────────────────────────────── */

/**
 * Sets `<html data-theme>`, which app/globals.css reads. The same choice is
 * made before first paint by THEME_SCRIPT (lib/theme.ts), so the page never flashes another theme.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Keeps the page on the saved theme. */
export function followTheme() {
  const sync = () => applyTheme(readSettings().theme);
  window.addEventListener(CHANGED, sync);
  sync();
  return () => window.removeEventListener(CHANGED, sync);
}
