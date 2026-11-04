import { useSyncExternalStore } from "react";

/**
 * The projects open as tabs in the title bar (components/titlebar.tsx), kept
 * between launches, and what Claude is doing in each, as the workspace's own
 * tab dots say it (components/workspace.tsx). Closing a project's tab here
 * ends nothing: its terminals keep running until they are closed.
 */

export type Status = "working" | "waiting" | "done";

interface State {
  /** Map ids, in tab order. */
  open: string[];
  /** The project switched away from last, for Ctrl+Tab. */
  last: string | null;
  /** The loudest status among each checkout's tabs, by root. */
  status: Record<string, Status>;
}

const KEY = "slop.projects.open";
const read = (): string[] => {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const EMPTY: State = { open: [], last: null, status: {} };
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const set = (next: State) => {
  if (next.open !== state.open)
    try {
      localStorage.setItem(KEY, JSON.stringify(next.open));
    } catch {
      /* not kept: the tabs still work this session */
    }
  state = next;
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const get = () => {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    state = { ...state, open: read() };
  }
  return state;
};
export const useOpenProjects = () => useSyncExternalStore(subscribe, get, () => EMPTY);

/** The project in view gets a tab, if it has none; the one it replaces is remembered for Ctrl+Tab. */
export function arrived(id: string, from: string | null) {
  const s = get();
  const open = s.open.includes(id) ? s.open : [...s.open, id];
  const last = from && from !== id && s.open.includes(from) ? from : s.last;
  if (open !== s.open || last !== s.last) set({ ...s, open, last });
}

export function closeProject(id: string) {
  const s = get();
  set({ ...s, open: s.open.filter((x) => x !== id), last: s.last === id ? null : s.last });
}

/** Drops tabs for projects that no longer exist. */
export function keepOnly(ids: string[]) {
  const s = get();
  const open = s.open.filter((x) => ids.includes(x));
  if (open.length !== s.open.length) set({ ...s, open });
}

const RANK: Record<Status, number> = { done: 0, working: 1, waiting: 2 };
/** Each checkout's tab statuses, folded to the one its project tab shows: needs you, then working, then done. */
export function reportStatus(tabs: { cwd: string; status?: Status }[]) {
  const status: Record<string, Status> = {};
  for (const t of tabs) {
    if (!t.status) continue;
    const had = status[t.cwd];
    if (!had || RANK[t.status] > RANK[had]) status[t.cwd] = t.status;
  }
  const s = get();
  const same = Object.keys(status).length === Object.keys(s.status).length && Object.entries(status).every(([k, v]) => s.status[k] === v);
  if (!same) set({ ...s, status });
}
