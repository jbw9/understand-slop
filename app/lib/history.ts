/**
 * How the code got here: every commit, placed on the map's own top-level
 * sections (D73).
 *
 * A commit is drawn on the roots that own the files it touched, by the cut the
 * map was made from (`owners`, scripts/generate/cut.ts) — the same answer the
 * updater gives when it decides which root a new file belongs to. A map with
 * no cut on disk falls back to the files each root's sections cite. A file no
 * root owns lands on "Elsewhere": a timeline that dropped it would draw a
 * quieter history than the one that happened.
 *
 * Paths are followed through renames, newest to oldest, so a file that lived
 * at `ui/x.ts` before it moved to `app/x.ts` still lands on today's root.
 *
 * Everything here is git and arithmetic, read on the server. Telling the
 * story in chapters is a model run (scripts/generate/story.ts); this is what
 * that run is handed, and what its chapters are checked against.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitLog } from "@/lib/diff";
import type { Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { owners, type Cut } from "@/scripts/generate/cut";
import { git, refs } from "@/scripts/generate/gitdiff";

/** The cap on commits read. Past it the oldest are left off, and `capped` says so. */
export const MOST = 2000;

/** The id of the row for files no root owns. */
export const ELSEWHERE = "";

export interface TimelineCommit {
  sha: string;
  short: string;
  at: string;
  author: string;
  subject: string;
  added: number;
  removed: number;
  /** The roots its files belong to, by id; `ELSEWHERE` for files none owns. */
  roots: string[];
}

export interface Chapter {
  title: string;
  /** Short shas, oldest first: the chapter's first and last commit. */
  from: string;
  to: string;
  detail: string;
  roots: string[];
}

export interface Story {
  head: string;
  chapters: Chapter[];
  at: string;
  usd: number;
  seconds: number;
}

export interface Timeline {
  head: string;
  /** The map's roots in its order, then Elsewhere when anything lands there. */
  roots: { id: string; title: string }[];
  /** Oldest first. */
  commits: TimelineCommit[];
  capped: boolean;
}

/** Every file cited anywhere under each root, for a map with no cut on disk. */
function citedBy(roots: Node[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (root: Node, n: Node) => {
    for (const r of refs(n)) if (!out.get(r.file)?.includes(root.id)) out.set(r.file, [...(out.get(r.file) ?? []), root.id]);
    (n.children ?? []).forEach((c) => walk(root, c));
  };
  roots.forEach((r) => walk(r, r));
  return out;
}

/** The timeline, from git, with no cache: what the route caches and the story run reads. */
export function timelineOf(root: string, map: MapFile, cut: Cut | null): Timeline {
  const head = git(root, "rev-parse", "--short", "HEAD").trim();
  const ids = new Set(map.AUTHORED.map((r) => r.id));
  const cited = cut ? null : citedBy(map.AUTHORED);
  const ownersOf = (path: string) => (cut ? owners(cut, path) : (cited!.get(path) ?? [])).filter((id) => ids.has(id));

  const log = commitLog(root, MOST);
  // Newest first, so a rename is met before the commits that used its old path.
  const today = new Map<string, string>();
  const commits: TimelineCommit[] = [];
  for (const c of log) {
    const roots = new Set<string>();
    for (const f of c.files) {
      const mine = ownersOf(today.get(f) ?? f);
      if (!mine.length) roots.add(ELSEWHERE);
      mine.forEach((id) => roots.add(id));
    }
    for (const [was, now] of c.moves ?? []) today.set(was, today.get(now) ?? now);
    commits.push({ sha: c.sha, short: c.short, at: c.at, author: c.author, subject: c.subject, added: c.added, removed: c.removed, roots: [...roots] });
  }
  commits.reverse();
  const rows = map.AUTHORED.map((r) => ({ id: r.id, title: r.title }));
  if (commits.some((c) => c.roots.includes(ELSEWHERE))) rows.push({ id: ELSEWHERE, title: "Elsewhere" });
  return { head, roots: rows, commits, capped: log.length === MOST };
}

/** The project's cut, where the generator left one. */
export function cutOf(dir: string): Cut | null {
  const file = join(dir, ".cache", "cut.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/**
 * The timeline for a project, cached in its vault directory as timeline.json.
 * The key is HEAD and the map's roots: a new commit, or a remap that cut the
 * code differently, reads git again; opening it twice does not.
 */
export function cachedTimeline(root: string, dir: string, map: MapFile): Timeline {
  const cut = cutOf(dir);
  const head = git(root, "rev-parse", "--short", "HEAD").trim();
  const key = [head, ...map.AUTHORED.map((r) => r.id), cut ? "cut" : "cited"].join(" ");
  const file = join(dir, "timeline.json");
  try {
    const hit = JSON.parse(readFileSync(file, "utf8"));
    if (hit.key === key) return hit.timeline;
  } catch {
    /* none yet */
  }
  const timeline = timelineOf(root, map, cut);
  writeFileSync(file, JSON.stringify({ key, timeline }) + "\n");
  return timeline;
}

/** The chapters a story run wrote, if one has. */
export function storyOf(dir: string): Story | null {
  const file = join(dir, "story.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/**
 * What is wrong with a set of chapters, against the timeline they tell:
 * every end a real commit, each chapter's ends in order, the chapters in
 * order without overlapping, and roots that exist. The words are held to the
 * map's own rules (D38): a title of a few words, a detail of two sentences.
 */
export function chapterProblems(chapters: Chapter[], t: Timeline): string[] {
  const at = new Map(t.commits.map((c, i) => [c.short, i]));
  const ids = new Set(t.roots.map((r) => r.id));
  const out: string[] = [];
  if (chapters.length < 2 || chapters.length > 12) out.push(`Tell it in 2 to 12 chapters, not ${chapters.length}.`);
  let last = -1;
  chapters.forEach((c, n) => {
    const name = `Chapter ${n + 1} ("${c.title}")`;
    const a = at.get(c.from);
    const b = at.get(c.to);
    if (a === undefined) out.push(`${name}: "${c.from}" is not a commit in the list.`);
    if (b === undefined) out.push(`${name}: "${c.to}" is not a commit in the list.`);
    if (a !== undefined && b !== undefined) {
      if (a > b) out.push(`${name}: it starts at ${c.from}, which comes after its end ${c.to}.`);
      if (a <= last) out.push(`${name}: it starts at ${c.from}, inside the chapter before it.`);
      last = Math.max(last, b);
    }
    const words = c.title.trim().split(/\s+/).filter(Boolean).length;
    if (words < 1 || words > 4) out.push(`${name}: a title is 1 to 4 words, this is ${words}.`);
    if (c.detail.split(/\s+/).filter(Boolean).length > 40 || (c.detail.match(/[.!?](\s|$)/g)?.length ?? 0) > 2)
      out.push(`${name}: the detail is at most two sentences and 40 words.`);
    for (const r of c.roots) if (!ids.has(r)) out.push(`${name}: "${r}" is not one of the map's roots.`);
  });
  return out;
}
