/**
 * The fast map (--fast): the same map file, made in four phases where code
 * does what code can and a model only names and describes.
 *
 * 1. Extraction, no model: the inventory, the fact graph, and from them the
 *    module graph (calls between components, weighted) and the entry points,
 *    written to arch.json. The summarize stage's reading of each file is the
 *    one model input, as in the full pipeline.
 * 2. Partition, no model: files grouped by directory into a tree. The top
 *    level is the deepest directory level with at most TOP_MAX groups; inside
 *    a component, groups of at most MAX_FILES files, by subdirectory, and a
 *    flat directory still too big split along its own imports.
 * 3. Fan out: one short call per component, all at once, no tools and no
 *    thinking: its title, sub, what it is responsible for, and a title for
 *    each of its groups and files.
 * 4. Synthesize: one short call over the components and the module graph for
 *    the map's top line, their order and a label per arrow. Arrows are drawn
 *    from the graph, never from the model: an arrow it names that the graph
 *    lacks is listed as a discrepancy, not drawn. The map is checked once and
 *    its problems listed, not sent back for repair.
 *
 * What it gives up against the full pipeline: levels follow directories, not
 * what a person does; a file's level lists its functions as steps rather than
 * explaining them; there are no explainers and no walkthroughs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model answers */
import { basename } from "node:path";
import type { Node } from "@/lib/data";
import type { MapFile, Overview } from "@/lib/map";
import { prefixFor } from "./author";
import { ask, type Tool } from "./bedrock";
import { check, LEAF, SUB_WORDS } from "./check";
import type { Graph } from "./graph";
import { isSource, type Inventory } from "./inventory";
import { oneLine, type FileSummary } from "./summarize";

/** Files one group holds at most: one diagram a reader takes in. SLOP_FAST_MAX. */
const MAX_FILES = Number(process.env.SLOP_FAST_MAX ?? 12);
/** Components the top level holds at most. SLOP_FAST_TOP. */
const TOP_MAX = Number(process.env.SLOP_FAST_TOP ?? 12);
/** Columns a diagram is laid out in at most: past this it outgrows the page. */
const COLS = 3;

interface Group {
  key: string;
  dir: string;
  files: string[];
  /** For a cluster of a flat directory: the file the others import most, which names it. */
  hub?: string;
}
export interface Component {
  id: string;
  prefix: string;
  dir: string;
  files: string[];
  /** Its middle level, when it is too big to show its files at once; empty when they are its children. */
  groups: Group[];
}
export interface ModuleEdge {
  from: string;
  to: string;
  /** Calls and imports from one component's files into the other's. */
  weight: number;
  calls: number;
  /** The line of one call, preferring one the source states: the arrow's `at`. */
  at?: string;
  inferred: boolean;
  /** What is called, a few names. */
  names: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
/** A directory's name as an id: `.claude` → claude. */
const dirSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const segsOf = (dir: string) => (dir && dir !== "." ? dir.split("/") : []);
const dirAt = (path: string, depth: number) => path.split("/").slice(0, -1).slice(0, depth).join("/");

/**
 * A directory too big to read as one group, with no subdirectories to split
 * it by: its files joined along their own imports, the most-linked pairs
 * first, while a cluster stays within MAX_FILES (union-find, as a spanning
 * tree is built). Files linked to nothing in it are chunked in name order.
 */
function splitFlat(dir: string, ps: string[], inv: Inventory): Omit<Group, "key">[] {
  const set = new Set(ps);
  const weight = new Map<string, number>();
  for (const a of ps)
    for (const b of inv.imports[a] ?? [])
      if (set.has(b) && a !== b) {
        const k = a < b ? `${a}\n${b}` : `${b}\n${a}`;
        weight.set(k, (weight.get(k) ?? 0) + 1);
      }
  const root = new Map(ps.map((p) => [p, p]));
  const size = new Map(ps.map((p) => [p, 1]));
  const find = (p: string): string => {
    while (root.get(p) !== p) p = root.get(p)!;
    return p;
  };
  for (const [k] of [...weight].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))) {
    const [a, b] = k.split("\n").map(find);
    if (a === b || size.get(a)! + size.get(b)! > MAX_FILES) continue;
    root.set(b, a);
    size.set(a, size.get(a)! + size.get(b)!);
  }
  const clusters = new Map<string, string[]>();
  for (const p of ps) clusters.set(find(p), [...(clusters.get(find(p)) ?? []), p]);
  const out: Omit<Group, "key">[] = [];
  const loose: string[] = [];
  for (const files of clusters.values()) {
    if (files.length === 1) {
      loose.push(files[0]);
      continue;
    }
    const into = (f: string) => files.filter((x) => (inv.imports[x] ?? []).includes(f)).length;
    out.push({ dir, files, hub: [...files].sort((a, b) => into(b) - into(a) || a.localeCompare(b))[0] });
  }
  loose.sort();
  for (let i = 0; i < loose.length; i += MAX_FILES) out.push({ dir, files: loose.slice(i, i + MAX_FILES) });
  return out;
}

/** Files in groups of at most MAX_FILES: by directory, deeper where one is too big, along imports where it is flat. */
function fineGroups(paths: string[], inv: Inventory, depth: number): Omit<Group, "key">[] {
  const by = new Map<string, string[]>();
  for (const p of paths) by.set(dirAt(p, depth), [...(by.get(dirAt(p, depth)) ?? []), p]);
  return [...by].flatMap(([dir, ps]) => {
    if (ps.length <= MAX_FILES) return [{ dir, files: ps }];
    const deeper = ps.filter((p) => p.split("/").length - 1 > depth);
    const own = ps.filter((p) => !deeper.includes(p));
    return [...(deeper.length ? fineGroups(deeper, inv, depth + 1) : []), ...(own.length > MAX_FILES ? splitFlat(dir, own, inv) : own.length ? [{ dir, files: own }] : [])];
  });
}

/** Directories two paths share, from the root. */
const shared = (a: string, b: string) => {
  const x = segsOf(a), y = segsOf(b);
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
};

/**
 * Groups of a component too small to be worth a box (a directory per API
 * route, one file each) folded into the sibling they share the most
 * directories with, while it stays within MAX_FILES; the merged group sits
 * at the directories they share.
 */
function coalesce(groups: Omit<Group, "key">[]): Omit<Group, "key">[] {
  const out = groups.map((g) => ({ ...g, files: [...g.files] }));
  for (let changed = true; changed; ) {
    changed = false;
    const small = out.filter((g) => g.files.length < 3).sort((a, b) => a.files.length - b.files.length || a.dir.localeCompare(b.dir));
    for (const g of small) {
      const into = out
        .filter((o) => o !== g && o.files.length + g.files.length <= MAX_FILES)
        .sort((a, b) => shared(b.dir, g.dir) - shared(a.dir, g.dir) || a.files.length - b.files.length)[0];
      if (!into) continue;
      into.files.push(...g.files);
      into.dir = segsOf(into.dir).slice(0, shared(into.dir, g.dir)).join("/");
      if (into.hub && !g.hub) delete into.hub;
      out.splice(out.indexOf(g), 1);
      changed = true;
      break;
    }
  }
  return out;
}

/** Phase 2: the files as a tree of components and, inside a big one, groups. */
export function partition(inv: Inventory): Component[] {
  const files = inv.files.filter(isSource).map((f) => f.path);
  const fine = fineGroups(files, inv, 1);
  // The top level: the deepest directory level that still has at most TOP_MAX groups.
  const deepest = Math.max(1, ...fine.map((g) => segsOf(g.dir).length));
  const keyAt = (g: Omit<Group, "key">, d: number) => segsOf(g.dir).slice(0, d).join("/") || ".";
  let d = 1;
  for (let k = deepest; k >= 1; k--)
    if (new Set(fine.map((g) => keyAt(g, k))).size <= TOP_MAX) {
      d = k;
      break;
    }
  const tops = new Map<string, Omit<Group, "key">[]>();
  for (const g of fine) tops.set(keyAt(g, d), [...(tops.get(keyAt(g, d)) ?? []), g]);
  let comps = [...tops].map(([dir, gs]) => ({ dir, groups: gs, files: gs.flatMap((g) => g.files) }));

  // A component of one file joins the one it shares the most imports with; one tied to none stays.
  const linked = (a: string[], b: string[]) =>
    a.reduce((n, f) => n + (inv.imports[f] ?? []).filter((t) => b.includes(t)).length, 0) + b.reduce((n, f) => n + (inv.imports[f] ?? []).filter((t) => a.includes(t)).length, 0);
  for (const c of [...comps].filter((x) => x.files.length === 1)) {
    const others = comps.filter((x) => x !== c);
    const best = others.map((o) => [o, linked(c.files, o.files)] as const).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) {
      best[0].groups.push(...c.groups);
      best[0].files.push(...c.files);
      comps = others;
    }
  }

  // Ids from the directory's last name, else its last two: `components`, `landing-components`.
  const last = (dir: string, n: number) => segsOf(dir).slice(-n).map(dirSlug).filter(Boolean).join("-") || "root";
  const ids = new Set<string>();
  const taken = new Set<string>();
  return comps.map((c) => {
    let id = comps.some((o) => o !== c && last(o.dir, 1) === last(c.dir, 1)) ? last(c.dir, 2) : last(c.dir, 1);
    for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
    ids.add(id);
    // A middle level only when the files will not fit on one diagram, and there is more than one group.
    const keys = new Set<string>();
    const fine = c.files.length > MAX_FILES ? coalesce(c.groups) : [];
    const groups =
      fine.length > 1
        ? fine.map((g) => {
            const rel = segsOf(g.dir).slice(segsOf(c.dir).length).map(dirSlug).join("-");
            let key = [rel, g.hub ? slug(basename(g.hub)) : ""].filter(Boolean).join("-") || "files";
            for (let n = 2; keys.has(key); n++) key = `${key.replace(/-\d+$/, "")}-${n}`;
            keys.add(key);
            return { ...g, key };
          })
        : [];
    return { id, prefix: prefixFor(id, taken), dir: c.dir, files: [...c.files].sort(), groups };
  });
}

/** Phase 1: the graph's calls rolled up between components; imports add weight but no line. */
export function moduleGraph(g: Graph, comps: Component[]): ModuleEdge[] {
  const owner = new Map<string, string>();
  for (const c of comps) for (const f of c.files) owner.set(f, c.id);
  const fileOf = new Map(g.defs.map((d) => [d.id, d.file]));
  const nameOf = new Map(g.defs.map((d) => [d.id, d.name]));
  const edges = new Map<string, ModuleEdge>();
  for (const e of g.edges) {
    const a = owner.get(fileOf.get(e.from) ?? e.from), b = owner.get(fileOf.get(e.to) ?? e.to);
    if (!a || !b || a === b) continue;
    const k = `${a}\n${b}`;
    const m = edges.get(k) ?? { from: a, to: b, weight: 0, calls: 0, inferred: true, names: [] };
    m.weight++;
    if (e.kind !== "imports" && e.lines.length) {
      m.calls++;
      const name = nameOf.get(e.to) ?? basename(e.to);
      if (!m.names.includes(name) && m.names.length < 4) m.names.push(name);
      // A call the source states beats one matched by name.
      if (!m.at || (m.inferred && e.how === "extracted")) [m.at, m.inferred] = [`${fileOf.get(e.from) ?? e.from}:${e.lines[0]}`, e.how !== "extracted"];
    }
    edges.set(k, m);
  }
  return [...edges.values()].sort((x, y) => y.weight - x.weight);
}

/** Files nothing in the repository imports, that import something: where the code starts. */
export function entrypoints(inv: Inventory): string[] {
  const imported = new Set(Object.values(inv.imports).flat());
  return inv.files.filter((f) => isSource(f) && !imported.has(f.path) && (inv.imports[f.path] ?? []).length).map((f) => f.path);
}

const NAMED = {
  title: { type: "string", description: "1-3 words, Title Case: what this is to a reader. No file names." },
  sub: { type: "string", description: `At most ${SUB_WORDS} words (count them): what it does. No file names.` },
};
const COMPONENT_TOOL: Tool = {
  name: "component",
  description: "Record what this component of the codebase is.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "sub", "responsibility", "interface", "groups", "files"],
    properties: {
      title: { type: "string", description: "1-4 words, Title Case. What a person does here, as an action ('Reading A Post', 'Signing Up'), or for shared code a plain noun ('Shared Layouts')." },
      sub: { type: "string", description: `At most ${SUB_WORDS} words (count them), plainly: what someone does or gets here. No file names.` },
      responsibility: { type: "string", description: "1-2 sentences, at most 40 words: what this component is responsible for, in this project's words." },
      interface: { type: "array", items: { type: "string" }, description: "Its key functions, components or routes that the rest of the code uses." },
      notes: { type: "string", description: "Anything surprising, or empty." },
      groups: {
        type: "array",
        description: "One entry per group listed (none if no groups are listed), in the order a reader should meet them.",
        items: { type: "object", additionalProperties: false, required: ["key", "title", "sub", "detail"], properties: { key: { type: "string" }, ...NAMED, detail: { type: "string", description: "1-2 sentences, at most 40 words: what this group does." } } },
      },
      files: {
        type: "array",
        description: "One entry per file listed, in the order a reader should meet them.",
        items: { type: "object", additionalProperties: false, required: ["path", "title", "sub"], properties: { path: { type: "string" }, ...NAMED } },
      },
    },
  },
};

const SYNTH_TOOL: Tool = {
  name: "overview",
  description: "Record the map's top level.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["sub", "detail", "order", "arrows"],
    properties: {
      sub: { type: "string", description: `At most ${SUB_WORDS} words: what this project is.` },
      detail: { type: "string", description: "Two sentences, at most 40 words: what the project does and how its components divide the work." },
      order: { type: "array", items: { type: "string" }, description: "Every component id, in the order a reader should meet them: what a person meets first, shared code last." },
      arrows: {
        type: "array",
        description: "A label for each link listed, and only those.",
        items: { type: "object", additionalProperties: false, required: ["from", "to", "label"], properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string", description: "2-4 words, at most 24 characters: what the link means ('renders the cards', 'formats dates')." } } },
      },
    },
  },
};

const SYSTEM = "You describe one part of a map of a codebase from facts already extracted from its code. Use only what you are given; answer only with the structure asked for.";

/** Code ranges for a file as a leaf cites them: the whole file if it is short, else its largest functions within the leaf's limits. */
function leafCode(path: string, lines: number, s: FileSummary | undefined): NonNullable<Node["code"]> {
  if (lines <= LEAF.lines) return [{ file: path, start: 1, end: lines, label: s?.purpose?.split(/(?<=\.)\s/)[0] ?? basename(path) }];
  const out: NonNullable<Node["code"]> = [];
  let used = 0;
  for (const sym of [...(s?.symbols ?? [])].sort((a, b) => b.end - b.start - (a.end - a.start))) {
    const n = sym.end - sym.start + 1;
    if (out.length >= LEAF.refs || used + n > LEAF.lines) continue;
    out.push({ file: path, start: sym.start, end: sym.end, label: sym.does || sym.name });
    used += n;
  }
  return out.length ? out.sort((a, b) => a.start - b.start) : [{ file: path, start: 1, end: LEAF.lines, label: "the start of the file" }];
}

/**
 * Boxes placed along their arrows: a box's column is the longest chain of
 * arrows leading to it (a cycle stops growing at the box count), capped at
 * COLS; its row is its place among its column's boxes in the order given.
 */
function layered(ids: string[], arrows: { from: string; to: string }[]): Map<string, { col: number; row: number }> {
  const rank = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const a of arrows) {
      const r = (rank.get(a.from) ?? 0) + 1;
      if (a.from !== a.to && rank.has(a.to) && r < ids.length && r > rank.get(a.to)!) {
        rank.set(a.to, r);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const rows = new Map<number, number>();
  return new Map(
    ids.map((id) => {
      const col = Math.min(rank.get(id)!, COLS - 1);
      const row = rows.get(col) ?? 0;
      rows.set(col, row + 1);
      return [id, { col, row }];
    }),
  );
}

const short = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
type Arrow = { from: string; to: string; label: string; at: string; inferred?: boolean };

export interface FastResult {
  map: MapFile;
  arch: { files: Record<string, { component: string; lines: number; symbols: { name: string; kind: string; line: number }[]; imports: string[] }>; components: Component[]; module_graph: ModuleEdge[]; entrypoints: string[]; external_deps: string[] };
  /** What the model said that the graph does not hold: listed, not fixed. */
  discrepancies: string[];
  /** What the check found: listed, not sent back for repair. */
  checkProblems: string[];
  timing: Record<string, number>;
}

/** Phases 2-4 over an inventory, its summaries and its graph (phase 1 is the caller's: inventory, summarize, graph). */
export async function fastMap(inv: Inventory, sums: Record<string, FileSummary>, g: Graph, model: string, run: MapFile["RUN"], say: (s: string) => void): Promise<FastResult> {
  const timing: Record<string, number> = {};
  const lap = async <T,>(stage: string, fn: () => Promise<T> | T): Promise<T> => {
    const t = Date.now();
    const r = await fn();
    timing[stage] = Math.round((Date.now() - t) / 100) / 10;
    say(`${stage} done in ${timing[stage]}s`);
    return r;
  };
  const lines = new Map(inv.files.map((f) => [f.path, f.lines]));
  const defById = new Map(g.defs.map((d) => [d.id, d]));
  const fileOfDef = (id: string) => defById.get(id)?.file ?? id;
  const calls = g.edges.filter((e) => e.kind !== "imports" && e.lines.length);

  // Phases 1-2: partition and the module graph, no model.
  const { comps, mod, entries } = await lap("partition", () => {
    const comps = partition(inv);
    return { comps, mod: moduleGraph(g, comps), entries: entrypoints(inv) };
  });
  for (const c of comps) say(`${c.id.padEnd(22)} ${c.dir} — ${c.files.length} files${c.groups.length ? ` in ${c.groups.length} groups` : ""}`);
  const owner = new Map<string, Component>();
  for (const c of comps) for (const f of c.files) owner.set(f, c);
  const byId = new Map(comps.map((c) => [c.id, c]));

  // Phase 3: one short call per component, all at once.
  const fileLine = (p: string) => (sums[p] ? `${oneLine(sums[p])}\n${sums[p].symbols.slice(0, 8).map((s) => `    ${s.name} (${s.start}-${s.end}): ${s.does}`).join("\n")}` : p);
  const described = await lap("fanout", () =>
    Promise.all(
      comps.map(async (c) => {
        const out = mod.filter((e) => e.from === c.id), into = mod.filter((e) => e.to === c.id);
        const prompt = [
          `# Repository: ${inv.name}`,
          `## Component "${c.id}" (${c.dir})`,
          c.groups.length
            ? `## Its groups, each with its files\n${c.groups.map((gr) => `### Group "${gr.key}"\n${gr.files.map(fileLine).join("\n")}`).join("\n\n")}`
            : `## Its files\n${c.files.map(fileLine).join("\n")}`,
          `## Depends on\n${out.map((e) => `${e.to}: calls ${e.names.join(", ") || "(imports only)"}`).join("\n") || "(nothing)"}`,
          `## Used by\n${into.map((e) => `${e.from}: calls ${e.names.join(", ") || "(imports only)"}`).join("\n") || "(nothing)"}`,
          `${entries.some((p) => c.files.includes(p)) ? `## Entry points here\n${entries.filter((p) => c.files.includes(p)).join("\n")}\n\n` : ""}## Task\nDescribe this component${c.groups.length ? ", each of its groups," : ""} and each of its files.`,
        ].join("\n\n");
        const a = await ask<any>({ model, stage: "fast-fanout", maxTokens: 8000, system: SYSTEM, messages: [{ role: "user", content: prompt }], tool: COMPONENT_TOOL });
        return [c.id, a] as const;
      }),
    ),
  );
  const about = new Map(described);

  // Phase 4: the top line, the order, and a label per arrow the graph has.
  const synth = await lap("synthesize", () => {
    const prompt = [
      `# Repository: ${inv.name}`,
      `## README\n${inv.readme.slice(0, 4000) || "(none)"}`,
      `## Components\n${comps
        .map((c) => {
          const a = about.get(c.id);
          return `- ${c.id}: ${a?.title} — ${a?.sub}\n  ${a?.responsibility}`;
        })
        .join("\n")}`,
      `## Links between them, from the code (from → to: weight; what is called)\n${mod.filter((e) => e.calls).map((e) => `- ${e.from} → ${e.to}: ${e.weight}; ${e.names.join(", ")}`).join("\n") || "(none)"}`,
      `## Task\nWrite the map's top level: its line and detail, the order of the components, and a label for each link listed.`,
    ].join("\n\n");
    return ask<any>({ model, stage: "fast-synthesize", maxTokens: 4000, system: SYSTEM, messages: [{ role: "user", content: prompt }], tool: SYNTH_TOOL });
  });

  const discrepancies: string[] = [];
  const order = [...(synth.order ?? []).filter((id: string) => byId.has(id)), ...comps.map((c) => c.id).filter((id) => !(synth.order ?? []).includes(id))];
  for (const id of synth.order ?? []) if (!byId.has(id)) discrepancies.push(`synthesize ordered "${id}", which is no component`);

  /**
   * A diagram over some nodes, each standing for some files: a box per node,
   * and an arrow wherever the graph has a call from one's files into
   * another's, at the call's line. A call into code the target does not cite
   * is drawn as inferred: the checker holds an arrow to land in its box's code.
   */
  const diagram = (caption: string, nodes: { node: Node; files: string[] }[], boxPrefix: string, label?: (from: Node, to: Node) => string | undefined) => {
    const holder = new Map<string, Node>();
    for (const { node, files } of nodes) for (const f of files) holder.set(f, node);
    const best = new Map<string, Arrow>();
    for (const e of calls) {
      const a = holder.get(fileOfDef(e.from)), b = holder.get(fileOfDef(e.to));
      if (!a || !b || a === b) continue;
      const def = defById.get(e.to);
      const lands = !def || (b.code ?? []).some((r) => r.file === def.file && r.start <= def.end && def.start <= r.end);
      const cand: Arrow = {
        from: `${boxPrefix}${a.id}`,
        to: `${boxPrefix}${b.id}`,
        label: short(label?.(a, b) ?? `uses ${def?.name ?? basename(e.to)}`, 24),
        at: `${fileOfDef(e.from)}:${e.lines[0]}`,
        ...(e.how !== "extracted" || !lands ? { inferred: true } : {}),
      };
      const k = `${a.id}\n${b.id}`;
      const prev = best.get(k);
      if (!prev || (prev.inferred && !cand.inferred)) best.set(k, cand);
    }
    const arrows = [...best.values()];
    const place = layered(nodes.map(({ node }) => `${boxPrefix}${node.id}`), arrows);
    return { kind: "diagram", caption: short(caption, 30), boxes: nodes.map(({ node }) => ({ id: `${boxPrefix}${node.id}`, label: node.title, sub: node.sub, ...place.get(`${boxPrefix}${node.id}`)!, opens: node.id })), arrows };
  };
  /** The file of some files the others call into most: what a level's own code cites. */
  const keyFile = (files: string[]) => {
    const set = new Set(files);
    const into = (p: string) => calls.filter((e) => fileOfDef(e.to) === p && set.has(fileOfDef(e.from)) && fileOfDef(e.from) !== p).length;
    return [...files].sort((a, b) => into(b) - into(a) || a.localeCompare(b))[0];
  };

  // The tree: a node per component, a node per group in a big one, a leaf per file with its functions as steps.
  const AUTHORED: Node[] = order.map((id, row) => {
    const c = byId.get(id)!;
    const a = about.get(id) ?? {};
    const titled = new Map<string, any>((a.files ?? []).map((f: any) => [String(f.path).replace(/^\.?\//, ""), f]));
    for (const p of titled.keys()) if (!c.files.includes(p)) discrepancies.push(`${id}: fanout named a file ${p} that is not in it`);
    const ids = new Set<string>();
    const unique = (k: string) => {
      for (let n = 2; ids.has(k); n++) k = `${k.replace(/-\d+$/, "")}-${n}`;
      ids.add(k);
      return k;
    };
    // In the order the fanout gave, then any it left out.
    const ordered = (files: string[]) => [...[...titled.keys()].filter((p) => files.includes(p)), ...files.filter((p) => !titled.has(p))];
    const leaf = (p: string, i: number): Node => {
      const s = sums[p];
      const t = titled.get(p);
      const steps = (s?.symbols ?? []).slice(0, 8).map((sym, n) => ({ n: n + 1, title: short(sym.name, 40), detail: sym.does || sym.name, state: "derived", at: `${p}:${sym.start}` }));
      return {
        id: unique(`${c.prefix}-${slug(basename(p))}`),
        title: short(t?.title || basename(p), 40),
        sub: short(t?.sub || s?.kind || "", 60),
        state: "derived",
        col: 0,
        row: i,
        detail: s?.purpose ?? "",
        code: leafCode(p, lines.get(p) ?? 1, s),
        ...(steps.length ? { anatomy: [{ kind: "flow", rows: steps }] } : {}),
      } as unknown as Node;
    };
    const level = (nodeId: string, title: string, sub: string, detail: string, files: string[], kids: { node: Node; files: string[] }[], i: number): Node => {
      const key = keyFile(files);
      return {
        id: nodeId,
        title: short(title, 40),
        sub: short(sub, 60),
        state: "derived",
        col: 0,
        row: i,
        detail,
        code: key ? leafCode(key, lines.get(key) ?? 1, sums[key]) : [],
        anatomy: [diagram(title, kids, "b-")],
        children: kids.map((k) => k.node),
      } as unknown as Node;
    };
    let kids: { node: Node; files: string[] }[];
    if (c.groups.length) {
      const named = new Map<string, any>((a.groups ?? []).map((x: any) => [x.key, x]));
      for (const k of named.keys()) if (!c.groups.some((gr) => gr.key === k)) discrepancies.push(`${id}: fanout named a group "${k}" that is not in it`);
      const groups = [...[...named.keys()].map((k) => c.groups.find((gr) => gr.key === k)).filter((x): x is Group => Boolean(x)), ...c.groups.filter((gr) => !named.has(gr.key))];
      kids = groups.map((gr, i) => {
        const n = named.get(gr.key) ?? {};
        const files = ordered(gr.files);
        const leaves = files.map((p, j) => ({ node: leaf(p, j), files: [p] }));
        return { node: level(unique(`${c.prefix}-${slug(gr.key)}`), n.title || gr.key, n.sub || gr.dir, n.detail ?? "", gr.files, leaves, i), files: gr.files };
      });
    } else kids = ordered(c.files).map((p, i) => ({ node: leaf(p, i), files: [p] }));
    return level(id, a.title || id, a.sub || c.dir, a.responsibility ?? "", c.files, kids, row);
  });

  // The top level: a box per component, arrows only where the graph has calls.
  const labels = new Map<string, string>();
  for (const x of synth.arrows ?? []) {
    const edge = mod.find((e) => e.from === x.from && e.to === x.to && e.calls);
    if (edge) labels.set(`${x.from}\n${x.to}`, x.label);
    else discrepancies.push(`synthesize labelled ${x.from} → ${x.to}, a link the graph does not have`);
  }
  const top = diagram(
    "How the parts connect",
    AUTHORED.map((n) => ({ node: n, files: byId.get(n.id)!.files })),
    "bx-",
    (a, b) => labels.get(`${a.id}\n${b.id}`),
  );
  const OVERVIEW = {
    sub: short(synth.sub ?? inv.name, 60),
    detail: synth.detail ?? "",
    state: "derived",
    // Where the code starts, a range each.
    code: entries.slice(0, 3).map((p) => leafCode(p, lines.get(p) ?? 1, sums[p])[0]),
    anatomy: [top],
  } as unknown as Overview;

  const map: MapFile = { RUN: { ...run, explain: "none" } as MapFile["RUN"], OVERVIEW, AUTHORED };
  const checkProblems = await lap("check", () => check(map, inv.repo, { generated: true }).problems);

  const arch: FastResult["arch"] = {
    files: Object.fromEntries(
      inv.files
        .filter(isSource)
        .map((f) => [f.path, { component: owner.get(f.path)?.id ?? "", lines: f.lines, symbols: g.defs.filter((d) => d.file === f.path && !d.parent).map((d) => ({ name: d.name, kind: d.kind, line: d.start })), imports: inv.imports[f.path] ?? [] }]),
    ),
    components: comps,
    module_graph: mod,
    entrypoints: entries,
    external_deps: inv.deps,
  };
  return { map, arch, discrepancies, checkProblems, timing };
}
