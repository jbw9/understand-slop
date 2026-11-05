/**
 * What a submit leaves for the graph to fill, filled before it is checked.
 *
 * An author spends output on structure the graph already knows, and most
 * rejected submits were that structure gone wrong: an arrow citing a line
 * with no call on it, two boxes in one cell. So a submit may name code by its
 * graph id and leave the rest to this:
 * - `code: [{ def, label }]` becomes the definition's file and lines;
 * - a box `ref`, or a flow or sequence step's `at`, given as a graph id
 *   becomes its file:line (a step's lines are clamped by autofix);
 * - a diagram whose boxes lack `col`/`row` is laid out along its arrows;
 * - an arrow with no `at`, or one whose `at` has no call into its target, gets
 *   the line of a call the graph has between the two boxes' code.
 * What cannot be filled is left as it was, for the checker to name. Notes say
 * what was filled, so the author's next `replace` starts from the tree as it
 * now stands; problems name a graph id that matches nothing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import { boxRanges, callLine } from "./check";
import type { Graph } from "./graph";
import { resolveDef } from "./graph-tools";

const FILE_LINE = /^(.+?):(\d+)(?:-(\d+))?$/;

/** How many columns a laid-out diagram may span before it wraps to the next rows. */
const MAX_COLS = 4;

/** Columns along the arrows (a box sits one column right of what points at it), rows in the order given. */
function layout(b: any): number {
  const boxes: any[] = b.boxes;
  if (boxes.every((x) => Number.isInteger(x?.col) && Number.isInteger(x?.row))) return 0;
  const ids = new Set(boxes.map((x) => x.id));
  const into = new Map<string, string[]>();
  for (const a of b.arrows ?? []) if (ids.has(a.from) && ids.has(a.to) && a.from !== a.to) into.set(a.to, [...(into.get(a.to) ?? []), a.from]);
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...(into.get(id) ?? []).map((f) => visit(f, seen))) + 1;
    seen.delete(id);
    depth.set(id, d);
    return d;
  };
  const taken = new Set<string>();
  const placed = boxes.filter((x) => Number.isInteger(x?.col) && Number.isInteger(x?.row));
  for (const x of placed) taken.add(`${x.col},${x.row}`);
  let n = 0;
  for (const x of boxes) {
    if (placed.includes(x)) continue;
    const d = visit(x.id, new Set());
    const col = d % MAX_COLS;
    let row = Math.floor(d / MAX_COLS) * 3;
    while (taken.has(`${col},${row}`)) row++;
    x.col = col;
    x.row = row;
    taken.add(`${col},${row}`);
    n++;
  }
  return n;
}

export function fillFromGraph(root: any, g: Graph | null): { notes: string[]; problems: string[] } {
  const notes: string[] = [];
  const problems: string[] = [];
  if (!root || typeof root !== "object") return { notes, problems };
  const unknown = (owner: string, what: string, raw: string) =>
    problems.push(`GRAPH ${owner} ${what} names "${raw}", which is not one definition in the graph — use an id graph_find or graph_file gives, or give file and lines`);

  // 1. Graph ids to lines, everywhere they may stand in for them.
  const nodes = new Map<string, any>();
  const blocksOf = (n: any) => [...(Array.isArray(n.anatomy) ? n.anatomy : []), ...(Array.isArray(n.explain?.blocks) ? n.explain.blocks : [])];
  const eachBlock = (list: any[], f: (b: any) => void) => {
    for (const b of list) {
      if (!b || typeof b !== "object") continue;
      f(b);
      for (const r of Array.isArray(b.rows) ? b.rows : []) if (Array.isArray(r?.under)) eachBlock(r.under, f);
    }
  };
  const expand = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.id === "string") nodes.set(n.id, n);
    if (g && Array.isArray(n.code))
      n.code.forEach((c: any, i: number) => {
        if (!c || typeof c !== "object" || typeof c.def !== "string" || (typeof c.file === "string" && Number.isInteger(c.start))) return;
        const d = resolveDef(g, c.def);
        if (!d) return unknown(n.id, `code[${i}].def`, c.def);
        n.code[i] = { file: d.file, start: d.start, end: d.end, label: c.label ?? d.name };
      });
    if (g)
      eachBlock(blocksOf(n), (b) => {
        if (b.kind === "diagram")
          for (const x of Array.isArray(b.boxes) ? b.boxes : []) {
            if (typeof x?.ref !== "string" || FILE_LINE.test(x.ref) || g.files.includes(x.ref)) continue;
            const d = resolveDef(g, x.ref);
            if (d) x.ref = `${d.file}:${d.start}`;
            else unknown(n.id, `box "${x.id}" ref`, x.ref);
          }
        if (b.kind === "flow" || b.kind === "sequence")
          for (const [i, r] of (Array.isArray(b.rows) ? b.rows : []).entries()) {
            if (typeof r?.at !== "string" || FILE_LINE.test(r.at)) continue;
            const d = resolveDef(g, r.at);
            if (d) r.at = `${d.file}:${d.start}-${d.end}`;
            else unknown(n.id, `${b.kind} row ${i + 1} at`, r.at);
          }
      });
    (Array.isArray(n.children) ? n.children : []).forEach(expand);
  };
  expand(root);

  // 2. Boxes laid out, and arrows given the line of their call.
  const draw = (n: any) => {
    if (!n || typeof n !== "object") return;
    eachBlock(blocksOf(n), (b) => {
      if (b.kind !== "diagram" || !Array.isArray(b.boxes)) return;
      const moved = layout(b);
      if (moved) notes.push(`${n.id}: ${moved} box${moved === 1 ? "" : "es"} placed on the grid along the arrows`);
    });
    if (g)
      for (const b of Array.isArray(n.anatomy) ? n.anatomy : []) {
        if (b?.kind !== "diagram" || !Array.isArray(b.boxes)) continue;
        for (const a of Array.isArray(b.arrows) ? b.arrows : []) {
          if (!a || a.inferred) continue;
          const from = boxRanges(g, b.boxes.find((x: any) => x.id === a.from), nodes);
          const to = boxRanges(g, b.boxes.find((x: any) => x.id === a.to), nodes);
          if (!from.length || !to.length) continue;
          const m = typeof a.at === "string" ? FILE_LINE.exec(a.at) : null;
          // An `at` already on a call into the target stands, with the same slack of a line either side as the checker allows.
          if (m && callLine(g, [{ file: m[1], start: +m[2] - 1, end: +(m[3] ?? m[2]) + 1 }], to)) continue;
          const at = callLine(g, from, to);
          if (!at) continue;
          notes.push(`${n.id}: arrow ${a.from}→${a.to} ${a.at ? `re-cited from ${a.at} to` : "cites"} ${at}, the call the graph has between them`);
          a.at = at;
        }
      }
    (Array.isArray(n.children) ? n.children : []).forEach(draw);
  };
  draw(root);
  return { notes, problems };
}

