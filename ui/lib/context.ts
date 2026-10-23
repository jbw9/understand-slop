import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { describe, nodeAt, RUN } from "@/lib/map";

/**
 * What the user has handed to Claude from the map: whole sections, or any one
 * thing on a level — a row, a box, a message, a line of the screen, a problem,
 * a place in the code.
 *
 * Each Claude tab has its own queue (src-tauri/src/claude.rs): a pick is
 * written there and goes out with that tab's next prompt. Picks go to the
 * Claude tab you used last. With none open, the pick waits, a tab is opened,
 * and it is queued as soon as the tab has started.
 *
 * Delivery is seen, not assumed: while anything is queued its queue is polled,
 * and the moment the prompt hook has taken it the pick shows as sent.
 */

/** Something that can be handed over, and the text Claude gets for it. */
export interface Target {
  /** A section's path as the URL carries it; an element's adds `#` and its identity. */
  key: string;
  title: string;
  text: string;
}

export interface Pick extends Target {
  status: "queued" | "sent";
}

interface State {
  /** The Claude tab picks go to: its pty id. */
  target: number | null;
  picks: Record<number, Pick[]>;
}

let state: State = { target: null, picks: {} };
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const sectionKey = (path: string[]) => path.join("/");

export const section = (path: string[]): Target => ({
  key: sectionKey(path),
  title: path.length ? (nodeAt(path)?.title ?? sectionKey(path)) : RUN.repo,
  text: describe(path),
});
const withPicks = (pty: number, picks: Pick[]) => set({ ...state, picks: { ...state.picks, [pty]: picks } });

/** Picked before any Claude tab existed; queued once one starts. */
let waiting: Target[] = [];

/* ── Claude tabs coming and going (terminal.tsx) ──────────────── */

/** Anything can ask for Claude: shows the last Claude tab, or opens one. */
const OPEN = "slop:claude";
export const openClaude = () => window.dispatchEvent(new Event(OPEN));
export const onOpenClaude = (f: () => void) => {
  window.addEventListener(OPEN, f);
  return () => window.removeEventListener(OPEN, f);
};

export function claudeStarted(pty: number) {
  set({ target: pty, picks: { ...state.picks, [pty]: [] } });
  const queued = waiting;
  waiting = [];
  for (const p of queued) void add(pty, p);
}

/** The user switched to this Claude tab: picks now go there. */
export function claudeFocused(pty: number) {
  if (pty in state.picks && state.target !== pty) set({ ...state, target: pty });
}

export function claudeEnded(pty: number) {
  const picks = { ...state.picks };
  delete picks[pty];
  const left = Object.keys(picks).map(Number);
  set({ target: state.target === pty ? (left.at(-1) ?? null) : state.target, picks });
}

/* ── picking ──────────────────────────────────────────────────── */

/** Hand something to Claude. Opens a Claude tab first if there is none. */
export function pick(t: Target) {
  if (state.target === null) {
    if (!waiting.some((w) => w.key === t.key)) waiting.push(t);
    openClaude();
    return;
  }
  void add(state.target, t);
}

async function add(pty: number, t: Target) {
  const mine = state.picks[pty] ?? [];
  if (mine.some((p) => p.key === t.key && p.status === "queued")) return;
  await invoke("context_add", { id: pty, text: t.text });
  // A sent pick picked again goes again: it moves to the end, queued.
  const rest = (state.picks[pty] ?? []).filter((p) => p.key !== t.key);
  withPicks(pty, [...rest, { ...t, status: "queued" }]);
  watch();
}

/** Take back a pick that has not gone out yet. One already sent is only dropped from view. */
export async function unpick(pty: number, key: string) {
  const mine = state.picks[pty] ?? [];
  const gone = mine.find((p) => p.key === key);
  if (!gone) return;
  if (gone.status === "queued" && (await invoke<boolean>("context_pending", { id: pty }))) {
    const keep = mine.filter((p) => p.status === "queued" && p.key !== key);
    await invoke("context_set", { id: pty, text: keep.map((p) => p.text).join("\n\n") });
  }
  withPicks(pty, (state.picks[pty] ?? []).filter((p) => p.key !== key));
}

export async function clearPicks(pty: number) {
  await invoke("context_set", { id: pty, text: "" });
  withPicks(pty, []);
}

/* ── seeing delivery ──────────────────────────────────────────── */

let timer: ReturnType<typeof setInterval> | null = null;

function watch() {
  if (timer) return;
  timer = setInterval(async () => {
    const live = Object.entries(state.picks).filter(([, ps]) => ps.some((p) => p.status === "queued"));
    if (!live.length) {
      clearInterval(timer!);
      timer = null;
      return;
    }
    for (const [id, ps] of live) {
      const pty = Number(id);
      const pending = await invoke<boolean>("context_pending", { id: pty }).catch(() => false);
      if (pending || state.picks[pty] !== ps) continue;
      withPicks(pty, ps.map((p) => ({ ...p, status: "sent" as const })));
    }
  }, 1000);
}

/* ── reading it ───────────────────────────────────────────────── */

const NONE: Pick[] = [];

/** One tab's picks, or the current target's when no tab is named. */
export function usePicks(pty?: number | null): Pick[] {
  return useSyncExternalStore(
    subscribe,
    () => state.picks[pty ?? state.target ?? -1] ?? NONE,
    () => NONE,
  );
}

/** How a pick, by key, stands with the Claude tab picks go to. */
export function usePicked(key: string): Pick["status"] | null {
  return useSyncExternalStore(
    subscribe,
    () => (state.picks[state.target ?? -1] ?? NONE).find((p) => p.key === key)?.status ?? null,
    () => null,
  );
}
