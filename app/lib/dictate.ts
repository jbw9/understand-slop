import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import { insertPrompt } from "@/lib/context";
import { openSettings } from "@/lib/settings";

/**
 * On-device dictation (src-tauri/src/dictate.rs): hold Option+Space, speak,
 * let go. The words go where the cursor was — a text field in the app if one
 * had focus, else Claude's prompt in the tab picks go to, without Enter, so
 * they can be read before they are sent. Esc while holding throws it away.
 * Plain Space stays Claude Code's own dictation (claude.rs). Not Ctrl+Space:
 * macOS keeps that for switching input source, and takes it before the page does.
 */

export type Phase = "idle" | "listening" | "working";
export interface Dictation {
  phase: Phase;
  /** Why the last one put nothing in. */
  error?: string;
}

/** Past this, the recording is ended for the user, as Claude Code's own does. */
const LIMIT_MS = 120_000;

let state: Dictation = { phase: "idle" };
const listeners = new Set<() => void>();
const set = (next: Dictation) => {
  state = next;
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const useDictation = () => useSyncExternalStore(subscribe, () => state, () => state);

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable]";

let started: Promise<boolean> | null = null;
let field: HTMLElement | null = null;
let limit: ReturnType<typeof setTimeout> | undefined;

export function startDictation() {
  if (!isTauri() || started) return;
  const focused = document.activeElement as HTMLElement | null;
  // xterm's own input is a textarea: the terminal means Claude's prompt, not a field.
  field = focused?.matches(EDITABLE) && !focused.closest(".xterm") ? focused : null;
  set({ phase: "listening" });
  started = invoke("dictate_start").then(
    () => true,
    (e) => {
      if (e === "missing") openSettings();
      set({ phase: "idle", error: e === "missing" ? "Download the speech model in Settings first." : String(e) });
      return false;
    },
  );
  limit = setTimeout(() => void stopDictation(), LIMIT_MS);
}

export async function stopDictation() {
  const was = started;
  if (!was) return;
  clearTimeout(limit);
  if (!(await was)) return void (started = null);
  set({ phase: "working" });
  try {
    const text = await invoke<string>("dictate_stop");
    started = null;
    if (!text) return set({ phase: "idle", error: "Nothing was heard." });
    set({ phase: "idle", error: put(text) ? undefined : "No Claude tab to put it in." });
  } catch (e) {
    started = null;
    set({ phase: "idle", error: String(e) });
  }
}

export function cancelDictation() {
  const was = started;
  if (!was) return;
  clearTimeout(limit);
  started = null;
  void was.then((ok) => ok && invoke("dictate_cancel"));
  set({ phase: "idle" });
}

/** Inserted as if typed, so the field's own undo and onChange see it. */
function put(text: string): boolean {
  if (field?.isConnected) {
    field.focus();
    document.execCommand("insertText", false, text);
    return true;
  }
  return insertPrompt(text);
}

const isHotkey = (e: KeyboardEvent) => e.code === "Space" && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;

/** Mounted once, by the workspace: the hold-to-talk key, anywhere in the window. */
export function useDictationKey() {
  useEffect(() => {
    if (!isTauri()) return;
    // Capture phase, so it wins before xterm's textarea sends Option+Space to the program, or a field types a no-break space.
    const down = (e: KeyboardEvent) => {
      if (isHotkey(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) startDictation();
      } else if (e.code === "Escape" && started) {
        e.preventDefault();
        e.stopPropagation();
        cancelDictation();
      }
    };
    // Letting go of either key ends it.
    const up = (e: KeyboardEvent) => {
      if (!started || (e.code !== "Space" && e.key !== "Alt")) return;
      e.preventDefault();
      e.stopPropagation();
      void stopDictation();
    };
    // A key-up lost to another window would leave the microphone open.
    const blur = () => void stopDictation();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
}
