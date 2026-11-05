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
  /** Which code file uses which, every language (scripts/generate/imports.ts). Absent on maps made before it. */
  imports?: Record<string, string[]>;
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

/** One link across a section's edge: the section that explains the other side (null when none does), and an import that makes it. */
export interface Link {
  path: string[] | null;
  /** The other side's file when no section explains it. */
  file: string;
  /** `from → to`, one import behind the link. */
  via: string;
  /** How many imports make it. */
  count: number;
}

/**
 * What a section's code uses and what uses it, by the import graph, each
 * named by the section that explains the other side: what a change here
 * reaches, and what it rests on. Empty on a map whose index has no imports.
 */
export function neighbours(roots: Node[], index: MapIndex | null, path: string[]): { uses: Link[]; usedBy: Link[] } {
  const imports = index?.imports;
  if (!imports || !path.length) return { uses: [], usedBy: [] };
  const cited = citations(roots);
  const under = (p: string[]) => p.length >= path.length && path.every((x, i) => p[i] === x);
  const mine = new Set<string>();
  for (const [file, cs] of cited) if (cs.some((c) => under(c.path))) mine.add(file);
  if (path.length === 1) for (const [file, f] of Object.entries(index.files)) if (f.roots.includes(path[0]) && f.status === "source") mine.add(file);
  // The section that explains a file whole: in the root citing it most, the deepest level over all its citations there.
  const explainer = (file: string): string[] | null => {
    const outside = (cited.get(file) ?? []).filter((c) => !under(c.path));
    if (!outside.length) {
      const root = index.files[file]?.roots.find((r) => r !== path[0] && roots.some((n) => n.id === r));
      return root ? [root] : null;
    }
    const by = new Map<string, Citation[]>();
    for (const c of outside) by.set(c.path[0], [...(by.get(c.path[0]) ?? []), c]);
    const most = [...by.values()].sort((a, b) => b.length - a.length)[0];
    return most.reduce((common, c) => {
      let i = 0;
      while (i < common.length && i < c.path.length && common[i] === c.path[i]) i++;
      return common.slice(0, i);
    }, most[0].path);
  };
  const collect = (pairs: [string, string, string][]): Link[] => {
    const out = new Map<string, Link>();
    for (const [other, from, to] of pairs) {
      const p = explainer(other);
      if (p && under(p)) continue;
      const key = p ? p.join("/") : other;
      const l = out.get(key);
      if (l) l.count++;
      else out.set(key, { path: p, file: other, via: `${from} → ${to}`, count: 1 });
    }
    return [...out.values()].sort((a, b) => b.count - a.count);
  };
  const uses: [string, string, string][] = [];
  const usedBy: [string, string, string][] = [];
  for (const [a, bs] of Object.entries(imports))
    for (const b of bs) {
      if (mine.has(a) && !mine.has(b)) uses.push([b, a, b]);
      if (mine.has(b) && !mine.has(a)) usedBy.push([a, a, b]);
    }
  return { uses: collect(uses), usedBy: collect(usedBy) };
}
