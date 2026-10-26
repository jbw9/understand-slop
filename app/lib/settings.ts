import { useSyncExternalStore } from "react";
import { DARK, SETTINGS_KEY } from "@/lib/theme";

/**
 * What the user can change, kept per machine in localStorage like the
 * terminal's height. Blank means "work it out": the `claude` binary is found
 * by the app (src-tauri/src/claude.rs), the model is Claude Code's own
 * default, the theme follows the system, and new tabs open in Claude Code.
 */
export type Theme = "system" | "light" | "dark";
export type Ground = "dots" | "plain" | "squares";

export interface Settings {
  claudePath: string;
  model: string;
  theme: Theme;
  /** The agent a tab opens into when the app opens one for you (components/agents.tsx). */
  agent: string;
  /** What the map is drawn on. */
  ground: Ground;
}

const KEY = SETTINGS_KEY;
const CHANGED = "slop:settings-changed";
const OPEN = "slop:settings";
const DEFAULTS: Settings = { claudePath: "", model: "", theme: "system", agent: "claude", ground: "dots" };

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
      value = { ...DEFAULTS, ...JSON.parse(r) };
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
 * made before first paint by THEME_SCRIPT (lib/theme.ts), so the page never flashes light.
 */
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia(DARK).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Keeps the page on the saved theme, and on the system's while that is the choice. */
export function followTheme() {
  const sync = () => applyTheme(readSettings().theme);
  const media = window.matchMedia(DARK);
  media.addEventListener("change", sync);
  window.addEventListener(CHANGED, sync);
  sync();
  return () => {
    media.removeEventListener("change", sync);
    window.removeEventListener(CHANGED, sync);
  };
}
