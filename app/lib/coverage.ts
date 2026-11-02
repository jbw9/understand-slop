/**
 * How much of the repository the map explains, and where each line of it is
 * explained — one definition shared by the generator, which holds a root to
 * it, and the app, which finds things with it.
 *
 * A line counts as explained only where the reader can open it: a leaf's own
 * code, or the lines a step or message cites (D67, D68). Refs above a leaf
 * back its claims but are never shown, so citing a whole file on a root says
 * nothing about whether anyone can find a function in it.
 */
import type { Anatomy, Node } from "@/lib/data";

/** One top-level thing in a file, as the summary named it. */
export interface Sym {
  name: string;
  start: number;
  end: number;
  does: string;
}

/** What the map knows about one file of the checkout, explained or not. */
export interface IndexFile {
  /** The roots that own it, by the cut. */
  roots: string[];
  /** `source` must be explained; `excluded` was left out with `reason`; `other` is tests, config, docs or assets. */
  status: "source" | "excluded" | "other";
  reason?: string;
  kind?: string;
  purpose?: string;
  lines: number;
  symbols: Sym[];
}

/** `<out>/index.json`: every file of the checkout, written beside map.json. */
export interface MapIndex {
  commit: string;
  files: Record<string, IndexFile>;
}

/** One span the reader can open, and the level that opens it. */
export interface Citation {
  file: string;
  start: number;
  end: number;
  /** Node ids from the root down to the level citing it. */
  path: string[];
}

/** Shorter than this is a constant or a re-export: listed, never required. */
export const TRIVIAL_LINES = 3;

const AT = /^(.+):(\d+)(?:-(\d+))?$/;

/** Every step's and message's `at`, however deep under `under`. Diagram arrows are not drawn as code, so they do not count. */
function stepsIn(blocks: Anatomy[] | undefined, out: Omit<Citation, "path">[]) {
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const m = typeof o.at === "string" && ("title" in o || "from" in o) ? AT.exec(o.at) : null;
    if (m) out.push({ file: m[1], start: +m[2], end: +(m[3] ?? m[2]) });
    for (const x of Object.values(o)) if (x && typeof x === "object") visit(x);
  };
  for (const b of blocks ?? []) if (b.kind !== "diagram") visit(b);
}

/** Every span the reader can open, by file. */
export function citations(roots: Node[]): Map<string, Citation[]> {
  const out = new Map<string, Citation[]>();
  const walk = (n: Node, path: string[]) => {
    const here: Omit<Citation, "path">[] = [];
    if (!n.children?.length) for (const c of n.code ?? []) here.push({ file: c.file, start: c.start, end: c.end });
    stepsIn(n.anatomy, here);
    for (const c of here) out.set(c.file, [...(out.get(c.file) ?? []), { ...c, path }]);
    for (const c of n.children ?? []) walk(c, [...path, c.id]);
  };
  for (const r of roots) walk(r, [r.id]);
  return out;
}

/** The levels that open a line (or any of a span), deepest first. */
export function nodesAt(cited: Map<string, Citation[]>, file: string, start: number, end = start): Citation[] {
  return (cited.get(file) ?? []).filter((c) => c.start <= end && c.end >= start).sort((a, b) => b.path.length - a.path.length);
}

export const required = (s: Sym) => s.end - s.start + 1 > TRIVIAL_LINES;

/** A file's symbols, each with the levels that open it. */
export function symbolsOf(cited: Map<string, Citation[]>, file: string, f: Pick<IndexFile, "symbols">) {
  return f.symbols.map((s) => ({ ...s, by: nodesAt(cited, file, s.start, s.end) }));
}

/** Required symbols explained, over the files that must be explained. */
export function coverage(index: MapIndex, roots: Node[]) {
  const cited = citations(roots);
  let symbols = 0;
  let explained = 0;
  const gaps: { file: string; symbol: Sym }[] = [];
  for (const [file, f] of Object.entries(index.files)) {
    if (f.status !== "source") continue;
    for (const s of symbolsOf(cited, file, f)) {
      if (!required(s)) continue;
      symbols++;
      if (s.by.length) explained++;
      else gaps.push({ file, symbol: s });
    }
  }
  const files = Object.values(index.files);
  return { symbols, explained, gaps, excluded: files.filter((f) => f.status === "excluded").length, cited };
}
