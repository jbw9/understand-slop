import { useSyncExternalStore } from "react";

/**
 * What the user can change, kept per machine in localStorage like the
 * terminal's height. Blank means "work it out": the `claude` binary is found
 * by the app (src-tauri/src/claude.rs), and the model is Claude Code's own
 * default.
 */
export interface Settings {
  claudePath: string;
  model: string;
}

const KEY = "slop.settings";
const CHANGED = "slop:settings-changed";
const OPEN = "slop:settings";
const DEFAULTS: Settings = { claudePath: "", model: "" };

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
