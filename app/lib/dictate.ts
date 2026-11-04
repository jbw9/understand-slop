import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import { claudeTab, insertPrompt } from "@/lib/context";
import { openSettings, readSettings, saveSettings } from "@/lib/settings";

/**
 * Hold Control+Option, speak, let go. Bound for Claude's prompt, it is Claude
 * Code's own dictation when that session has it (claude.rs turns it on; it
 * needs a claude.ai sign-in), held as Space would hold it. Otherwise, or for a
 * text field in the app, it is on-device (src-tauri/src/dictate.rs), and the
 * words go where the cursor was, without Enter, so they can be read before
 * they are sent. Esc while holding throws it away. Not Ctrl+Space:
 * macOS keeps that for switching input source, and takes it before the page does.
 * Modifiers alone type nothing, so neither a field nor the terminal needs keeping from them.
 */

export type Phase = "idle" | "listening" | "working";
export interface Dictation {
  phase: Phase;
  /** Why the last one put nothing in. */
  error?: string;
  /** The first dictation asks, before it listens, whether to quiet media. */
  ask?: boolean;
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

/** Each tab's visible screen, by pty (components/shell.tsx). */
export const screens = new Map<number, () => string[]>();

/** Faster than any key repeat, so Claude Code takes it for Space held down. */
const REPEAT_MS = 30;
/** How long Claude Code has to show it is listening before on-device takes over. */
const PROBE_MS = 900;
/** Whether each Claude tab answered with its own dictation, so it is asked only once. */
const claudeVoice = new Map<number, boolean>();

/** Media quiet while listening (src-tauri/src/dictate.rs), if chosen. Undoing is always sent; it undoes only what was done. */
const hush = (on: boolean) => {
  if (!on || readSettings().quietMedia) void invoke("dictate_hush", { on });
};

/** Puts the question up instead of listening, the first time. */
function mustAsk() {
  if (readSettings().quietMedia !== null) return false;
  set({ phase: "idle", ask: true });
  return true;
}

export function answerQuietMedia(quiet: boolean) {
  saveSettings({ ...readSettings(), quietMedia: quiet });
  set({ phase: "idle" });
}

let relay: { pty: number; sent: number; heard: boolean; timers: ReturnType<typeof setInterval>[] } | null = null;

function startRelay(pty: number) {
  const r: NonNullable<typeof relay> = { pty, sent: 0, heard: claudeVoice.get(pty) === true, timers: [] };
  relay = r;
  hush(true);
  const since = Date.now();
  r.timers.push(
    setInterval(() => {
      r.sent++;
      void invoke("pty_write", { id: pty, data: " " });
      if (Date.now() - since > LIMIT_MS) stopRelay();
    }, REPEAT_MS),
  );
  if (r.heard) return;
  r.timers.push(
    setInterval(() => {
      const footer = (screens.get(pty)?.() ?? []).slice(-8).join("\n");
      if (/listening…|keep holding…/.test(footer)) {
        r.heard = true;
        claudeVoice.set(pty, true);
        clearInterval(r.timers.pop());
      } else if (Date.now() - since > PROBE_MS) {
        claudeVoice.set(pty, false);
        stopRelay();
        startDictation();
      }
    }, 100),
  );
}

/** Letting go of the held Space is what ends Claude Code's recording. */
function stopRelay() {
  const r = relay;
  if (!r) return;
  r.timers.forEach(clearInterval);
  relay = null;
  hush(false);
  // Never listening, so the spaces were typed into the prompt: take them back.
  if (!r.heard && r.sent) void invoke("pty_write", { id: r.pty, data: "\x7f".repeat(r.sent) });
}

let started: Promise<boolean> | null = null;
let field: HTMLElement | null = null;
let limit: ReturnType<typeof setTimeout> | undefined;

export function startDictation() {
  if (!isTauri() || started || mustAsk()) return;
  const focused = document.activeElement as HTMLElement | null;
  // xterm's own input is a textarea: the terminal means Claude's prompt, not a field.
  field = focused?.matches(EDITABLE) && !focused.closest(".xterm") ? focused : null;
  set({ phase: "listening" });
  hush(true);
  started = invoke("dictate_start").then(
    () => true,
    (e) => {
      hush(false);
      if (e === "missing") openSettings();
      set({ phase: "idle", error: e === "missing" ? "Download the speech model in Settings first." : String(e) });
      return false;
    },
  );
  limit = setTimeout(() => void stopDictation(), LIMIT_MS);
}

export async function stopDictation() {
  if (relay) return stopRelay();
  const was = started;
  if (!was) return;
  clearTimeout(limit);
  hush(false);
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
  const r = relay;
  if (r) {
    stopRelay();
    // Esc is Claude Code's own cancel; it puts the prompt back as it was.
    if (r.heard) void invoke("pty_write", { id: r.pty, data: "\x1b" });
    return;
  }
  const was = started;
  if (!was) return;
  clearTimeout(limit);
  hush(false);
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

const MODIFIER = new Set(["Control", "Alt", "Meta", "Shift"]);
/** Control and Option down together, and nothing else. */
const both = (e: KeyboardEvent) => e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;

/** Claude Code's dictation for Claude's prompt where it has it; on-device for the rest. */
function begin() {
  if (mustAsk()) return;
  const focused = document.activeElement as HTMLElement | null;
  const inField = focused?.matches(EDITABLE) && !focused.closest(".xterm");
  const pty = inField ? null : claudeTab();
  if (pty !== null && claudeVoice.get(pty) !== false) startRelay(pty);
  else startDictation();
}

/** Mounted once: the hold-to-talk keys, anywhere in the window. */
export function useDictationKey() {
  useEffect(() => {
    if (!isTauri()) return;
    // Started by holding the keys, so letting go ends it; one from the palette ends on "done".
    let held = false;
    // Capture phase, so it is seen before xterm or a field takes the key.
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape" && (started || relay)) {
        e.preventDefault();
        e.stopPropagation();
        held = false;
        return cancelDictation();
      }
      if (!MODIFIER.has(e.key)) {
        // Control+Option+a key is someone's shortcut, not speech.
        if (held) {
          held = false;
          cancelDictation();
        }
        return;
      }
      if (both(e) && !e.repeat && !started && !relay) {
        held = true;
        begin();
      }
    };
    // Letting go of either key ends it.
    const up = (e: KeyboardEvent) => {
      if (!held || (e.key !== "Control" && e.key !== "Alt")) return;
      held = false;
      void stopDictation();
    };
    // A key-up lost to another window would leave the microphone open.
    const blur = () => {
      held = false;
      void stopDictation();
    };
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
