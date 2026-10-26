import type { BuiltMap } from "@/lib/map";
import type { Node } from "@/lib/data";

/**
 * What Claude asked the app to show.
 *
 * The reverse of lib/context.ts: that hands the map to Claude, this lets
 * Claude move the map. A reader who asks "how do sign ups work?" wants to be
 * looking at sign-ups while the answer arrives, and the one thing that knows
 * which section that is — having just read it — is Claude.
 *
 * The channel is `slop-map-show`, a script on the tab's PATH that appends a
 * line beside the tab's queue (src-tauri/src/claude.rs), drained on every
 * `pty_state` poll rather than at the end of the turn: navigation that lands
 * after the explanation has finished is navigation the reader has already done
 * by hand.
 *
 * Claude names a section the way a person does — by title, or by the trail of
 * titles it was handed. It never sees an id path, so resolving the name is
 * this file's job, and a name that resolves to nothing is reported rather than
 * guessed at: being taken to the wrong section mid-answer is worse than not
 * moving.
 */

/**
 * One act, as src-tauri/src/claude.rs serializes it — tagged on `verb`.
 *
 * `from` empty means the map's own commit and `to` null means the working
 * tree, which are the same two defaults the diff API already has for an
 * absent parameter.
 */
export type Act =
  | { verb: "section"; section: string }
  | { verb: "diff"; from: string; to: string | null };

/** A node and the id path that reaches it. */
interface Found {
  path: string[];
  node: Node;
}

function flatten(nodes: Node[], at: string[] = [], titles: string[] = [], out: (Found & { titles: string[] })[] = []) {
  for (const n of nodes) {
    const path = [...at, n.id];
    const trail = [...titles, n.title];
    out.push({ path, node: n, titles: trail });
    flatten(n.children ?? [], path, trail, out);
  }
  return out;
}

/** A name's words, as a title would spell them: punctuation is not meaning. */
const words = (s: string) => s.split(/[^a-z0-9]+/i).filter(Boolean);

/** The one section whose title holds every one of these words, or none. */
function only<T extends { node: Node }>(all: T[], want: string[]): T | undefined {
  if (!want.length) return undefined;
  const hits = all.filter((p) => {
    const have = words(p.node.title.toLowerCase());
    return want.every((w) => have.includes(w));
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * The section Claude named, by id, by its trail of titles, or by its own
 * title. Deliberately the same ladder as `named()` in
 * scripts/generate/update.ts, which resolves the section names Claude writes
 * into `slop-map-fix`: the two take names from the same model in the same
 * vocabulary, so a name that works in one must work in the other.
 *
 * A title matched further down the tree beats one matched at the top only by
 * being found first, which is the right bias — the deeper node is the more
 * specific answer, and `flatten` walks parents first so the shallowest exact
 * match still wins over a deep partial one.
 */
export function findSection(map: BuiltMap, name: string): string[] | null {
  const all = flatten(map.L0);
  const want = name.trim().toLowerCase();
  if (!want) return null;
  const last = want.split("›").pop()!.trim();
  const hit =
    all.find((p) => p.path.join("/").toLowerCase() === want) ??
    all.find((p) => p.node.id.toLowerCase() === want) ??
    all.find((p) => p.titles.join(" › ").toLowerCase() === want) ??
    all.find((p) => p.node.title.toLowerCase() === want) ??
    all.find((p) => p.node.title.toLowerCase() === last) ??
    // Last resort, for a title Claude reached for from memory rather than from
    // the outline: every word of the name appears in the title, in any order,
    // so "sign up" finds "Student Sign-Up". Only on names long enough to mean
    // something — "a" must not open the first section containing an a — and
    // only when exactly one section matches, since landing the reader on an
    // arbitrary one of several is the guess this whole ladder exists to avoid.
    (last.length >= 4 ? only(all, words(last)) : undefined) ??
    null;
  return hit?.path ?? null;
}

/* ── the channel ──────────────────────────────────────────────── */

/**
 * Acts arrive on the workspace's existing poll, where nothing knows about the
 * map, and are applied on the canvas, which has the tree to resolve a name
 * against. The same event-bus hop as `announceAnswer` (components/keep.tsx),
 * for the same reason.
 */
const ACTED = "slop:acted";

export const announceAct = (a: Act) => window.dispatchEvent(new CustomEvent<Act>(ACTED, { detail: a }));

export function onAct(f: (a: Act) => void) {
  const on = (ev: Event) => f((ev as CustomEvent<Act>).detail);
  window.addEventListener(ACTED, on);
  return () => window.removeEventListener(ACTED, on);
}
