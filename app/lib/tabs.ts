import { useCallback, useSyncExternalStore } from "react";

/**
 * The tabs inside one map: each holds a level (its path, as the URL's `at=`
 * spells it), so two sections of the same project can be open side by side
 * and swapped between. Kept per map and per machine in localStorage, like the
 * settings. The tab in front always holds the URL's level: moving around the
 * map moves that tab, and bringing another to the front opens its level.
 */
export interface Tab {
  id: number;
  path: string[];
}
export interface Tabs {
  tabs: Tab[];
  active: number;
}

const CHANGED = "slop:tabs-changed";
const keyOf = (map: string) => `slop:tabs:${map}`;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function raw(map: string) {
  try {
    return localStorage.getItem(keyOf(map)) ?? "";
  } catch {
    return "";
  }
}

// Parsed once per distinct value, so the snapshot keeps its identity between
// renders, as useSyncExternalStore requires.
const cached = new Map<string, { raw: string; value: Tabs | null }>();

export function readTabs(map: string): Tabs | null {
  const r = raw(map);
  const hit = cached.get(map);
  if (hit && hit.raw === r) return hit.value;
  let value: Tabs | null = null;
  try {
    const parsed = JSON.parse(r) as Tabs;
    if (Array.isArray(parsed.tabs) && parsed.tabs.length && parsed.tabs.some((t) => t.id === parsed.active)) value = parsed;
  } catch {
    /* unreadable: no tabs yet */
  }
  cached.set(map, { raw: r, value });
  return value;
}

function save(map: string, next: Tabs) {
  try {
    localStorage.setItem(keyOf(map), JSON.stringify(next));
  } catch {
    /* not kept; nothing else to do */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The tab in front follows the level on screen; the first visit makes it. */
export function follow(map: string, path: string[]) {
  const t = readTabs(map);
  if (!t) return save(map, { tabs: [{ id: 1, path }], active: 1 });
  const front = t.tabs.find((x) => x.id === t.active)!;
  if (!same(front.path, path))
    save(map, { ...t, tabs: t.tabs.map((x) => (x.id === t.active ? { ...x, path } : x)) });
}

/** A new tab beside the one in front, holding `path`, brought to the front. */
export function openTab(map: string, path: string[]) {
  const t = readTabs(map) ?? { tabs: [], active: 0 };
  const id = Math.max(0, ...t.tabs.map((x) => x.id)) + 1;
  const at = t.tabs.findIndex((x) => x.id === t.active);
  const tabs = [...t.tabs];
  tabs.splice(at + 1, 0, { id, path });
  save(map, { tabs, active: id });
}

/** Brings a tab to the front, and says which level to open. */
export function selectTab(map: string, id: number): string[] | null {
  const t = readTabs(map);
  const tab = t?.tabs.find((x) => x.id === id);
  if (!t || !tab) return null;
  save(map, { ...t, active: id });
  return tab.path;
}

/**
 * Closes a tab. If it was in front, the one to its right comes forward (else
 * the one to its left), and its level is returned to open. The last tab stays.
 */
export function closeTab(map: string, id: number): string[] | null {
  const t = readTabs(map);
  if (!t || t.tabs.length < 2) return null;
  const at = t.tabs.findIndex((x) => x.id === id);
  const tabs = t.tabs.filter((x) => x.id !== id);
  if (id !== t.active) {
    save(map, { ...t, tabs });
    return null;
  }
  const next = tabs[at] ?? tabs[at - 1];
  save(map, { tabs, active: next.id });
  return next.path;
}

const subscribe = (f: () => void) => {
  window.addEventListener(CHANGED, f);
  return () => window.removeEventListener(CHANGED, f);
};

export function useTabs(map: string): Tabs | null {
  const read = useCallback(() => readTabs(map), [map]);
  return useSyncExternalStore(subscribe, read, () => null);
}
