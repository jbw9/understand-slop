/**
 * Every mechanical rule a map must pass, as one function: hand-authored maps
 * through scripts/check-map.mts, generated ones inside the pipeline, where the
 * problems go back to the model that wrote the node.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- walks map JSON, typed or not */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMap, type MapFile } from "@/lib/map";
import { MARK_IDS } from "@/components/shapes";
import type { Anatomy } from "@/lib/data";
import { layoutDiagram, overlaps, segmentsOf } from "@/lib/diagram";

export interface CheckResult {
  problems: string[];
  roots: { id: string; depth: number; nodes: number }[];
  refs: number;
  sources: { ok: number; bad: number };
}

/** A detail's length as D38 counts it: two short sentences at most. */
export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** A card's `sub` is a glance, not a summary: its children already name its parts. */
export const SUB_WORDS = 8;
export const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z"`(])/).filter(Boolean).length;

/** How the overview is named in a problem: no node can have this id, so it never clashes with one. */
export const OVERVIEW_ID = "(overview)";

/** Lines of repo files, read once per run. */
export function fileReader(repo: string) {
  const cache = new Map<string, string[] | null>();
  return (file: string) => {
    if (!cache.has(file)) {
      try { cache.set(file, readFileSync(join(repo, file), "utf8").split("\n")); }
      catch { cache.set(file, null); }
    }
    return cache.get(file)!;
  };
}

/**
 * `generated` adds the rules a generated map lives under (D45): no hand-drawn
 * figures, no screenshots, no pasted source, only brand marks that have a
 * drawing, every diagram arrow citing the line it happens on, and at least
 * three levels under every root.
 */
export function check(
  map: Pick<MapFile, "AUTHORED" | "OVERVIEW" | "LINKS">,
  repo: string,
  opts: { generated?: boolean; only?: Set<string> } = {},
): CheckResult {
  const linesOf = fileReader(repo);
  const problems: string[] = [];
  const ids = new Map<string, number>();
  const sources = { ok: 0, bad: 0 };
  let refs = 0;
  const gen = Boolean(opts.generated);
  const inRange = (file: string, start: number, end: number) => {
    const lines = linesOf(file);
    return lines !== null && start >= 1 && start <= end && end <= lines.length;
  };
  // `opens` may name a row-built child, so it is checked against the tree the
  // screen actually reads, not the authored one.
  const built = new Map<string, Set<string>>();
  const index = (ns: any[]) => ns.forEach((n) => { built.set(n.id, new Set((n.children ?? []).map((c: any) => c.id))); index(n.children ?? []); });
  const L0 = buildMap({ RUN: {} as any, AUTHORED: map.AUTHORED, LINKS: [] }, "").L0;
  index(L0);
  // The overview's boxes open the roots, as a node's open its children.
  built.set(OVERVIEW_ID, new Set(L0.map((n) => n.id)));

  const walkBlocks = (owner: string, blocks: any[] = [], d: number): number => {
    let deepest = d;
    for (const b of blocks) {
      if (b.kind === "source") {
        if (gen) problems.push(`SOURCE ${owner} — generated maps read code through \`code\` refs, never pasted source`);
        const lines = linesOf(b.file);
        if (!lines) { sources.bad++; problems.push(`MISSING ${owner} ${b.file}`); continue; }
        const want = b.code.replace(/\s+$/, "").split("\n");
        const got = lines.slice(b.start - 1, b.start - 1 + want.length);
        if (want.every((l: string, i: number) => l.trimEnd() === (got[i] ?? "").trimEnd())) sources.ok++;
        else { sources.bad++; problems.push(`MISMATCH ${owner} ${b.file}:${b.start}`); }
        deepest = Math.max(deepest, d + 1);
      }
      if (b.kind === "table")
        b.rows.forEach((r: string[], i: number) => {
          if (r.length !== b.columns.length) problems.push(`TABLE ${owner} row ${i} has ${r.length} cells, ${b.columns.length} columns`);
        });
      if (b.kind === "screen" && b.shot) {
        if (gen) problems.push(`SHOT ${owner} — generated maps have no screenshots; describe the screen with items`);
        else if (!existsSync(join(process.cwd(), "public", b.shot))) problems.push(`SHOT ${owner} ${b.shot} does not exist under app/public`);
      }
      if (b.kind === "diagram") {
        const cells = new Set<string>();
        for (const x of b.boxes) {
          const c = `${x.col},${x.row}`;
          if (cells.has(c)) problems.push(`DIAGRAM ${owner} two boxes at col ${x.col} row ${x.row}`);
          cells.add(c);
          if (x.opens && !built.get(owner)?.has(x.opens)) problems.push(`DIAGRAM ${owner} box "${x.id}" opens "${x.opens}", which is not a child of ${owner}`);
        }
        for (const a of b.arrows) {
          for (const e of [a.from, a.to])
            if (!b.boxes.some((x: any) => x.id === e)) problems.push(`DIAGRAM ${owner} arrow end "${e}" is not a box`);
          if (gen && (a.label ?? "").length > 24) problems.push(`ARROW ${owner} ${a.from}→${a.to} label "${a.label}" is over 24 characters — a few words on the line`);
          if (gen) {
            const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(a.at ?? "");
            if (!m) problems.push(`ARROW ${owner} ${a.from}→${a.to} cites no line — give \`at\` as file:line where this path happens`);
            else if (!inRange(m[1], +m[2], +(m[3] ?? m[2]))) problems.push(`ARROW ${owner} ${a.from}→${a.to} cites ${a.at}, which does not exist`);
          }
        }
        if (gen && b.arrows.every((a: any) => b.boxes.some((x: any) => x.id === a.from) && b.boxes.some((x: any) => x.id === a.to)))
          problems.push(...layoutProblems(b).problems.map((p) => `LAYOUT ${owner} ${p}`));
      }
      if (b.kind === "sequence")
        for (const m of b.rows) for (const a of [m.from, m.to])
          if (!b.actors.includes(a)) problems.push(`SEQUENCE ${owner} "${a}" is not an actor`);
      if (gen && (b.rows ?? []).some((r: any) => r.under)) problems.push(`UNDER ${owner} — a deeper part is a child node, not a row with \`under\``);
      for (const r of b.rows ?? []) if (r.under) deepest = Math.max(deepest, walkBlocks(owner, r.under, d + 1));
    }
    return deepest;
  };

  const walk = (n: any, d: number): number => {
    ids.set(n.id, (ids.get(n.id) ?? 0) + 1);
    // What the reader added or rewrote (lib/overlay.ts) answers to them, not
    // to this. Every rule below is about generated prose: a label is short
    // because a model will ramble, a node cites code because a model must show
    // its work. A person writing their own sentence about their own repository
    // has already decided, and failing their words here would make a map they
    // had deliberately corrected report itself as broken. Their children are
    // still walked, and everything structural — ids, edges, diagram layout —
    // still applies to the blocks they added.
    const own = Boolean(n.origin);
    if (!own) {
      if (!/^[A-Z0-9"]/.test(n.title)) problems.push(`TITLE ${n.id} "${n.title}" — start with a capital`);
      if (n.title.split(/\s+/).length > 4) problems.push(`TITLE ${n.id} "${n.title}" — more than 4 words`);
      // D42: no file paths on a card.
      for (const [k, v] of [["title", n.title], ["sub", n.sub]])
        if (/[\w-]+\/[\w.-]+|\b[\w-]+\.(tsx?|jsx?|py|go|rb|rs|java|sql|json)\b/.test(v ?? "")) problems.push(`PATH ${n.id} ${k} "${v}" — no file paths on a card`);
      // D38: two short sentences at most; the rest is pictures.
      const w = words(n.detail ?? "");
      const ss = sentences(n.detail ?? "");
      if (gen && words(n.sub ?? "") > SUB_WORDS) problems.push(`SUB ${n.id} "${n.sub}" — ${words(n.sub)} words (max ${SUB_WORDS}); say what it is, not what it contains`);
      if (w > 40) problems.push(`DETAIL ${n.id} — ${w} words (max 40)`);
      if (ss > 2) problems.push(`DETAIL ${n.id} — ${ss} sentences (max 2)`);
      if (n.state !== "derived" && !n.unsure) problems.push(`UNSURE ${n.id} is ${n.state} but gives no reason`);
      if (gen && n.shape?.kind === "figure") problems.push(`SHAPE ${n.id} — figures are hand-drawn; use marks, count, or none`);
      if (n.shape?.kind === "marks")
        for (const m of n.shape.ids) if (!MARK_IDS.includes(m)) problems.push(`SHAPE ${n.id} mark "${m}" has no drawing (have: ${MARK_IDS.join(", ")})`);
      if (!n.code?.length) problems.push(`CODE ${n.id} has no code refs`);
    }
    for (const [kind, list] of [["CODE", n.code], ["DOCS", n.docs]] as const)
      for (const c of list ?? []) {
        refs++;
        const lines = linesOf(c.file);
        if (!lines) problems.push(`${kind} ${n.id} ${c.file} does not exist`);
        else if (!inRange(c.file, c.start, c.end))
          problems.push(`${kind} ${n.id} ${c.file}:${c.start}-${c.end} out of range (file has ${lines.length})`);
      }
    for (const e of n.edges ?? []) for (const k of [e.from, e.to])
      if (!built.get(n.id)?.has(k)) problems.push(`EDGE ${n.id} ${e.from}→${e.to}: "${k}" is not a child`);
    let deepest = walkBlocks(n.id, n.anatomy, d);
    for (const c of n.children ?? []) deepest = Math.max(deepest, walk(c, d + 1));
    return deepest;
  };

  const roots = (opts.only ? map.AUTHORED.filter((r) => opts.only!.has(r.id)) : map.AUTHORED).map((r) => {
    const before = ids.size;
    const depth = walk(r, 1);
    if (gen && depth < 2) problems.push(`DEPTH ${r.id} reaches ${depth} level (min 2)`);
    return { id: r.id, depth, nodes: ids.size - before };
  });
  for (const [id, c] of ids) if (c > 1) problems.push(`DUP id ${id}`);
  if (!opts.only) {
    // The repository's own level (D60) is held to what any level is.
    if (map.OVERVIEW) walk({ ...map.OVERVIEW, id: OVERVIEW_ID, title: "Overview", sub: map.OVERVIEW.sub ?? "", children: [] }, 0);
    for (const l of map.LINKS ?? []) for (const k of [l.from, l.to]) {
      const owner = k.slice(0, k.indexOf(":"));
      if (!ids.has(owner)) problems.push(`LINK owner ${owner} unknown`);
    }
  }
  return { problems, roots, refs, sources };
}

/** Widest a diagram may lay out — the explorify benchmark's widest is 1523. Past it the page holds the picture at its 70% floor and it scrolls far. */
export const MAX_DIAGRAM_W = 1550;

/**
 * What the page would draw badly: text on text, text on a box, a line through
 * a box it does not connect, a picture too wide to read. A label across
 * another line is only counted — it is drawn with a halo and stays legible.
 */
export function layoutProblems(block: Extract<Anatomy, { kind: "diagram" }>) {
  const L = layoutDiagram(block);
  const problems: string[] = [];
  if (L.W > MAX_DIAGRAM_W)
    problems.push(`is ${Math.round(L.W)}px wide (max ${MAX_DIAGRAM_W}) — shorten box subs, or use fewer columns and more rows`);
  const runs = L.arrows.map((a) => segmentsOf(a.d.slice(1).split("L").map((p) => p.split(" ").map(Number) as [number, number])));
  const labelled = L.arrows.filter((a) => a.label);
  let crossings = 0;
  labelled.forEach((a, i) => {
    const r = L.labels[i];
    L.boxes.forEach((p, j) => { if (overlaps(r, L.boxRects[j])) problems.push(`label "${a.label!.text}" sits on box "${p.b.label}"`); });
    labelled.slice(i + 1).forEach((o, k) => { if (overlaps(r, L.labels[i + 1 + k])) problems.push(`label "${a.label!.text}" sits on label "${o.label!.text}"`); });
    L.arrows.forEach((o, k) => { if (o !== a && runs[k].some((s) => overlaps(r, s))) crossings++; });
  });
  L.arrows.forEach((a, k) => {
    for (const s of runs[k])
      L.boxes.forEach((p, j) => {
        if (p.b.id === a.from || p.b.id === a.to) return;
        const b = L.boxRects[j];
        if (overlaps(s, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 })) problems.push(`line ${a.from}→${a.to} runs through box "${p.b.label}"`);
      });
  });
  return { problems: [...new Set(problems)], crossings };
}
