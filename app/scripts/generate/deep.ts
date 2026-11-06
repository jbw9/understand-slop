/**
 * A section written in full where code builds the structure and a model only
 * writes the words: the deepen stage of a --fast map, in place of an agent
 * per section that read the code with tools and was sent back by the checker
 * until its tree came back clean.
 *
 * 1. Group, one call: the model sorts the section's files into groups named
 *    for what a person does there. Code holds it to every file in exactly one
 *    group, none bigger than one diagram, and fixes what is still wrong after
 *    one retry. A section of a few files has no groups.
 * 2. Skeleton, no model: a level per group, a leaf per file, or for a file
 *    past a leaf's limits a level whose leaves are its functions packed within
 *    them. Every symbol a section must explain sits in a leaf's code, so the
 *    coverage, leaf and arrow rules hold by construction; arrows are drawn
 *    from the call graph (fast.ts, diagramOf), never asked for.
 * 3. Words, side by side: one call for the section's levels (their titles,
 *    details, explainers and arrow labels) and one per batch of leaves, each
 *    given its leaves' source. A leaf's steps are the model's, but their lines
 *    are held inside the leaf's code. Words over their limits get one retry,
 *    then what is over is cut.
 *
 * The overview (deepOverview) is the same split: code traces call paths from
 * the entry points through the sections, the model picks the walkthroughs
 * among them and writes them.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model answers and map JSON */
import { basename } from "node:path";
import type { Node } from "@/lib/data";
import type { Overview } from "@/lib/map";
import { citations, nodesAt } from "@/lib/coverage";
import type { Authored } from "./author";
import { ask, type Tool } from "./bedrock";
import { autofix, bareLines, BOUNDS, check, fileReader, layoutProblems, EXPLAIN_LEVEL, LEAF, looksLikePath, sentences, STEP_LINES, SUB_WORDS, WALK_STEPS, WALKS, words } from "./check";
import type { Root } from "./cut";
import { askWithin, diagramOf, entrypoints, leafCode, MAX_FILES, short, slug, splitFlat, within40, wordProblems } from "./fast";
import type { Graph } from "./graph";
import { numbered, type Inventory } from "./inventory";
import { oneLine, type FileSummary } from "./summarize";

/** A section with fewer files than this shows them as its own parts, with no groups between. */
const GROUP_MIN = Number(process.env.SLOP_DEEP_GROUP_MIN ?? 7);
/** Source lines one words call reads at most: past this its leaves are written in more calls, side by side. */
const BATCH_LINES = Number(process.env.SLOP_DEEP_BATCH_LINES ?? 2500);
/** Leaves one words call writes at most. */
const BATCH_LEAVES = 12;
/** Levels of split files one words call writes at most: past about this many, a model leaves some out. */
const LEVEL_BATCH = 10;

type Range = { file: string; start: number; end: number };
type Models = { group: string; words: string };

const ex = EXPLAIN_LEVEL === "none" ? null : BOUNDS[EXPLAIN_LEVEL];
/** A leaf's explainer is shorter than a level's: its code and steps are on the page beside it. */
const LEAF_EXPLAIN_MAX = ex ? Math.min(ex.max, Math.max(ex.min + 10, Math.round(ex.max * 0.4))) : 0;
const explainField = (max: number) =>
  ex ? { explain: { type: "string", description: `${ex.min}-${max} words: this part in plain words for someone new to the project and its field — what problem it solves and how, each word it leans on defined the first time. Not a restatement of detail.` } } : {};
const EXPLAIN_FIELD = explainField(ex?.max ?? 0);
const NAMED = {
  title: { type: "string", description: "1-3 words, Title Case: what a reader does or gets here. No file names, never a filler word (Core, Main, Misc, Utilities)." },
  sub: { type: "string", description: `At most ${SUB_WORDS} words (count them): what it does. No file names.` },
  detail: { type: "string", description: "At most two sentences and 40 words: what it does and how, naming the functions that do it in `backticks`." },
};

/** What a model's words break of the map's limits: the check's rules on titles, subs, details and explainers. */
function nodeWordProblems(id: string, x: any, withExplain: boolean, explainMax = ex?.max ?? 0): string[] {
  const out = wordProblems([
    [`${id}'s title`, x?.title, 4],
    [`${id}'s sub`, x?.sub, SUB_WORDS],
    [`${id}'s detail`, x?.detail, 40],
  ]);
  if (typeof x?.detail === "string" && sentences(x.detail) > 2) out.push(`${id}'s detail has ${sentences(x.detail)} sentences; at most 2`);
  if (withExplain && ex) {
    const w = words(typeof x?.explain === "string" ? x.explain : "");
    if (w < ex.min || w > explainMax) out.push(`${id}'s explain is ${w} words; it must be ${ex.min}-${explainMax}`);
  }
  return out;
}

/** Words cut to fit what the model still had over its limits after the retry: whole words from the front. */
const cutWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
/** A detail within the map's 40 words: its sentences while they fit, else its first 39 words. */
const fit40 = (d: string) => (words(within40(d)) <= 40 ? within40(d) : `${cutWords(d, 39).replace(/[,;:.]$/, "")}…`);
function fitted(x: any, fallback: { title: string; sub: string; detail: string }, explainMax = ex?.max ?? 0) {
  const ok = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && !looksLikePath(s);
  const title = ok(x?.title) ? cutWords(x.title, 4) : fallback.title;
  const sub = ok(x?.sub) ? cutWords(x.sub, SUB_WORDS) : fallback.sub;
  const detail = typeof x?.detail === "string" && x.detail.trim() ? fit40(x.detail) : fit40(fallback.detail);
  const explain = ex && typeof x?.explain === "string" && x.explain.trim() ? cutWords(x.explain, explainMax) : undefined;
  return { title: title[0] ? title[0].toUpperCase() + title.slice(1) : title, sub, detail, explain };
}

/**
 * One call for some entries by id, then one more for only those it left
 * wanting: missing, or with what code cannot fix (no steps it can place, an
 * explainer too short to say anything). What is merely over a limit is cut by
 * code, not sent back: a retry rewrites every entry it is shown.
 */
async function askEntries(o: {
  model: string;
  stage: string;
  tool: Tool;
  key: "leaves" | "levels";
  ids: string[];
  prompt: (only: string[] | null) => string;
  wanting: (id: string, entry: any) => string[];
}): Promise<{ entries: Map<string, any>; answer: any; calls: number }> {
  const system = "You write the words of one part of a map of a codebase. Its structure is already built from the code: write only what is asked, for the ids given, from what you are shown.";
  const entries = new Map<string, any>();
  const take = (a: any) => {
    for (const y of Array.isArray(a?.[o.key]) ? a[o.key] : [])
      if (o.ids.includes(y?.id) && (!entries.has(y.id) || o.wanting(y.id, y).length < o.wanting(y.id, entries.get(y.id)).length)) entries.set(y.id, y);
  };
  const answer = await ask<any>({ model: o.model, stage: o.stage, maxTokens: 16000, system, messages: [{ role: "user", content: o.prompt(null) }], tool: o.tool });
  take(answer);
  const bad = o.ids.map((id) => [id, entries.has(id) ? o.wanting(id, entries.get(id)) : ["no entry for it"]] as const).filter(([, ps]) => ps.length);
  if (!bad.length) return { entries, answer, calls: 1 };
  const note = `\n\nWrite only these, again in full: ${bad.map(([id, ps]) => `${id} (${ps.join("; ")})`).join(", ")}.`;
  try {
    take(await ask<any>({ model: o.model, stage: o.stage, maxTokens: 16000, system, messages: [{ role: "user", content: o.prompt(bad.map(([id]) => id)) + note }], tool: o.tool }));
  } catch {
    // The first answer stands; what it left out keeps the quick words.
  }
  return { entries, answer, calls: 2 };
}

/** An explainer too short to say anything: the one limit on words a retry is spent on. */
const thinExplain = (x: any) => (ex && words(typeof x?.explain === "string" ? x.explain : "") < ex.min ? [`its explain is under ${ex.min} words`] : []);

/* ── 1. groups ───────────────────────────────────────────────── */

const GROUPS_TOOL: Tool = {
  name: "groups",
  description: "Record how this section's files are grouped.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["groups"],
    properties: {
      groups: {
        type: "array",
        description: `2-6 groups, in the order a reader should meet them: what a person meets first, shared code last. Each holds at most ${MAX_FILES} files, and every file listed is in exactly one.`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "sub", "detail", "files"],
          properties: { ...NAMED, files: { type: "array", items: { type: "string" }, description: "Paths exactly as listed." } },
        },
      },
    },
  },
};

interface Group { title: string; sub: string; detail: string; files: string[] }

/** Links between some files by import, as `a → b` lines: what a group should keep together. */
function importLines(files: string[], inv: Inventory): string[] {
  const set = new Set(files);
  return files.flatMap((a) => (inv.imports[a] ?? []).filter((b) => set.has(b) && b !== a).map((b) => `${a} → ${b}`));
}

const fileLine = (p: string, sums: Record<string, FileSummary>) =>
  sums[p] ? `- ${oneLine(sums[p])}${sums[p].user_sees ? `\n    shows: ${sums[p].user_sees}` : ""}\n${sums[p].symbols.slice(0, 8).map((s) => `    ${s.name} (${s.start}-${s.end}): ${s.does}`).join("\n")}` : `- ${p}`;

async function groupFiles(quick: Node, files: string[], inv: Inventory, sums: Record<string, FileSummary>, model: string): Promise<Group[]> {
  const links = importLines(files, inv);
  const prompt = [
    `# Repository: ${inv.name}`,
    `## Section: ${quick.title} — ${quick.sub}\n${quick.detail ?? ""}`,
    `## Its files\n${files.map((p) => fileLine(p, sums)).join("\n")}`,
    links.length ? `## Imports between them\n${links.join("\n")}` : "",
    `## Task\nSort these files into groups, each named for what a person does there ("Reading A Post", "Signing Up") or, for code the rest shares, a plain noun ("Shared Layouts"). Group by what works together for one purpose, not by folder.`,
  ].filter(Boolean).join("\n\n");
  const problemsOf = (a: any): string[] => {
    const gs: any[] = Array.isArray(a?.groups) ? a.groups : [];
    const out: string[] = [];
    if (gs.length < 2 || gs.length > 6) out.push(`there are ${gs.length} groups; give 2-6`);
    const seen = new Map<string, number>();
    gs.forEach((g, i) => {
      out.push(...nodeWordProblems(`group ${i + 1}`, g, false));
      const fs: string[] = Array.isArray(g?.files) ? g.files : [];
      if (fs.length > MAX_FILES) out.push(`group "${g?.title}" has ${fs.length} files; at most ${MAX_FILES}`);
      for (const f of fs) {
        if (!files.includes(f)) out.push(`group "${g?.title}" lists ${f}, which is not one of the files`);
        seen.set(f, (seen.get(f) ?? 0) + 1);
      }
    });
    const missing = files.filter((f) => !seen.has(f));
    if (missing.length) out.push(`these files are in no group: ${missing.join(", ")}`);
    const twice = [...seen].filter(([f, n]) => n > 1 && files.includes(f)).map(([f]) => f);
    if (twice.length) out.push(`these files are in more than one group: ${twice.join(", ")}`);
    return out;
  };
  const a = await askWithin({ model, stage: "deep-group", maxTokens: 6000, prompt, tool: GROUPS_TOOL }, problemsOf);
  return fixGroups(Array.isArray(a?.groups) ? a.groups : [], files, inv);
}

/** What the model's groups still get wrong, fixed: unknown paths dropped, each file once, the missing placed by import, the oversized split along imports. */
function fixGroups(raw: any[], files: string[], inv: Inventory): Group[] {
  const placed = new Set<string>();
  let gs: Group[] = raw.map((g) => {
    const fs = (Array.isArray(g?.files) ? g.files : []).filter((f: string) => files.includes(f) && !placed.has(f));
    fs.forEach((f: string) => placed.add(f));
    return { ...fitted(g, { title: "Files", sub: "", detail: "" }), files: fs };
  });
  gs = gs.filter((g) => g.files.length);
  for (const f of files.filter((x) => !placed.has(x))) {
    const link = (g: Group) => g.files.filter((x) => (inv.imports[x] ?? []).includes(f) || (inv.imports[f] ?? []).includes(x)).length;
    const room = gs.filter((g) => g.files.length < MAX_FILES);
    const into = [...(room.length ? room : gs)].sort((a, b) => link(b) - link(a) || a.files.length - b.files.length)[0];
    if (into) into.files.push(f);
    else gs.push({ title: "Files", sub: "", detail: "", files: [f] });
  }
  return gs.flatMap((g) => {
    if (g.files.length <= MAX_FILES) return [g];
    return splitFlat("", g.files, inv).map((part, i) => ({ ...g, title: i ? `${cutWords(g.title, 3)} ${i + 1}` : g.title, files: part.files }));
  });
}

/* ── 2. skeleton ─────────────────────────────────────────────── */

/** A leaf as built, with what its words call is shown. */
interface LeafSlot { node: Node; file: string; ranges: Range[]; ui: boolean; group?: string }

/**
 * A file's code as leaves within LEAF's limits: the whole file when it is
 * short enough, else its outermost functions packed in order, near ones
 * joined, a function past the limit a leaf of its own on its first lines.
 */
function chunksOf(p: string, n: number, sums: Record<string, FileSummary>, g: Graph): { ranges: Range[]; names: string[] }[] {
  if (n <= LEAF.lines) return [{ ranges: [{ file: p, start: 1, end: n }], names: [] }];
  const syms = [
    ...(sums[p]?.symbols ?? []).map((s) => ({ name: s.name, start: s.start, end: s.end })),
    ...g.defs.filter((d) => d.file === p && !d.parent).map((d) => ({ name: d.name, start: d.start, end: d.end })),
  ]
    .filter((s) => s.start >= 1 && s.start <= n && s.end >= s.start)
    .map((s) => ({ ...s, end: Math.min(s.end, n) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const outer: typeof syms = [];
  for (const s of syms) {
    const last = outer[outer.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else outer.push({ ...s });
  }
  if (!outer.length) return [{ ranges: [{ file: p, start: 1, end: LEAF.lines }], names: [] }];
  const out: { ranges: Range[]; names: string[]; used: number }[] = [];
  for (const s of outer) {
    const len = Math.min(s.end - s.start + 1, LEAF.lines);
    const end = s.start + len - 1;
    const cur = out[out.length - 1];
    const last = cur?.ranges[cur.ranges.length - 1];
    if (cur && last && s.start - last.end <= 8 && cur.used + (end - last.end) <= LEAF.lines) {
      cur.used += end - last.end;
      last.end = end;
      cur.names.push(s.name);
    } else if (cur && cur.ranges.length < LEAF.refs && cur.used + len <= LEAF.lines) {
      cur.ranges.push({ file: p, start: s.start, end });
      cur.used += len;
      cur.names.push(s.name);
    } else out.push({ ranges: [{ file: p, start: s.start, end }], names: [s.name], used: len });
  }
  return out.map(({ ranges, names }) => ({ ranges, names }));
}

/** A file's name as an id, its directory's for a name every directory has: `api/map/route.ts` → map. */
const GENERIC = /^(route|page|layout|index|main|mod|lib|__init__|init|handler|server|client|types?|utils?)$/;
function fileSlug(p: string): string {
  const name = slug(basename(p));
  const dir = p.split("/").slice(-2, -1)[0];
  return GENERIC.test(name) && dir ? slug(dir) : name;
}

/** Steps for a leaf the model gave none for: its functions, each on its own first lines. */
function fallbackSteps(ranges: Range[], sums: Record<string, FileSummary>) {
  const syms = (sums[ranges[0].file]?.symbols ?? []).filter((s) => ranges.some((r) => r.file === ranges[0].file && r.start <= s.start && s.start <= r.end));
  const rows = (syms.length ? syms : [{ name: "The code", start: ranges[0].start, end: ranges[0].end, does: "" }]).slice(0, 8).map((s, i) => {
    const r = ranges.find((x) => x.start <= s.start && s.start <= x.end)!;
    const end = Math.min(s.end, r.end, s.start + STEP_LINES - 1);
    return { n: i + 1, title: short(s.name, 40), detail: s.does || s.name, state: "derived", at: `${r.file}:${s.start}-${end}` };
  });
  return rows;
}

/**
 * Boxes moved until the page draws no line through a box or label on label:
 * a box swapped with another in its column or moved to the next one, kept
 * when the layout check counts fewer problems. What it cannot clear is listed.
 */
function untangle(block: any, tries = 300) {
  const score = () => layoutProblems(block).problems.length;
  let best = score();
  const cols = Math.max(1, ...block.boxes.map((b: any) => b.col + 1));
  let seed = block.boxes.length * 7919 + block.arrows.length;
  const rand = (n: number) => ((seed = (seed * 48271) % 2147483647) % n);
  for (let i = 0; i < tries && best > 0; i++) {
    const before = block.boxes.map((b: any) => [b.col, b.row]);
    const a = block.boxes[rand(block.boxes.length)];
    const same = block.boxes.filter((b: any) => b !== a && b.col === a.col);
    if (same.length && rand(2)) {
      const b = same[rand(same.length)];
      [a.row, b.row] = [b.row, a.row];
    } else {
      const col = Math.min(Math.max(cols, 2), 3) > 1 ? rand(Math.min(Math.max(cols, 2), 3)) : a.col;
      const taken = new Set(block.boxes.filter((b: any) => b !== a && b.col === col).map((b: any) => b.row));
      let row = 0;
      while (taken.has(row)) row++;
      [a.col, a.row] = [col, row];
    }
    const now = score();
    if (now < best) best = now;
    else block.boxes.forEach((b: any, k: number) => ([b.col, b.row] = before[k]));
  }
  // Rows closed up, so a column has no empty cell above a box; kept only if the page draws it no worse.
  const placed = block.boxes.map((b: any) => [b.col, b.row]);
  for (let c = 0; c < 3; c++)
    block.boxes.filter((b: any) => b.col === c).sort((x: any, y: any) => x.row - y.row).forEach((b: any, k: number) => (b.row = k));
  if (score() > best) block.boxes.forEach((b: any, k: number) => ([b.col, b.row] = placed[k]));
}

/* ── 3. words ────────────────────────────────────────────────── */

const LEAVES_TOOL: Tool = {
  name: "leaves",
  description: "Record the words for each piece of code shown.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["leaves"],
    properties: {
      leaves: {
        type: "array",
        description: "One entry per piece of code shown, by its id.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "sub", "detail", "steps", ...(ex ? ["explain"] : [])],
          properties: {
            id: { type: "string" },
            ...NAMED,
            ...explainField(LEAF_EXPLAIN_MAX),
            steps: {
              type: "array",
              description: "2-6 steps, in the order the code does them: what happens, each at the lines where it happens.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "detail", "start", "end"],
                properties: {
                  title: { type: "string", description: "A few words: what happens." },
                  detail: { type: "string", description: "One plain sentence, naming the function or value in `backticks`." },
                  start: { type: "integer", description: "First line, as numbered in the code shown." },
                  end: { type: "integer", description: `Last line, at most ${STEP_LINES} lines after start, within the same shown range.` },
                },
              },
            },
            screen: {
              type: "object",
              description: "Only for a piece marked `may show a screen`, and only if it renders one: what a person sees on it, in order.",
              additionalProperties: false,
              required: ["title", "items"],
              properties: {
                title: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "label"],
                    properties: { type: { type: "string", enum: ["heading", "text", "field", "choice", "button", "list", "image"] }, label: { type: "string" }, note: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const LEVELS_TOOL: Tool = {
  name: "levels",
  description: "Record the words for each level of this section and a label for each arrow.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["levels", "arrows"],
    properties: {
      levels: {
        type: "array",
        description: "One entry per level listed, by its id.",
        items: { type: "object", additionalProperties: false, required: ["id", "title", "sub", "detail", ...(ex ? ["explain"] : [])], properties: { id: { type: "string" }, ...NAMED, ...EXPLAIN_FIELD } },
      },
      arrows: {
        type: "array",
        description: "A label for each arrow listed, and only those.",
        items: { type: "object", additionalProperties: false, required: ["from", "to", "label"], properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string", description: "2-4 words, at most 24 characters: what the call does ('loads the map', 'checks a submit')." } } },
      },
    },
  },
};


/** The section in full: groups, skeleton, words. Shaped as an author's result so the pipeline and its report read it alike. */
export async function deepRoot(root: Root, quick: Node, inv: Inventory, sums: Record<string, FileSummary>, g: Graph, models: Models, say: (s: string) => void): Promise<Authored> {
  const lines = new Map(inv.files.map((f) => [f.path, f.lines]));
  const files = root.files.filter((p) => lines.has(p));
  const draw = diagramOf(g);
  let calls = 0;

  // The quick map's words for each file: what a part keeps when its words call fails.
  const quickByFile = new Map<string, Node>();
  const index = (n: Node) => {
    if (!n.children?.length && n.code?.[0]) quickByFile.set(n.code[0].file, n);
    (n.children ?? []).forEach(index);
  };
  index(quick);
  const fallbackOf = (p: string) => {
    const q = quickByFile.get(p);
    return { title: q?.title ?? short(basename(p), 40), sub: q?.sub ?? sums[p]?.kind ?? "", detail: q?.detail ?? within40(sums[p]?.purpose ?? "") };
  };

  // 1. Groups.
  let groups: Group[] = [];
  if (files.length >= GROUP_MIN)
    try {
      groups = await groupFiles(quick, files, inv, sums, models.group);
      calls++;
    } catch (e) {
      // No groups from the model: along imports, as the quick map splits a flat directory.
      say(`${root.id}: grouping failed, split along imports — ${(e as Error).message.slice(0, 120)}`);
      if (files.length > MAX_FILES) groups = splitFlat("", files, inv).map((x, i) => ({ title: `${cutWords(quick.title, 3)} ${i + 1}`, sub: quick.sub, detail: "", files: x.files }));
    }
  const flat = groups.length < 2;
  say(`${root.id}: ${flat ? `${files.length} files, no groups` : `grouped into ${groups.map((x) => x.title).join(", ")}`}`);

  // 2. Skeleton.
  const ids = new Set<string>([root.id]);
  const unique = (k: string) => {
    for (let n = 2; ids.has(k); n++) k = `${k.replace(/-\d+$/, "")}-${n}`;
    ids.add(k);
    return k;
  };
  const leaves: LeafSlot[] = [];
  /** Levels with parts, innermost first once built: each with what its diagram's boxes stand for. */
  const levels: { node: Node; kids: { node: Node; files: string[]; ranges?: Range[] }[]; files: string[]; about: string }[] = [];
  const base = (id: string, w: { title: string; sub: string; detail: string }, code: Range[]): Node =>
    ({ id, title: short(cutWords(w.title, 4), 40), sub: short(cutWords(w.sub, SUB_WORDS), 60), state: "derived", col: 0, row: 0, detail: fit40(w.detail), code }) as unknown as Node;

  const ui = (p: string) => /\.(tsx|jsx|vue|svelte)$/.test(p) && ["screen", "component"].includes(sums[p]?.kind ?? "") && Boolean(sums[p]?.user_sees);
  const fileNode = (p: string, group?: string): Node => {
    const n = lines.get(p) ?? 1;
    const chunks = chunksOf(p, n, sums, g);
    const fid = unique(`${root.prefix}-${fileSlug(p)}`);
    if (chunks.length <= 1) {
      const node = base(fid, fallbackOf(p), chunks[0]?.ranges ?? [{ file: p, start: 1, end: Math.min(n, LEAF.lines) }]);
      leaves.push({ node, file: p, ranges: node.code as Range[], ui: ui(p), group });
      return node;
    }
    const kids = chunks.map((c) => {
      const node = base(unique(`${fid}-${slug(c.names[0] ?? "part")}`), { title: short(c.names[0] ?? basename(p), 40), sub: "", detail: "" }, c.ranges);
      leaves.push({ node, file: p, ranges: c.ranges, ui: false, group });
      return { node, files: [] as string[], ranges: c.ranges };
    });
    const node = { ...base(fid, fallbackOf(p), leafCode(p, n, sums[p])), children: kids.map((k) => k.node) } as Node;
    levels.push({ node, kids, files: [p], about: sums[p] ? oneLine(sums[p]) : p });
    return node;
  };
  const keyFile = (fs: string[]) => {
    const set = new Set(fs);
    const fileOf = new Map(g.defs.map((d) => [d.id, d.file]));
    const into = (p: string) => g.edges.filter((e) => e.kind !== "imports" && (fileOf.get(e.to) ?? e.to) === p && set.has(fileOf.get(e.from) ?? e.from) && (fileOf.get(e.from) ?? e.from) !== p).length;
    return [...fs].sort((a, b) => into(b) - into(a) || a.localeCompare(b))[0];
  };
  const levelCode = (fs: string[]) => {
    const k = keyFile(fs);
    return k ? leafCode(k, lines.get(k) ?? 1, sums[k]) : [];
  };

  let top: { node: Node; files: string[] }[];
  if (flat) top = files.map((p) => ({ node: fileNode(p), files: [p] }));
  else
    top = groups.map((gr) => {
      const kids = gr.files.map((p) => ({ node: fileNode(p, gr.title), files: [p] }));
      const node = { ...base(unique(`${root.prefix}-${slug(gr.title)}`), gr, levelCode(gr.files)), children: kids.map((k) => k.node) } as Node;
      levels.push({ node, kids, files: gr.files, about: `${gr.title} — ${gr.sub}` });
      return { node, files: gr.files };
    });
  const rootNode = { ...base(root.id, { title: quick.title, sub: quick.sub, detail: quick.detail ?? "" }, levelCode(files)), children: top.map((k) => k.node) } as Node;
  levels.push({ node: rootNode, kids: top, files, about: `${quick.title} — ${quick.sub}` });

  // 3. Words: the levels in one call, the leaves in batches, side by side.
  const labels = new Map<string, string>();
  const arrowsOf = (lv: (typeof levels)[number]) => draw(lv.node.title, lv.kids, "b-").arrows;
  const levelsCall = async (batch: typeof levels) => {
    const kidLine = (k: { node: Node; files: string[]; ranges?: Range[] }) =>
      k.ranges ? `${k.node.id}: ${k.node.title} (${k.ranges.map((r) => `${r.start}-${r.end}`).join(", ")})` : k.files.length === 1 ? `${k.node.id}: ${sums[k.files[0]] ? oneLine(sums[k.files[0]]) : k.files[0]}` : `${k.node.id}: ${k.node.title} — ${k.node.sub} (${k.files.length} files)`;
    const prompt = (only: string[] | null) => {
      const shown = only ? batch.filter((lv) => only.includes(lv.node.id)) : batch;
      const arrowList = only ? [] : batch.flatMap((lv) => arrowsOf(lv).map((a) => `- ${a.from.slice(2)} → ${a.to.slice(2)} (${a.label}, at ${a.at})`));
      return [
        `# Repository: ${inv.name}`,
        `## Section "${root.id}" as the quick map has it: ${quick.title} — ${quick.sub}\n${quick.detail ?? ""}`,
        `## Levels to write, each with the parts it opens\n${shown.map((lv) => `### ${lv.node.id}${lv.node.id === root.id ? " (the section itself)" : ""}: ${lv.about}\n${lv.kids.map((k) => `- ${kidLine(k)}`).join("\n")}`).join("\n\n")}`,
        arrowList.length ? `## Arrows, from the call graph (from → to, what is called, the line)\n${arrowList.join("\n")}` : "",
        `## Task\nWrite each level's words: what it does as a whole, from its parts.${arrowList.length ? " Then label each arrow with what that call does." : ""}`,
      ].filter(Boolean).join("\n\n");
    };
    let got: Awaited<ReturnType<typeof askEntries>> | null = null;
    try {
      got = await askEntries({ model: models.group, stage: "deep-levels", tool: LEVELS_TOOL, key: "levels", ids: batch.map((lv) => lv.node.id), prompt, wanting: (_, y) => thinExplain(y) });
      calls += got.calls;
    } catch (e) {
      say(`${root.id}: words for ${batch.length} levels failed, kept the quick ones — ${(e as Error).message.slice(0, 120)}`);
    }
    for (const lv of batch) {
      const l = got?.entries.get(lv.node.id);
      if (!l) continue;
      const w = fitted(l, lv.node as any);
      Object.assign(lv.node, { title: short(w.title, 40), sub: short(w.sub, 60), detail: w.detail, ...(w.explain ? { explain: { body: w.explain } } : {}) });
    }
    for (const l of Array.isArray(got?.answer?.arrows) ? got.answer.arrows : []) if (typeof l?.label === "string") labels.set(`${l.from}\n${l.to}`, short(l.label, 24));
  };

  const batches: LeafSlot[][] = [];
  for (const l of leaves) {
    const size = (b: LeafSlot[]) => b.reduce((n, x) => n + x.ranges.reduce((m, r) => m + r.end - r.start + 1, 0), 0);
    const cur = batches[batches.length - 1];
    if (cur && cur.length < BATCH_LEAVES && size(cur) + size([l]) <= BATCH_LINES) cur.push(l);
    else batches.push([l]);
  }
  const inLeaf = (l: LeafSlot, start: number, end: number) => l.ranges.find((r) => r.start <= start && start <= r.end && start <= end);
  const leafCall = async (batch: LeafSlot[]) => {
    const prompt = (only: string[] | null) => {
      const shown = (only ? batch.filter((l) => only.includes(l.node.id)) : batch).map((l) => {
        const s = sums[l.file];
        return [
          `### ${l.node.id}${l.ui ? " (may show a screen)" : ""}`,
          `${l.file}${l.group ? `, in "${l.group}"` : ""}${s ? ` — ${s.purpose}` : ""}${l.ui && s?.user_sees ? `\nShows: ${s.user_sees}` : ""}`,
          ...l.ranges.map((r) => `Lines ${r.start}-${r.end}:\n${numbered(inv.repo, r.file, r.start, r.end)}`),
        ].join("\n");
      });
      return [
        `# Repository: ${inv.name}`,
        `## Section: ${quick.title} — ${quick.sub}`,
        `## The pieces of code, each with its id\n${shown.join("\n\n")}`,
        `## Task\nFor each piece: its words, and its steps — what the code does, in order, each citing lines inside that piece's shown lines.`,
      ].join("\n\n");
    };
    // A step code can place: its first line inside the leaf's code. One running past is clamped below.
    const placeable = (l: LeafSlot, y: any) => (Array.isArray(y?.steps) ? y.steps : []).filter((s: any) => Number.isInteger(s?.start) && Number.isInteger(s?.end) && inLeaf(l, s.start, s.end)).length;
    let got: Awaited<ReturnType<typeof askEntries>> | null = null;
    try {
      got = await askEntries({
        model: models.words,
        stage: "deep-leaves",
        tool: LEAVES_TOOL,
        key: "leaves",
        ids: batch.map((l) => l.node.id),
        prompt,
        wanting: (id, y) => {
          const l = batch.find((b) => b.node.id === id)!;
          return [...(placeable(l, y) ? [] : ["no step inside its shown lines"]), ...thinExplain(y)];
        },
      });
      calls += got.calls;
    } catch (e) {
      say(`${root.id}: words for ${batch.length} parts failed, kept the quick ones — ${(e as Error).message.slice(0, 120)}`);
    }
    const a = { leaves: [...(got?.entries.values() ?? [])] };
    for (const l of batch) {
      const y = (Array.isArray(a?.leaves) ? a.leaves : []).find((v: any) => v?.id === l.node.id);
      const w = fitted(y, l.node as any, LEAF_EXPLAIN_MAX);
      const steps = (Array.isArray(y?.steps) ? y.steps : [])
        .map((s: any) => {
          const r = Number.isInteger(s?.start) && Number.isInteger(s?.end) ? inLeaf(l, s.start, s.end) : undefined;
          if (!r || typeof s?.title !== "string") return null;
          const end = Math.min(s.end, r.end, s.start + STEP_LINES - 1);
          return { title: short(s.title, 40), detail: typeof s.detail === "string" ? s.detail : "", state: "derived", at: end === s.start ? `${r.file}:${s.start}` : `${r.file}:${s.start}-${end}` };
        })
        .filter(Boolean)
        .slice(0, 8)
        .map((s: any, i: number) => ({ n: i + 1, ...s }));
      const screen =
        l.ui && y?.screen && Array.isArray(y.screen.items) && y.screen.items.length
          ? [{ kind: "screen", title: short(String(y.screen.title ?? w.title), 40), device: "web", items: y.screen.items.filter((it: any) => typeof it?.label === "string").slice(0, 10) }]
          : [];
      Object.assign(l.node, {
        title: short(w.title, 40),
        sub: short(w.sub, 60),
        detail: w.detail,
        ...(w.explain ? { explain: { body: w.explain } } : {}),
        anatomy: [...screen, { kind: "flow", rows: steps.length ? steps : fallbackSteps(l.ranges, sums) }],
      });
    }
  };

  // The section and its groups in one call, so they read as one; a split file's level, a few to a call.
  const outer = levels.filter((lv) => lv.node.id === rootNode.id || top.some((t) => t.node === lv.node));
  const inner = levels.filter((lv) => !outer.includes(lv));
  const levelBatches = [outer, ...Array.from({ length: Math.ceil(inner.length / LEVEL_BATCH) }, (_, i) => inner.slice(i * LEVEL_BATCH, (i + 1) * LEVEL_BATCH))];
  await Promise.all([...levelBatches.map(levelsCall), ...batches.map(leafCall)]);

  // The diagrams, drawn once every box has its words, with the labels written for them.
  const linesOf = fileReader(inv.repo);
  for (const lv of levels) {
    const block: any = draw(lv.node.title, lv.kids, "b-", (a, b) => labels.get(`${a.id}\n${b.id}`));
    // A call the graph places on a line that does nothing (a bracket, a comment) is no line to show: no arrow.
    block.arrows = block.arrows.filter((a: any) => {
      const m = /^(.+):(\d+)$/.exec(a.at ?? "");
      const ls = m && linesOf(m[1]);
      return !ls || !bareLines(ls)[+m![2] - 1];
    });
    untangle(block);
    (lv.node as any).anatomy = [block];
  }
  const notes = autofix(rootNode, inv.repo);
  const problems = check({ AUTHORED: [rootNode], OVERVIEW: undefined as any }, inv.repo, { generated: true, only: new Set([root.id]) }).problems;
  say(`${root.id}: written in ${calls} calls — ${problems.length ? `${problems.length} problems listed` : "clean"}${notes.length ? `, ${notes.length} fixed` : ""}`);
  return { root: rootNode, turns: Math.max(0, calls - 1), reads: 0, submits: 1, problems, trail: [] };
}

/* ── the overview ────────────────────────────────────────────── */

const OVERVIEW_TOOL: Tool = {
  name: "overview",
  description: "Record the map's walkthroughs and its way in.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["walkthroughs", ...(ex ? ["explain", "glossary"] : [])],
    properties: {
      walkthroughs: {
        type: "array",
        description: `${WALKS[0]}-${WALKS[1]} of the paths listed: the core things this system does, the ones a developer new to it most needs.`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "title", "steps"],
          properties: {
            path: { type: "integer", description: "The number of the path it follows." },
            title: { type: "string", description: "A short sentence: what is being followed ('A reader opens a map')." },
            steps: {
              type: "array",
              description: `${WALK_STEPS[0]}-${WALK_STEPS[1]} of the path's stops, in its order; leave out stops that add nothing.`,
              items: { type: "object", additionalProperties: false, required: ["stop", "title", "detail"], properties: { stop: { type: "integer", description: "The stop's number on its path." }, title: { type: "string", description: "A few words." }, detail: { type: "string", description: "One or two plain sentences naming the function that does it." } } },
            },
          },
        },
      },
      ...(ex
        ? {
            explain: { type: "string", description: `${ex.min}-${ex.max} words (${ex.say}): what this system is for and who uses it, the problem it solves, and the idea behind how it works, each word of its field defined the first time.` },
            glossary: {
              type: "array",
              description: `${ex.terms[0]}-${ex.terms[1]} terms the map's titles and details lean on: the words ${ex.words}. Use the exact word the map uses.`,
              items: { type: "object", additionalProperties: false, required: ["term", "meaning"], properties: { term: { type: "string" }, meaning: { type: "string", description: "One plain sentence of at most 25 words." } } },
            },
          }
        : {}),
    },
  },
};

/**
 * Paths a walkthrough could follow: from the parts holding the entry points,
 * along calls from one part to the next, preferring a step into a section not
 * yet passed through. Only those crossing two sections or more.
 */
export function tracedPaths(roots: Node[], inv: Inventory, g: Graph): string[][][] {
  const cited = citations(roots);
  const defs = new Map(g.defs.map((d) => [d.id, d]));
  const partAt = (file: string, line: number) => nodesAt(cited, file, line)[0]?.path;
  const key = (p: string[]) => p.join("/");
  const next = new Map<string, { to: string[]; n: number }[]>();
  const paths = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.kind === "imports" || !e.lines.length) continue;
    const from = partAt(defs.get(e.from)?.file ?? e.from, e.lines[0]);
    const d = defs.get(e.to);
    const to = d ? partAt(d.file, d.start) : undefined;
    if (!from || !to || key(from) === key(to)) continue;
    paths.set(key(from), from);
    paths.set(key(to), to);
    const list = next.get(key(from)) ?? [];
    const hit = list.find((x) => key(x.to) === key(to));
    if (hit) hit.n++;
    else list.push({ to, n: 1 });
    next.set(key(from), list);
  }
  const starts = new Map<string, string[]>();
  for (const p of entrypoints(inv)) for (const c of cited.get(p) ?? []) starts.set(key(c.path), c.path);
  const out: string[][][] = [];
  const seen = new Set<string>();
  for (const s of starts.values())
    for (const first of [...(next.get(key(s)) ?? [])].sort((a, b) => b.n - a.n).slice(0, 3)) {
      const walk = [s, first.to];
      while (walk.length < WALK_STEPS[1]) {
        const here = walk[walk.length - 1];
        const crossed = new Set(walk.map((p) => p[0]));
        const cand = (next.get(key(here)) ?? []).filter((x) => !walk.some((w) => key(w) === key(x.to)));
        if (!cand.length) break;
        cand.sort((a, b) => Number(!crossed.has(b.to[0])) - Number(!crossed.has(a.to[0])) || b.n - a.n);
        walk.push(cand[0].to);
      }
      const k = walk.map(key).join(" > ");
      if (walk.length >= WALK_STEPS[0] && new Set(walk.map((p) => p[0])).size >= 2 && !seen.has(k)) {
        seen.add(k);
        out.push(walk);
      }
    }
  return out.sort((a, b) => new Set(b.map((p) => p[0])).size - new Set(a.map((p) => p[0])).size || b.length - a.length).slice(0, 12);
}

/** The top level over the sections as written in full: the quick one's picture with their new names, walkthroughs from traced paths, and its way in. */
export async function deepOverview(roots: Node[], quick: Overview, inv: Inventory, g: Graph, model: string): Promise<{ overview: Overview; problems: string[] }> {
  const nodeAt = (path: string[]) => {
    let n: Node | undefined = roots.find((r) => r.id === path[0]);
    for (const id of path.slice(1)) n = n?.children?.find((c) => c.id === id);
    return n;
  };
  const paths = tracedPaths(roots, inv, g);
  const prompt = [
    `# Repository: ${inv.name}`,
    `## README (excerpt)\n${inv.readme.slice(0, 3000) || "(none)"}`,
    `## What it is: ${quick.sub ?? ""}\n${quick.detail ?? ""}`,
    `## Its sections\n${roots.map((r) => `- ${r.title} — ${r.sub}\n  ${r.detail ?? ""}`).join("\n")}`,
    paths.length
      ? `## Paths the code takes through them, from the call graph\n${paths
          .map((p, i) => `### Path ${i + 1}\n${p.map((x, j) => { const n = nodeAt(x); const r = nodeAt([x[0]]); return `${j + 1}. ${r?.title} › ${n?.title} — ${n?.detail ?? n?.sub ?? ""}`; }).join("\n")}`)
          .join("\n\n")}`
      : "",
    `## Task\n${paths.length ? `Pick the ${WALKS[0]}-${WALKS[1]} paths that show what this system does end to end, and write each as a walkthrough. ` : ""}${ex ? "Then write the way in for a newcomer: the explainer and the glossary." : ""}`,
  ].filter(Boolean).join("\n\n");
  const stepProblems = (x: any): string[] => {
    const ws: any[] = Array.isArray(x?.walkthroughs) ? x.walkthroughs : [];
    const out: string[] = [];
    if (paths.length >= WALKS[0] && (ws.length < WALKS[0] || ws.length > WALKS[1])) out.push(`there are ${ws.length} walkthroughs; give ${WALKS[0]}-${WALKS[1]}`);
    ws.forEach((w, i) => {
      const p = paths[(w?.path ?? 0) - 1];
      if (!p) return out.push(`walkthrough ${i + 1} follows path ${w?.path}, which is not listed`);
      const stops: number[] = (Array.isArray(w?.steps) ? w.steps : []).map((s: any) => s?.stop);
      if (stops.length < WALK_STEPS[0] || stops.length > WALK_STEPS[1]) out.push(`walkthrough ${i + 1} has ${stops.length} steps; give ${WALK_STEPS[0]}-${WALK_STEPS[1]}`);
      if (stops.some((s) => !p[s - 1])) out.push(`walkthrough ${i + 1} names a stop its path does not have`);
      if (new Set(stops.filter((s) => p[s - 1]).map((s) => p[s - 1][0])).size < 2) out.push(`walkthrough ${i + 1} stays inside one section; keep stops from at least two`);
    });
    if (ex) {
      const w = words(typeof x?.explain === "string" ? x.explain : "");
      if (w < ex.min || w > ex.max) out.push(`the explain is ${w} words; it must be ${ex.min}-${ex.max}`);
      const terms: any[] = Array.isArray(x?.glossary) ? x.glossary : [];
      if (terms.length < ex.terms[0] || terms.length > ex.terms[1]) out.push(`the glossary has ${terms.length} terms; give ${ex.terms[0]}-${ex.terms[1]}`);
      for (const t of terms) if (words(String(t?.meaning ?? "")) > 25) out.push(`the meaning of "${t?.term}" is over 25 words`);
    }
    return out;
  };
  const a = await askWithin({ model, stage: "deep-overview", maxTokens: 8000, prompt, tool: OVERVIEW_TOOL }, stepProblems);
  const walkthroughs = (Array.isArray(a?.walkthroughs) ? a.walkthroughs : [])
    .map((w: any) => {
      const p = paths[(w?.path ?? 0) - 1];
      if (!p) return null;
      const steps = (Array.isArray(w?.steps) ? w.steps : []).filter((s: any) => p[s?.stop - 1]).slice(0, WALK_STEPS[1]).map((s: any) => ({ title: String(s.title ?? ""), detail: String(s.detail ?? ""), path: p[s.stop - 1] }));
      return steps.length >= WALK_STEPS[0] ? { title: String(w.title ?? ""), steps } : null;
    })
    .filter(Boolean)
    .slice(0, WALKS[1]);

  // The quick picture, its boxes named as the sections now are.
  const linesOf = fileReader(inv.repo);
  const anatomy = (quick.anatomy ?? []).map((b: any) => {
    if (b.kind !== "diagram") return b;
    const block = {
      ...b,
      boxes: b.boxes.map((x: any) => { const r = roots.find((n) => n.id === x.opens); return r ? { ...x, label: r.title, sub: r.sub } : { ...x }; }),
      // As on a section's diagrams: no arrow on a line that does nothing.
      arrows: b.arrows.filter((x: any) => { const m = /^(.+):(\d+)$/.exec(x.at ?? ""); const ls = m && linesOf(m[1]); return !ls || !bareLines(ls)[+m![2] - 1]; }),
    };
    untangle(block);
    return block;
  });
  const overview: Overview = {
    ...quick,
    anatomy,
    walkthroughs,
    ...(ex && typeof a?.explain === "string" ? { explain: { body: cutWords(a.explain, ex.max) } } : {}),
    ...(ex && Array.isArray(a?.glossary) ? { glossary: a.glossary.filter((t: any) => typeof t?.term === "string" && typeof t?.meaning === "string").slice(0, ex.terms[1]) } : {}),
  } as Overview;
  const problems = check({ AUTHORED: roots, OVERVIEW: overview }, inv.repo, { generated: true }).problems.filter((p) => p.includes("(overview)"));
  return { overview, problems };
}
