// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/check-map.mts <fixture module> <repo dir> [--roots a,b,c]
//   e.g. scripts/check-map.mts @/lib/explorify ~/Desktop/Code/explorify --roots signup,launch
// Verifies, for every authored node at any depth:
//   - `source` blocks (inside `under` too) are verbatim at their line
//   - `code` refs: at least one per authored node, file exists, lines in range
//   - `unsure` is given whenever state is not "derived"
//   - `table` rows match their columns; `sequence` endpoints are actors
//   - titles start with a capital and are at most 4 words; detail ≤ 3 paragraphs
//   - ids unique; E0 endpoints are roots; LINKS owners exist
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = args.indexOf("--roots");
const only = flag === -1 ? null : new Set(args[flag + 1].split(","));
const [mod, repo] = args.filter((_, i) => flag === -1 || (i !== flag && i !== flag + 1));
const base = mod.replace("@/", process.cwd() + "/");
const f = await import(existsSync(`${base}/index.ts`) ? `${base}/index.ts` : `${base}.ts`);
const all = f.AUTHORED as any[];
const roots = only ? all.filter((r) => only.has(r.id)) : all;

let ok = 0, bad = 0, refs = 0;
const ids = new Map<string, number>();
const problems: string[] = [];
const fileLines = new Map<string, string[] | null>();
const linesOf = (file: string) => {
  if (!fileLines.has(file)) {
    try { fileLines.set(file, readFileSync(join(repo, file), "utf8").split("\n")); }
    catch { fileLines.set(file, null); }
  }
  return fileLines.get(file)!;
};

const walkBlocks = (owner: string, blocks: any[] = [], d: number): number => {
  let deepest = d;
  for (const b of blocks) {
    if (b.kind === "source") {
      const lines = linesOf(b.file);
      if (!lines) { bad++; problems.push(`MISSING ${owner} ${b.file}`); continue; }
      const want = b.code.replace(/\s+$/, "").split("\n");
      const got = lines.slice(b.start - 1, b.start - 1 + want.length);
      if (want.every((l: string, i: number) => l.trimEnd() === (got[i] ?? "").trimEnd())) ok++;
      else { bad++; problems.push(`MISMATCH ${owner} ${b.file}:${b.start}`); }
      deepest = Math.max(deepest, d + 1);
    }
    if (b.kind === "table")
      b.rows.forEach((r: string[], i: number) => {
        if (r.length !== b.columns.length) problems.push(`TABLE ${owner} row ${i} has ${r.length} cells, ${b.columns.length} columns`);
      });
    if (b.kind === "diagram") {
      const cells = new Set<string>();
      for (const x of b.boxes) {
        const c = `${x.col},${x.row}`;
        if (cells.has(c)) problems.push(`DIAGRAM ${owner} two boxes at col ${x.col} row ${x.row}`);
        cells.add(c);
      }
      for (const a of b.arrows) for (const e of [a.from, a.to])
        if (!b.boxes.some((x: any) => x.id === e)) problems.push(`DIAGRAM ${owner} arrow end "${e}" is not a box`);
    }
    if (b.kind === "sequence")
      for (const m of b.rows) for (const a of [m.from, m.to])
        if (!b.actors.includes(a)) problems.push(`SEQUENCE ${owner} "${a}" is not an actor`);
    for (const r of b.rows ?? []) if (r.under) deepest = Math.max(deepest, walkBlocks(owner, r.under, d + 1));
  }
  return deepest;
};

const walk = (n: any, d: number): number => {
  ids.set(n.id, (ids.get(n.id) ?? 0) + 1);
  if (!/^[A-Z0-9"]/.test(n.title)) problems.push(`TITLE ${n.id} "${n.title}" — start with a capital`);
  if (n.title.split(/\s+/).length > 4) problems.push(`TITLE ${n.id} "${n.title}" — more than 4 words`);
  if ((n.detail ?? "").split(/\n\s*\n/).length > 3) problems.push(`DETAIL ${n.id} — more than 3 paragraphs`);
  if (n.state !== "derived" && !n.unsure) problems.push(`UNSURE ${n.id} is ${n.state} but gives no reason`);
  if (!n.code?.length) problems.push(`CODE ${n.id} has no code refs`);
  for (const c of n.code ?? []) {
    refs++;
    const lines = linesOf(c.file);
    if (!lines) problems.push(`CODE ${n.id} ${c.file} does not exist`);
    else if (!(c.start >= 1 && c.start <= c.end && c.end <= lines.length))
      problems.push(`CODE ${n.id} ${c.file}:${c.start}-${c.end} out of range (file has ${lines.length})`);
  }
  let deepest = walkBlocks(n.id, n.anatomy, d);
  for (const c of n.children ?? []) deepest = Math.max(deepest, walk(c, d + 1));
  return deepest;
};

for (const r of roots) {
  const before = ids.size;
  const depth = walk(r, 1);
  console.log(`root ${r.id.padEnd(14)} depth ${depth}  nodes ${ids.size - before}`);
}
for (const [id, c] of ids) if (c > 1) problems.push(`DUP id ${id}`);
if (!only) {
  for (const e of f.E0 ?? []) for (const k of [e.from, e.to]) if (!all.some((r) => r.id === k)) problems.push(`E0 endpoint ${k} not a root`);
  for (const l of f.LINKS ?? []) for (const k of [l.from, l.to]) { const owner = k.slice(0, k.indexOf(":")); if (!ids.has(owner)) problems.push(`LINK owner ${owner} unknown`); }
}
console.log(`sources verbatim ${ok}/${ok + bad}; code refs ${refs}; nodes ${ids.size}; problems ${problems.length}`);
problems.slice(0, 60).forEach((p) => console.log(p));
process.exit(problems.length ? 1 : 0);
