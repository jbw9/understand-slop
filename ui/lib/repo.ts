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
 * Where the mapped repository lives is decided by the desktop app
 * (src-tauri/src/repo.rs): `SLOP_REPO_ROOT`, else `~/Desktop/Code/<RUN.repo>`.
 * The fallback is not written out as a literal path: `/Users/<name>/…` is true
 * on one machine, and on every other one the code level silently fell back to
 * the pasted quote it exists to replace.
 */

export interface SliceRequest {
  /** Repo-relative path. Must stay inside the repo root once resolved. */
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
 * Path safety: resolve the path and confirm it is still under the repo root.
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
 * - Inside the repo root only, same containment check as the read.
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

import { invoke } from "@tauri-apps/api/core";
import { RUN } from "@/lib/map";

/*
 * The filesystem half lives in Rust (src-tauri/src/repo.rs): the containment
 * check that is the whole security model, the clamped read, and the
 * read-compare-write that refuses a stale save. What stays here is what the
 * repository has no opinion about: whether the map's quote still holds, and
 * the diff shown after a save. Rust refusals arrive as a rejected `invoke`
 * whose reason is the refusal string ("outside repo", "not a file").
 */

/** Bound once: the first read or write finds the repo the map describes. */
let opened: Promise<string> | null = null;
const repo = () => (opened ??= invoke<string>("open_repo", { name: RUN.repo }).catch((e) => {
  opened = null;
  throw e;
}));

/** Thrown when a read is refused, carrying the refusal. */
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
  let slice: Omit<Slice, "matchesFixture">;
  try {
    await repo();
    slice = await invoke("read_slice", { file: req.file, start: req.start, end: req.end });
  } catch (e) {
    throw new Refused(typeof e === "string" ? e : "unreadable");
  }
  return {
    ...slice,
    // No fixture to compare against is not a mismatch — a caller that asked
    // only for the file's text has made no claim that could have drifted.
    matchesFixture: fixture === undefined || quoteHolds(fixture, slice.code),
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
  try {
    await repo();
    const r = await invoke<{ ok: boolean; refused?: string }>("write_slice", { ...req });
    return r.ok
      ? { ok: true, diff: unified(req.file, req.start, req.expected, req.code) }
      : { ok: false, diff: "", refused: r.refused };
  } catch (e) {
    return { ok: false, diff: "", refused: typeof e === "string" ? e : "unwritable" };
  }
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
