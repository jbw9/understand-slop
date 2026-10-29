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
/** A block's caption is a heading over the picture, not a sentence about it.
 *  What follows " — " is a gloss the page sets apart (canvas.tsx shapeLabel). */
export const CAPTION_WORDS = 5;
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
  const tree = buildMap({ RUN: {} as any, AUTHORED: map.AUTHORED, LINKS: [] }, "");
  const L0 = tree.L0;
  index(L0);
  // The overview's boxes open the roots, as a node's open its children.
  built.set(OVERVIEW_ID, new Set(L0.map((n) => n.id)));

  // `explain`: an Explainer's pictures (lib/data.ts), which draw an idea
  // rather than the code — so their boxes open nothing and their arrows cite
  // no line, and every other rule still holds.
  const walkBlocks = (owner: string, blocks: any[] = [], d: number, explain = false): number => {
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
      if (gen && typeof b.caption === "string") {
        const head = b.caption.split(" — ")[0];
        if (words(head) > CAPTION_WORDS)
          problems.push(`CAPTION ${owner} ${b.kind} "${b.caption}" — ${words(head)} words (max ${CAPTION_WORDS}); a short heading, not a sentence`);
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
          if (explain && x.opens) problems.push(`EXPLAIN ${owner} box "${x.id}" opens "${x.opens}" — an explainer's picture opens nothing; the level's own diagram is the way down`);
          else if (x.opens && !built.get(owner)?.has(x.opens)) problems.push(`DIAGRAM ${owner} box "${x.id}" opens "${x.opens}", which is not a child of ${owner}`);
        }
        for (const a of b.arrows) {
          for (const e of [a.from, a.to])
            if (!b.boxes.some((x: any) => x.id === e)) problems.push(`DIAGRAM ${owner} arrow end "${e}" is not a box`);
          if (gen && (a.label ?? "").length > 24) problems.push(`ARROW ${owner} ${a.from}→${a.to} label "${a.label}" is over 24 characters — a few words on the line`);
          if (gen && !explain) {
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
      // A step's lines are what the reader is shown when they click it.
      if (b.kind === "flow" || b.kind === "sequence")
        for (const [i, r] of (b.rows ?? []).entries()) {
          if (r.at === undefined) continue;
          const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(r.at);
          const what = `${b.kind} ${b.kind === "flow" ? "step" : "message"} ${i + 1}`;
          if (!m) problems.push(`STEP ${owner} ${what} at "${r.at}" — give it as file:start-end`);
          else if (!inRange(m[1], +m[2], +(m[3] ?? m[2]))) problems.push(`STEP ${owner} ${what} cites ${r.at}, which does not exist`);
          else if (gen && +(m[3] ?? m[2]) - +m[2] + 1 > STEP_LINES) problems.push(`STEP ${owner} ${what} cites ${+(m[3] ?? m[2]) - +m[2] + 1} lines (max ${STEP_LINES}) — the lines where this one step happens, not the whole function`);
        }
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
      if (gen && n.id !== OVERVIEW_ID) problems.push(...levelProblems(n));
      if (gen) problems.push(...explainProblems(n));
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
    walkBlocks(n.id, n.explain?.blocks, d, true);
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
    if (gen && map.OVERVIEW) problems.push(...startProblems(map.OVERVIEW, (p) => p.length > 0 && tree.nodeAt(p) !== null));
    for (const l of map.LINKS ?? []) for (const k of [l.from, l.to]) {
      const owner = k.slice(0, k.indexOf(":"));
      if (!ids.has(owner)) problems.push(`LINK owner ${owner} unknown`);
    }
  }
  return { problems, roots, refs, sources };
}

/**
 * What a leaf may cite. The code drawer shows a leaf's refs and nothing above
 * it, so a leaf citing every file its page mentions hands the reader the whole
 * page's code where they asked for one part's.
 */
export const LEAF = { refs: 3, files: 2, lines: 200, blocks: 2 };
/** A level with parts: its picture, and at most this many blocks beside it. */
export const PARENT_BLOCKS = 3;

/**
 * The two kinds of level a generated map has. A level with parts is a picture
 * whose boxes open every part, so each part leads somewhere; a leaf is one
 * piece of code — one function, handler, screen or config — framed by one or
 * two blocks, so digging into any part ends at that part's own lines.
 */
function levelProblems(n: any): string[] {
  const out: string[] = [];
  const blocks: any[] = n.anatomy ?? [];
  const diagrams = blocks.filter((b) => b.kind === "diagram");
  // Parts the reader added (lib/overlay.ts) have no box to be opened from.
  const kids: any[] = (n.children ?? []).filter((k: any) => !k.origin);
  if (kids.length) {
    const opened = new Set(diagrams.flatMap((b) => b.boxes.map((x: any) => x.opens)));
    const closed = kids.filter((k) => !opened.has(k.id)).map((k) => k.id);
    if (!diagrams.length) out.push(`PARTS ${n.id} has children but no diagram — draw one whose boxes open every child`);
    else if (closed.length) out.push(`PARTS ${n.id} — no box on its diagram opens ${closed.join(", ")}; give every child a box with \`opens\``);
    if (blocks.length > PARENT_BLOCKS) out.push(`BLOCKS ${n.id} has ${blocks.length} blocks (max ${PARENT_BLOCKS}: the diagram and two more) — what explains one part belongs on that part`);
    return out;
  }
  const code: any[] = n.code ?? [];
  const files = new Set(code.map((c) => c.file)).size;
  const lines = code.reduce((a, c) => a + c.end - c.start + 1, 0);
  if (code.length > LEAF.refs || files > LEAF.files || lines > LEAF.lines)
    out.push(`LEAF ${n.id} cites ${code.length} ranges in ${files} files, ${lines} lines (max ${LEAF.refs} ranges, ${LEAF.files} files, ${LEAF.lines} lines) — a leaf is one piece of code; make each part its own child citing its own lines, and this node a level whose diagram opens them`);
  if (diagrams.length) out.push(`LEAF ${n.id} has a diagram — a diagram names parts and a leaf has none; show its steps as a flow or sequence, or make the boxes children`);
  if (!blocks.length) out.push(`BLOCKS ${n.id} is a leaf with no block — give it the one that explains its lines: a screen, flow, sequence, schema or table`);
  else if (blocks.length > LEAF.blocks) out.push(`BLOCKS ${n.id} is a leaf with ${blocks.length} blocks (max ${LEAF.blocks}) — on a leaf the code is the main thing`);
  return out;
}

/** A clicked step shows its own lines; past this it is the function, not the step. */
export const STEP_LINES = 40;
/** An explainer's body: enough to define the words a level leans on, short enough to read. */
export const EXPLAIN = { min: 25, max: 200, blocks: 2 };

/**
 * The plain-words layer (`Node.explain`): every generated level has one, a
 * leaf's steps each cite the lines they describe, and the body stays a few
 * short paragraphs rather than an essay.
 */
function explainProblems(n: any): string[] {
  const out: string[] = [];
  const e = n.explain;
  if (!e || typeof e.body !== "string" || !e.body.trim())
    out.push(`EXPLAIN ${n.id} has no explain — give \`explain.body\`: this level in plain words for someone new to the project and its field, defining each word it leans on`);
  else {
    const w = words(e.body);
    if (w < EXPLAIN.min) out.push(`EXPLAIN ${n.id} — ${w} words (min ${EXPLAIN.min}); say what problem this solves and how, defining its terms`);
    if (w > EXPLAIN.max) out.push(`EXPLAIN ${n.id} — ${w} words (max ${EXPLAIN.max}); a few short paragraphs, and a picture where it says more`);
  }
  if ((e?.blocks ?? []).length > EXPLAIN.blocks) out.push(`EXPLAIN ${n.id} has ${e.blocks.length} pictures (max ${EXPLAIN.blocks})`);
  if (!n.children?.length) {
    const own = new Set((n.anatomy ?? []).map((b: any) => b.kind));
    for (const b of e?.blocks ?? [])
      if (own.has(b.kind)) out.push(`EXPLAIN ${n.id} draws a ${b.kind} the leaf already shows — an explain picture must show what the leaf's own blocks cannot, or be left out`);
  }
  if (!n.children?.length)
    for (const b of n.anatomy ?? [])
      if (b.kind === "flow" || b.kind === "sequence")
        (b.rows ?? []).forEach((r: any, i: number) => {
          if (!r.at) out.push(`STEP ${n.id} ${b.kind} ${b.kind === "flow" ? "step" : "message"} ${i + 1} "${r.title ?? r.label}" cites no lines — give \`at\` as file:start-end where it happens, so clicking it shows that code`);
        });
  return out;
}

/** The repository level's way in for a first-time reader: a glossary and one walkthrough whose steps open real parts. */
function startProblems(o: any, resolves: (path: string[]) => boolean): string[] {
  const out: string[] = [];
  const g: any[] = o.glossary ?? [];
  if (g.length < 4 || g.length > 12) out.push(`GLOSSARY ${OVERVIEW_ID} has ${g.length} terms (want 4-12) — the words a newcomer must know to read this map`);
  for (const t of g)
    if (typeof t?.term !== "string" || typeof t?.meaning !== "string" || !t.meaning.trim()) out.push(`GLOSSARY ${OVERVIEW_ID} term needs term and meaning`);
    else if (words(t.meaning) > 25) out.push(`GLOSSARY ${OVERVIEW_ID} "${t.term}" — ${words(t.meaning)} words (max 25)`);
  const w = o.walkthrough;
  if (!w || typeof w.title !== "string" || !Array.isArray(w.steps)) out.push(`WALK ${OVERVIEW_ID} has no walkthrough — one concrete thing followed through the roots, each step opening the part where it happens`);
  else {
    if (w.steps.length < 3 || w.steps.length > 8) out.push(`WALK ${OVERVIEW_ID} has ${w.steps.length} steps (want 3-8)`);
    w.steps.forEach((s: any, i: number) => {
      if (typeof s?.title !== "string" || typeof s?.detail !== "string") out.push(`WALK ${OVERVIEW_ID} step ${i + 1} needs title and detail`);
      if (!Array.isArray(s?.path) || !resolves(s.path)) out.push(`WALK ${OVERVIEW_ID} step ${i + 1} path ${JSON.stringify(s?.path)} is not a part of the map — ids from a root down`);
    });
  }
  return out;
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
