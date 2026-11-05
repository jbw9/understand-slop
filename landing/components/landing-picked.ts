"use client";

import { useSyncExternalStore } from "react";

// The repository open in the demo's window. How it works follows it down.
let picked: string | null = null;
const subs = new Set<() => void>();

export function pick(id: string) {
  picked = id;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const usePicked = (first: string) => useSyncExternalStore(subscribe, () => picked ?? first, () => first);
