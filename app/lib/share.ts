/**
 * A map read again keeps every part of the old one it did not change.
 *
 * The map on screen follows its file as the generator or an update rewrites
 * it (components/map-context.tsx). Parsing a file gives every object a new
 * identity, so without this one redone section would re-render, re-measure
 * and re-run the effects of everything on the map. `share` walks the new
 * value against the old and returns the old object wherever nothing under it
 * differs — so identity means "unchanged", and `changedPaths` can read off
 * exactly which nodes moved by comparing references.
 */

import type { Node } from "@/lib/data";

type Json = unknown;

const isObj = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null;
const idOf = (v: Json) => (isObj(v) && typeof v.id === "string" ? v.id : undefined);

/** `next`, with every part equal to the same part of `prev` replaced by that part of `prev`. */
export function share<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;
  if (!isObj(prev) || !isObj(next) || Array.isArray(prev) !== Array.isArray(next)) return next;
  if (Array.isArray(next)) {
    const old = prev as Json[];
    // Items with ids are matched by id, so a section inserted or removed
    // above another does not make everything after it look changed.
    const byId = new Map(old.flatMap((v) => (idOf(v) === undefined ? [] : [[idOf(v)!, v] as const])));
    const out = next.map((v, i) => {
      const id = idOf(v);
      return share(id !== undefined ? byId.get(id) : old[i], v);
    });
    return (out.length === old.length && out.every((v, i) => v === old[i]) ? prev : out) as T;
  }
  const old = prev as Record<string, Json>;
  const keys = Object.keys(next);
  let same = keys.length === Object.keys(old).length;
  const out: Record<string, Json> = {};
  for (const k of keys) {
    out[k] = share(old[k], (next as Record<string, Json>)[k]);
    if (out[k] !== old[k]) same = false;
  }
  return (same ? prev : out) as T;
}

/**
 * Every node of `next` that is new or differs from `prev`, by its path from
 * the top, as `JSON.stringify(path)` — the same string the canvas puts in
 * `data-path`. An ancestor of a change differs too, so a section redone deep
 * in the tree also marks the row that leads down to it. `next` must already
 * have been through `share` with `prev`.
 */
export function changedPaths(prev: Node, next: Node, at: string[] = []): string[] {
  if (prev === next) return [];
  const out = [JSON.stringify(at)];
  for (const n of next.children ?? []) {
    const was = prev.children?.find((c) => c.id === n.id);
    out.push(...(was ? changedPaths(was, n, [...at, n.id]) : [JSON.stringify([...at, n.id])]));
  }
  return out;
}
