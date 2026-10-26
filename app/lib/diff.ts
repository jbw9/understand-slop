/**
 * What a commit did to the map.
 *
 * Reviewing a diff by reading hunks is reading the change in the code's own
 * terms. This answers it in the map's terms instead: which sections the change
 * touched, and — where there are two maps to compare — which boxes, rows and
 * columns went away and which arrived, so a dropped database column reads as a
 * red row beside the green ones rather than as a `-` in a migration file.
 *
 * The git and line arithmetic is scripts/generate/gitdiff.ts, shared verbatim
 * with the updater: a section is `changed` here under exactly the test that
 * makes the updater redo it, so the diff never marks a section the update
 * would have left alone.
 *
 * Two comparisons, both the reader's to pick:
 *   - the map's commit → the working tree, the default, which is the one that
 *     answers "what have I done since the map was made" and the only one that
 *     can see uncommitted work;
 *   - any two commits, for reviewing someone else's.
 *
 * Section verdicts need the map's line references to mean something on the
 * `from` side, which is true only when `from` IS the map's commit. Any other
 * pair gets `basis: "files"` and says so, rather than citing sections against
 * numbering they were never written for.
 */

import type { Anatomy, Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { changes, diffOf, git, hasAt, refs, touches, type Change } from "@/scripts/generate/gitdiff";

export type Verdict = "added" | "removed" | "changed" | "untouched";

/** What a change did to one file, as the diff view needs it — without the two full texts. */
export interface FileChange {
  path: string;
  /** `added` and `removed` are the file's own fate, not a section's. */
  verdict: Exclude<Verdict, "untouched">;
  /** A unified diff with context, as `git diff` prints it. */
  diff: string;
  added: number;
  removed: number;
}

export interface SectionDiff {
  id: string;
  title: string;
  /** Root first, this section last, as ids — the path the canvas navigates by. */
  path: string[];
  verdict: Verdict;
  /** The files behind the verdict, and the lines in each this section cites. */
  files: { path: string; lines: { s: number; e: number }[] }[];
}

/** One row of a `schema`, `table` or `facts` block, matched across the two maps by its key. */
export interface RowDiff {
  key: string;
  verdict: Verdict;
  /** The cells as the `from` map had them, kept so a removed row can still be drawn. */
  before?: string[];
  after?: string[];
}

/** One box or arrow of a `diagram`, matched by id (boxes) or `from→to` (arrows). */
export interface PartDiff {
  key: string;
  verdict: Verdict;
  label?: string;
}

export interface BlockDiff {
  /** Where the block is: the section's path, then its index in `anatomy`. */
  path: string[];
  at: number;
  kind: Anatomy["kind"];
  verdict: Verdict;
  rows?: RowDiff[];
  boxes?: PartDiff[];
  arrows?: PartDiff[];
}

export interface MapDiff {
  /**
   * `sections` when the verdicts are the map's own sections, `files` when the
   * two commits asked for leave the map's line references meaningless and only
   * the file list can be trusted. The view says which it is showing; it never
   * dresses one up as the other.
   */
  basis: "sections" | "files";
  from: string;
  /** The resolved `to`, or null for the working tree. */
  to: string | null;
  /** Why the basis is `files`, where it is. */
  why?: string;
  /**
   * How a human-written `from`/`to` was understood, per side, where one was
   * given. Optional: a diff asked for by sha has nothing to explain.
   */
  read?: { from?: string; to?: string };
  files: FileChange[];
  sections: SectionDiff[];
  /** Only where a second map was given to compare against. */
  blocks: BlockDiff[];
}

/* ── the two comparisons ─────────────────────────────────────── */

/** `from`..`to` as `Change`s, the shape `changes()` returns for the working tree. */
function between(repo: string, from: string, to: string): Change[] {
  const paths = new Set(git(repo, "diff", "--name-only", from, to).split("\n"));
  paths.delete("");
  const out: Change[] = [];
  for (const path of [...paths].sort()) {
    const before = hasAt(repo, from, path) ? git(repo, "show", `${from}:${path}`) : null;
    const after = hasAt(repo, to, path) ? git(repo, "show", `${to}:${path}`) : null;
    if (before === after) continue;
    out.push({ path, before, after, ...diffOf(path, before, after) });
  }
  return out;
}

/** `rev` as git resolves it, or "" where it names nothing in this checkout. */
const resolve = (repo: string, rev: string) => git(repo, "rev-parse", "--short", rev).trim();

const counted = (c: Change): FileChange => {
  const lines = c.diff.split("\n");
  return {
    path: c.path,
    verdict: c.before === null ? "added" : c.after === null ? "removed" : "changed",
    diff: c.diff,
    added: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
    removed: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
  };
};

/* ── sections ────────────────────────────────────────────────── */

interface Placed {
  node: Node;
  path: Node[];
}

/** Every section, root first. Mirrors `walk` in scripts/generate/update.ts. */
function walk(roots: Node[]): Placed[] {
  const out: Placed[] = [];
  const go = (n: Node, up: Node[]) => {
    const path = [...up, n];
    out.push({ node: n, path });
    for (const c of n.children ?? []) go(c, path);
  };
  roots.forEach((r) => go(r, []));
  return out;
}

/**
 * A section's verdict from its own references, the same test `targets()` makes:
 * `changed` where a reference overlaps a changed line, `removed` where every
 * file it cites is gone. `added` is never reached from one map — a section the
 * `to` side has and the `from` side does not can only be seen by comparing two
 * trees, which `treeDiff` does.
 */
function verdicts(map: MapFile, byPath: Map<string, Change>): SectionDiff[] {
  return walk(map.AUTHORED).map(({ node, path }) => {
    const files = new Map<string, { s: number; e: number }[]>();
    let gone = 0;
    let cited = 0;
    for (const r of refs(node)) {
      const c = byPath.get(r.file);
      if (!c) continue;
      cited++;
      if (c.after === null) gone++;
      if (!touches(c, r.s, r.e)) continue;
      files.set(r.file, [...(files.get(r.file) ?? []), { s: r.s, e: r.e }]);
    }
    return {
      id: node.id,
      title: node.title,
      path: path.map((n) => n.id),
      verdict: files.size === 0 ? "untouched" : cited > 0 && gone === cited ? "removed" : "changed",
      files: [...files].map(([path, lines]) => ({ path, lines })),
    };
  });
}

/* ── two maps, block by block ────────────────────────────────── */

/** The key a row is matched by: a schema column's name, a table row's first cell, a pair's label. */
function rowsOf(b: Anatomy): { key: string; cells: string[] }[] | undefined {
  switch (b.kind) {
    case "schema":
      return b.rows.map((c) => ({ key: c.name, cells: [c.name, c.type, c.key ?? "", c.nullable ? "null" : "", c.note ?? ""] }));
    case "table":
      return b.rows.map((r) => ({ key: r[0] ?? "", cells: r }));
    case "facts":
      return b.rows.map((r) => ({ key: r.label, cells: [r.label, r.value] }));
    case "routes":
      return b.rows.map((r) => ({ key: `${r.method} ${r.path}`, cells: [r.method, r.path, r.auth, r.note ?? ""] }));
    case "flow":
      return b.rows.map((r) => ({ key: String(r.n), cells: [String(r.n), r.title, r.detail] }));
    case "chips":
      return b.rows.map((r) => ({ key: r.label, cells: [r.label, r.note ?? ""] }));
    case "map":
      return b.rows.map((r) => ({ key: r.from, cells: [r.from, r.to] }));
    default:
      return undefined;
  }
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Rows matched by key: what the `from` side had, what the `to` side has, and
 * what changed in between.
 *
 * Keyed by the key AND how many rows before it already used that key, because
 * a first cell is not unique. The `explorify-example › ex-lifecycle` table
 * names `launch` and `create-event` twice each, as the start of two different
 * hops; matching on the bare key collapsed each pair to its last row and made
 * two byte-identical maps report four changed rows.
 */
function rowDiff(a: Anatomy, b: Anatomy): RowDiff[] | undefined {
  const was = rowsOf(a);
  const now = rowsOf(b);
  if (!was || !now) return undefined;
  const nth = (rows: { key: string }[]) => {
    const seen = new Map<string, number>();
    return rows.map((r) => {
      const n = seen.get(r.key) ?? 0;
      seen.set(r.key, n + 1);
      return `${r.key}#${n}`;
    });
  };
  const wasAt = nth(was);
  const nowAt = nth(now);
  const has = new Map(nowAt.map((k, i) => [k, i]));
  // Walked in the `to` side's order, with each removed row emitted where it
  // used to be — so a dropped column sits red among the ones that stayed and a
  // renamed one reads as a row out beside a row in, which is the whole point.
  const out: RowDiff[] = [];
  // A row the `to` side still has somewhere was only moved, so it is passed
  // over here and reported where it now is. Only a row with no counterpart
  // anywhere is `removed`.
  const gone = (i: number) => {
    if (!has.has(wasAt[i])) out.push({ key: was[i].key, verdict: "removed", before: was[i].cells });
  };
  let i = 0;
  for (const [j, k] of nowAt.entries()) {
    const from = wasAt.indexOf(k);
    // Everything the `from` side had before this row went away here.
    while (i < from || (i < was.length && from === -1 && !has.has(wasAt[i]))) gone(i++);
    if (from === -1) {
      out.push({ key: now[j].key, verdict: "added", after: now[j].cells });
      continue;
    }
    out.push({ key: now[j].key, verdict: same(was[from].cells, now[j].cells) ? "untouched" : "changed", before: was[from].cells, after: now[j].cells });
    // A row that moved earlier must not rewind `i` over rows already reported.
    i = Math.max(i, from + 1);
  }
  while (i < was.length) gone(i++);
  return out;
}

const parts = (
  was: { key: string; label?: string }[],
  now: { key: string; label?: string }[],
): PartDiff[] => {
  const has = new Set(now.map((p) => p.key));
  const had = new Map(was.map((p) => [p.key, p]));
  return [
    ...was.map((p): PartDiff => ({ key: p.key, label: p.label, verdict: has.has(p.key) ? (had.get(p.key)!.label === now.find((q) => q.key === p.key)!.label ? "untouched" : "changed") : "removed" })),
    ...now.filter((p) => !had.has(p.key)).map((p): PartDiff => ({ key: p.key, label: p.label, verdict: "added" })),
  ];
};

/** One block's diff, or null where the two are identical. */
function blockDiff(path: string[], at: number, a: Anatomy, b: Anatomy): BlockDiff | null {
  if (a.kind === "diagram" && b.kind === "diagram") {
    const boxes = parts(a.boxes.map((x) => ({ key: x.id, label: x.label })), b.boxes.map((x) => ({ key: x.id, label: x.label })));
    const arrows = parts(
      a.arrows.map((x) => ({ key: `${x.from}→${x.to}`, label: x.label })),
      b.arrows.map((x) => ({ key: `${x.from}→${x.to}`, label: x.label })),
    );
    const moved = [...boxes, ...arrows].some((p) => p.verdict !== "untouched");
    return moved ? { path, at, kind: "diagram", verdict: "changed", boxes, arrows } : null;
  }
  const rows = rowDiff(a, b);
  if (!rows) return JSON.stringify(a) === JSON.stringify(b) ? null : { path, at, kind: a.kind, verdict: "changed" };
  return rows.some((r) => r.verdict !== "untouched") ? { path, at, kind: a.kind, verdict: "changed", rows } : null;
}

/**
 * Two maps' section trees, matched by id: sections that arrived, sections that
 * went, and within the ones both have, the blocks whose rows or boxes moved.
 *
 * Exported because this is the half that does not need git at all: given any
 * two `MapFile`s — two commits' maps, or a map before and after an update —
 * it says what changed on the map itself.
 */
export function treeDiff(a: MapFile, b: MapFile): { sections: SectionDiff[]; blocks: BlockDiff[] } {
  const was = walk(a.AUTHORED);
  const now = new Map(walk(b.AUTHORED).map((p) => [p.node.id, p]));
  const sections: SectionDiff[] = [];
  const blocks: BlockDiff[] = [];
  for (const { node, path } of was) {
    const ids = path.map((n) => n.id);
    const to = now.get(node.id);
    if (!to) {
      sections.push({ id: node.id, title: node.title, path: ids, verdict: "removed", files: [] });
      continue;
    }
    const mine = node.anatomy ?? [];
    const theirs = to.node.anatomy ?? [];
    for (const [i, block] of mine.entries()) {
      // Blocks are not identified, so they are matched by position within the
      // kinds of block the section has — the only stable handle on them.
      const other = theirs.filter((x) => x.kind === block.kind)[mine.slice(0, i).filter((x) => x.kind === block.kind).length];
      if (!other) {
        blocks.push({ path: ids, at: i, kind: block.kind, verdict: "removed" });
        continue;
      }
      const d = blockDiff(ids, i, block, other);
      if (d) blocks.push(d);
    }
    // Added is the mirror of removed: past the count of that kind it had.
    for (const [i, block] of theirs.entries())
      if (theirs.slice(0, i).filter((x) => x.kind === block.kind).length >= mine.filter((x) => x.kind === block.kind).length)
        blocks.push({ path: ids, at: i, kind: block.kind, verdict: "added" });
    const fields = (["title", "sub", "detail", "state"] as const).some((k) => node[k] !== to.node[k]);
    sections.push({
      id: node.id,
      title: to.node.title,
      path: ids,
      verdict: fields || blocks.some((x) => x.path.join("/") === ids.join("/")) ? "changed" : "untouched",
      files: [],
    });
  }
  for (const [id, { node, path }] of now)
    if (!was.some((p) => p.node.id === id))
      sections.push({ id, title: node.title, path: path.map((n) => n.id), verdict: "added", files: [] });
  return { sections, blocks };
}

/* ── a ref a human typed ─────────────────────────────────────── */

/**
 * What `resolveRef` understood, so the UI can show its reading back.
 *
 * `commit` is the sha the range side becomes. `span` is true where the phrase
 * named ONE commit and so means "what that commit did" — see `resolveRef`.
 */
export interface Resolved {
  commit: string;
  /** A short line for the UI: the reading, the sha, and the subject. */
  how: string;
  span?: boolean;
}

/** `%h "subject"`, for saying which commit a phrase landed on. */
const describe = (root: string, commit: string) => {
  const line = git(root, "log", "-1", "--format=%h %s", commit).trim();
  const at = line.indexOf(" ");
  return at === -1 ? line : `${line.slice(0, at)} "${line.slice(at + 1)}"`;
};

/** The phrase as git itself reads it, where git reads it at all. */
const verify = (root: string, rev: string) => git(root, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`).trim();

/**
 * A commit from an English phrase, or an error naming what was tried.
 *
 * Anything git already understands — a sha, `HEAD`, `HEAD~2`, a tag, a branch —
 * is passed through first, because a caller who typed a real ref means it. Only
 * what git refuses is read as English, and only these shapes:
 *
 *   last/latest/previous commit [by <author>] · <author>'s last commit
 *   N commits ago · last N commits
 *
 * `span` marks the first group: naming a single commit ("the last commit by
 * hindra2") is how people say "show me what THAT commit changed", which is
 * `<it>~1..<it>`, not `<it>..`. The caller opens the range; this only says the
 * phrase asked for one, and `how` states the range either way so the reading is
 * never silent. "N commits ago" is a point, not a span — it names where to
 * start measuring from, so it is left alone.
 *
 * No phrase ever falls back to HEAD. A diff against the wrong commit that
 * claims to be right is worse than an error.
 */
export function resolveRef(root: string, phrase: string): Resolved | { error: string } {
  const raw = phrase.trim();
  if (!raw) return { error: "No revision given." };

  const asRef = verify(root, raw);
  if (asRef) return { commit: asRef, how: describe(root, asRef) };

  const text = raw.toLowerCase().replace(/[.!?]+$/, "").trim();

  // "3 commits ago", "last 3 commits" → HEAD~3.
  const back = /^(?:the\s+)?(?:last|previous)\s+(\d+)\s+commits?$/.exec(text) ?? /^(\d+)\s+commits?\s+(?:ago|back)$/.exec(text);
  if (back) {
    const n = Number(back[1]);
    const commit = verify(root, `HEAD~${n}`);
    return commit
      ? { commit, how: `${n} commit${n === 1 ? "" : "s"} before HEAD · ${describe(root, commit)}` }
      : { error: `Tried HEAD~${n} for "${raw}", and this checkout does not go back that far.` };
  }

  // "last commit", "the latest commit by hindra2", "hindra2's last commit".
  const mine = /^(?:the\s+)?(?:last|latest|previous|most\s+recent)\s+commit(?:\s+(?:by|from|of)\s+(.+))?$/.exec(text);
  const theirs = /^(.+?)(?:'s|s')\s+(?:last|latest|previous|most\s+recent)\s+commit$/.exec(text);
  if (!mine && !theirs) return { error: `Could not read "${raw}" as a revision: git does not know it, and it is not a phrase this understands (try "last commit", "last commit by <author>", or "2 commits ago").` };

  const author = (mine?.[1] ?? theirs?.[1])?.trim();
  if (!author) {
    const commit = verify(root, "HEAD");
    return commit ? { commit, how: `the last commit · ${describe(root, commit)}`, span: true } : { error: "This checkout has no commits." };
  }
  // `git log --author` already matches substrings and regex against both name
  // and email, so `hindra2` finds `Hindra2 <h@x.com>`. Reimplementing that
  // against a log dump would only be a worse version of it. `-i` because the
  // phrase reached here lowercased, and --author is case-sensitive without it:
  // a full name typed as the user says it would otherwise never match.
  const commit = git(root, "log", "-1", "-i", "--format=%H", `--author=${author}`).trim();
  if (!commit) return { error: `No commit by "${author}" in this checkout's history (searched author names and emails with git log --author).` };
  return { commit, how: `${author}'s last commit · ${describe(root, commit)}`, span: true };
}

/* ── the answer ──────────────────────────────────────────────── */

/**
 * What changed in `root` between `from` and `to`, in the map's terms.
 *
 * `to` undefined is the working tree, uncommitted work included. `other` is the
 * `to` side's own map where one exists; without it there is one map, so the
 * answer is section verdicts off the code and no block diff.
 */
export function mapDiff(root: string, from: string | undefined, to: string | undefined, map: MapFile, other?: MapFile): MapDiff {
  const base = resolve(root, from ?? map.RUN.commit);
  const head = to ? resolve(root, to) : null;
  if (!base) throw new RangeError(`no such commit: ${from ?? map.RUN.commit}`);
  if (to && !head) throw new RangeError(`no such commit: ${to}`);

  const found = head ? between(root, base, head) : changes(root, base, {});
  const files = found.map(counted);
  const byPath = new Map(found.map((c) => [c.path, c]));

  // The map's line references are numbered at the map's commit. Checking them
  // against a diff that starts anywhere else would cite real sections against
  // lines they were never written for, which is worse than declining to.
  const mapped = resolve(root, map.RUN.commit);
  if (other) {
    const { sections, blocks } = treeDiff(map, other);
    return { basis: "sections", from: base, to: head, files, sections, blocks };
  }
  if (mapped && base === mapped) return { basis: "sections", from: base, to: head, files, sections: verdicts(map, byPath), blocks: [] };
  return {
    basis: "files",
    from: base,
    to: head,
    why: `The map was made at ${mapped || map.RUN.commit}, and only one map exists, so its line references say nothing about ${base}. Comparing files instead.`,
    files,
    sections: [],
    blocks: [],
  };
}

/** The last `n` commits, newest first, for the two pickers. */
export function commitList(root: string, n = 50): { commit: string; subject: string }[] {
  return git(root, "log", `-n${n}`, "--format=%h\t%s")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf("\t");
      return { commit: l.slice(0, at), subject: l.slice(at + 1) };
    });
}
