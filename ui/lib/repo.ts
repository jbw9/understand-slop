/**
 * Binding the map to a real repository. Frozen contract for this round.
 *
 * Until now every `source` block was text pasted into `lib/taxbuddy.ts` by
 * hand. That text was verified once, at authoring time, and drifts silently
 * the moment the real file changes — which is exactly the failure this project
 * exists to study. These functions read the file instead.
 *
 * `~/Desktop/Code/taxBuddy` is a live git checkout; every spot-checked
 * file:line in the fixture resolved to the right line, so the anchors are
 * trustworthy enough to read against.
 */

/**
 * Where the mapped repository lives. Absolute, from env, one repo per run.
 *
 * The fallback is the mapped repo's own directory under the home directory,
 * not written out: a literal `/Users/<name>/…` is true on one machine, and on
 * every other one the code level silently fell back to the pasted quote it
 * exists to replace.
 */
export const REPO_ROOT =
  process.env.SLOP_REPO_ROOT ?? resolve(homedir(), "Desktop/Code", RUN.repo);

export interface SliceRequest {
  /** Repo-relative path. Must stay inside REPO_ROOT once resolved. */
  file: string;
  /** 1-indexed first line. */
  start: number;
  /** 1-indexed last line, inclusive. */
  end: number;
}

export interface Slice extends SliceRequest {
  /** Verbatim lines, newline-joined. Indentation preserved exactly. */
  code: string;
  /** Total lines in the file, so the UI can say "733 of 1,204". */
  total: number;
  /**
   * True when the file on disk still matches what the fixture quoted.
   * A false here is a FINDING, not an error: it means the map has drifted from
   * the code, and the UI must say so rather than quietly showing fresh text
   * under a stale explanation.
   */
  matchesFixture: boolean;
}

/**
 * Read a slice of a real file.
 *
 * Path safety: resolve the path and confirm it is still under REPO_ROOT.
 * `../` traversal, absolute paths and symlinks pointing outside are refused —
 * this endpoint reads arbitrary caller-supplied paths, so the containment check
 * is the whole security model.
 */
export type ReadSlice = (req: SliceRequest) => Promise<Slice>;

/**
 * Write an edited slice back.
 *
 * Deliberately narrow, because this is the one operation in the product that
 * can destroy work:
 *
 * - Inside REPO_ROOT only, same containment check as the read.
 * - One contiguous slice of one file per call.
 * - `expected` must match what is currently on disk, or the write is refused.
 *   This is optimistic concurrency: it stops a save built on a stale read from
 *   overwriting a change made in the editor since.
 * - The caller is shown a diff and confirms before this is ever invoked.
 *
 * The UI never writes on blur, on a timer, or on navigation. Only on an
 * explicit save.
 */
export interface WriteRequest extends SliceRequest {
  /** The replacement text for [start, end]. */
  code: string;
  /** What the caller believes is currently at [start, end]. Verified first. */
  expected: string;
}

export interface WriteResult {
  ok: boolean;
  /** Unified diff of what changed, for display after the fact. */
  diff: string;
  /** Set when refused: "outside repo", "stale", "not a file". */
  refused?: string;
}

export type WriteSlice = (req: WriteRequest) => Promise<WriteResult>;

// ---------------------------------------------------------------------------
// Implementation. The types above are the frozen contract; everything below
// satisfies it and adds nothing to it.
// ---------------------------------------------------------------------------

import { readFile, writeFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { homedir } from "node:os";
import { RUN } from "@/lib/map";

/**
 * The entire security model, in one function.
 *
 * `file` arrives from the network, so it is assumed hostile. Three things are
 * checked, in this order, because each one defeats a different attack:
 *
 * 1. `resolve(REPO_ROOT, file)` collapses `../` textually — this is what stops
 *    `../../../etc/passwd` and, because `resolve` discards the base when given
 *    an absolute second argument, it also folds absolute paths back through the
 *    same prefix test rather than silently honouring them.
 * 2. The prefix test uses `root + sep`, not bare `startsWith(root)`. Without the
 *    separator `/Users/.../taxBuddy-secrets` passes as if it were inside
 *    `/Users/.../taxBuddy`.
 * 3. `realpath` resolves symlinks and the prefix test runs AGAIN on the result.
 *    Step 1 is pure string arithmetic and cannot see a link inside the repo
 *    pointing out of it; only asking the filesystem can.
 *
 * Returns the real absolute path, or null when the path escapes.
 */
async function contain(file: string): Promise<string | null> {
  const root = await realpath(REPO_ROOT);
  const inside = (p: string) => p === root || p.startsWith(root + sep);

  const target = resolve(root, file);
  if (!inside(target)) return null;

  // realpath throws ENOENT on a path that does not exist, which is a refusal
  // here rather than an error: there is nothing to read and nothing to write.
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    return null;
  }
  return inside(real) ? real : null;
}

/** Thrown to the route handler, which turns it into a 400 with this message. */
export class Refused extends Error {}

/**
 * `fixture` is extra, and deliberately not in the contract: it is what the MAP
 * claims sits at these lines, which the repository itself has no opinion about.
 * An optional parameter keeps this assignable to the frozen `ReadSlice` type —
 * asserted below — so callers holding that type are unaffected.
 */
export const readSlice = async (
  req: SliceRequest,
  fixture?: string,
): Promise<Slice> => {
  const real = await contain(req.file);
  if (!real) throw new Refused("outside repo");
  if (!(await stat(real)).isFile()) throw new Refused("not a file");

  const lines = (await readFile(real, "utf8")).split("\n");
  const start = Math.max(1, req.start);
  const end = Math.min(lines.length, Math.max(start, req.end));
  const code = lines.slice(start - 1, end).join("\n");

  return {
    file: req.file,
    start,
    end,
    code,
    total: lines.length,
    // No fixture to compare against is not a mismatch — a caller that asked
    // only for the file's text has made no claim that could have drifted.
    matchesFixture: fixture === undefined || quoteHolds(fixture, code),
  };
};

/** Conformance to the frozen contract, checked by the compiler. */
const _readSliceConforms: ReadSlice = readSlice;
void _readSliceConforms;

/**
 * Does the fixture's quote still hold against what is on disk?
 *
 * Exact equality is the normal answer. The one accepted relaxation is a quote
 * whose LAST line stops part-way through the real line — the fixture quotes
 * prose out of JSX that way, taking a sentence and leaving the rest of the
 * line. Every other line must match byte for byte, including indentation.
 *
 * Everything else is drift, and drift is a finding: the explanation attached to
 * this quote was written about text that is no longer there.
 */
function quoteHolds(fixture: string, disk: string): boolean {
  if (fixture === disk) return true;
  const f = fixture.replace(/\n$/, "").split("\n");
  const d = disk.replace(/\n$/, "").split("\n");
  if (f.length !== d.length) return false;
  const last = f.length - 1;
  return (
    f.slice(0, last).every((line, i) => line === d[i]) &&
    d[last].startsWith(f[last])
  );
}

export const writeSlice: WriteSlice = async (req) => {
  const real = await contain(req.file);
  if (!real) return { ok: false, diff: "", refused: "outside repo" };
  if (!(await stat(real)).isFile()) {
    return { ok: false, diff: "", refused: "not a file" };
  }

  const lines = (await readFile(real, "utf8")).split("\n");
  if (req.start < 1 || req.end > lines.length || req.end < req.start) {
    return { ok: false, diff: "", refused: "stale" };
  }

  // Optimistic concurrency. The caller read [start, end] at some point and is
  // now writing back a change to it; if disk no longer holds what they read,
  // their edit was composed against text that has since been replaced and
  // applying it would silently destroy whoever made that replacement.
  const onDisk = lines.slice(req.start - 1, req.end).join("\n");
  if (onDisk !== req.expected) {
    return { ok: false, diff: "", refused: "stale" };
  }

  const replacement = req.code.replace(/\n$/, "").split("\n");
  const next = [
    ...lines.slice(0, req.start - 1),
    ...replacement,
    ...lines.slice(req.end),
  ];
  await writeFile(real, next.join("\n"), "utf8");

  return { ok: true, diff: unified(req.file, req.start, onDisk, req.code) };
};

/**
 * A unified diff of just the replaced slice.
 *
 * Whole-line add/remove, no LCS: the slice is small, contiguous and already
 * known to be the only thing that changed, so the alignment a real diff
 * algorithm buys is alignment nobody would read. A dependency for this would
 * be a dependency for cosmetics.
 */
function unified(file: string, start: number, before: string, after: string) {
  const b = before.replace(/\n$/, "").split("\n");
  const a = after.replace(/\n$/, "").split("\n");
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start},${b.length} +${start},${a.length} @@`,
    ...b.map((l) => `-${l}`),
    ...a.map((l) => `+${l}`),
  ].join("\n");
}
