/**
 * Reading what changed in a checkout, and moving a map's line references with
 * it. Extracted from scripts/generate/update.ts, which still owns deciding
 * which sections to redo and redoing them; this is only the git and
 * line-arithmetic half.
 *
 * It is shared because the visual diff (lib/diff.ts) asks the same questions
 * an update asks — what changed since the map was made, and where did each
 * cited line go — and two implementations of `moved` would drift into two
 * different answers about the same commit.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- walks map JSON, typed or not */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Node } from "@/lib/data";

/** A run of changed lines: `ol` old lines from `os` became `nl` new ones from `ns`. With `ol` 0, lines were inserted after `os`. */
export interface Hunk {
  os: number;
  ol: number;
  ns: number;
  nl: number;
}

export interface Change {
  path: string;
  before: string | null;
  after: string | null;
  hunks: Hunk[];
  /** For the agent: a unified diff with a little context. */
  diff: string;
}

export const git = (repo: string, ...args: string[]) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/* ── 1. what changed ─────────────────────────────────────────── */

/** The text the map was made from, per path: null where the file did not exist. */
export type Base = Record<string, string | null>;

export function readText(path: string): string | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return buf.includes(0) ? null : buf.toString("utf8");
}

/** `git diff --no-index` between two texts, as hunks and as a readable diff. */
export function diffOf(path: string, before: string | null, after: string | null): Pick<Change, "hunks" | "diff"> {
  const dir = mkdtempSync(join(tmpdir(), "slop-diff-"));
  try {
    const a = join(dir, "a");
    const b = join(dir, "b");
    writeFileSync(a, before ?? "");
    writeFileSync(b, after ?? "");
    const run = (u: number) => {
      try {
        return execFileSync("git", ["diff", "--no-index", "--no-color", `-U${u}`, a, b], { encoding: "utf8", maxBuffer: 64 << 20 });
      } catch (e: any) {
        // 1 means "they differ", which is the point.
        return String(e.stdout ?? "");
      }
    };
    const hunks = [...run(0).matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => ({
      os: Number(m[1]),
      ol: m[2] === undefined ? 1 : Number(m[2]),
      ns: Number(m[3]),
      nl: m[4] === undefined ? 1 : Number(m[4]),
    }));
    const body = run(3).split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
    return { hunks, diff: [`--- ${before === null ? "/dev/null" : `a/${path}`}`, `+++ ${after === null ? "/dev/null" : `b/${path}`}`, ...body].join("\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every file whose text differs from what the map last saw. */
export function changes(repo: string, commit: string, base: Base): Change[] {
  const paths = new Set([
    ...git(repo, "diff", "--name-only", commit).split("\n"),
    ...git(repo, "ls-files", "--others", "--exclude-standard").split("\n"),
    ...Object.keys(base),
  ]);
  paths.delete("");
  const out: Change[] = [];
  for (const path of [...paths].sort()) {
    const before = path in base ? base[path] : hasAt(repo, commit, path) ? git(repo, "show", `${commit}:${path}`) : null;
    const after = readText(join(repo, path));
    if (before === after) continue;
    out.push({ path, before, after, ...diffOf(path, before, after) });
  }
  return out;
}

export const hasAt = (repo: string, commit: string, path: string) => {
  try {
    execFileSync("git", ["-C", repo, "cat-file", "-e", `${commit}:${path}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/* ── 2. references ───────────────────────────────────────────── */

/** `path/to/file.ts:12` or `:12-30`, as issues, arrows and evidence cite code. */
export const CITE = /([\w@.()[\]/+-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;

export interface Span {
  file: string;
  s: number;
  e: number;
}

/**
 * A node's own references, not its children's: `{file, start, end}` code
 * refs, `{file, start, code}` quoted source, and `file:line` in any text.
 * With `move`, each is rewritten through it.
 */
export function refs(n: Node, move?: (file: string, line: number) => number): Span[] {
  const out: Span[] = [];
  const visit = (v: any, parent?: any, key?: string | number) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, v, i));
    if (typeof v === "string" && parent !== undefined) {
      for (const m of v.matchAll(CITE)) out.push({ file: m[1], s: Number(m[2]), e: Number(m[3] ?? m[2]) });
      if (move)
        parent[key!] = v.replace(CITE, (_all, f: string, a: string, b?: string) =>
          b === undefined ? `${f}:${move(f, Number(a))}` : `${f}:${move(f, Number(a))}-${move(f, Number(b))}`,
        );
      return;
    }
    if (!v || typeof v !== "object") return;
    if (typeof v.file === "string" && Number.isInteger(v.start)) {
      const e = Number.isInteger(v.end) ? v.end : typeof v.code === "string" ? v.start + v.code.split("\n").length - 1 : v.start;
      out.push({ file: v.file, s: v.start, e });
      if (move) {
        if (Number.isInteger(v.end)) v.end = move(v.file, v.end);
        v.start = move(v.file, v.start);
      }
    }
    // Quoted source stays verbatim, whatever it happens to contain.
    for (const [k, x] of Object.entries(v)) if (k !== "children" && k !== "file" && !(k === "code" && typeof x === "string")) visit(x, v, k);
  };
  visit(n);
  return out;
}

/** Whether lines s..e (old numbering) saw a change. */
export function touches(c: Change, s: number, e: number): boolean {
  if (c.after === null) return true;
  return c.hunks.some((h) => (h.ol > 0 ? h.os <= e && h.os + h.ol - 1 >= s : s <= h.os && h.os < e));
}

/** Where an old line is now, for a line no change landed on. */
export function moved(c: Change, line: number): number {
  let d = 0;
  for (const h of c.hunks) if ((h.ol > 0 ? h.os + h.ol - 1 : h.os) < line) d += h.nl - h.ol;
  return Math.max(1, line + d);
}

