/**
 * The fact graph (graph.ts) as tools an agent calls instead of grepping for
 * structure: find a definition, outline a file, list who calls something and
 * what it calls, trace a path between two things, and list where the code
 * starts. Every answer names file:line, so the agent reads only what it then
 * needs to explain. Edges say whether the source states them (extracted) or
 * the graph resolved them by name (inferred).
 */
import type { Tool } from "./bedrock";
import { unparsedSource, type Def, type Edge, type Graph } from "./graph";

export const GRAPH_TOOLS: Tool[] = [
  {
    name: "graph_find",
    description: "Find functions, methods and classes by name (or part of one, or Class.method). Returns each one's id, kind, file:lines and how many callers and callees it has. Start here to get ids for the other graph tools.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  },
  {
    name: "graph_show",
    description: "One function, method or class in full: its signature and decorators as written, its doc comment, what it does, its line range, what it sits in and what sits in it, and who calls it and what it calls. This is how you read code: there is no other way to see it.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string", description: "An id from another graph tool, a Class.method, or a name only one thing has." } } },
  },
  {
    name: "graph_links",
    description: "Every call and inheritance from one part of the code into another, each with the line it happens on: what to draw as arrows between two boxes. Each side is a list of file paths, directories (ending in /) or ids.",
    input_schema: { type: "object", required: ["from", "to"], properties: { from: { type: "array", items: { type: "string" } }, to: { type: "array", items: { type: "string" } } } },
  },
  {
    name: "graph_file",
    description: "Outline one file: what it is for, every function, method and class in it with line ranges and what each does, then which files it uses and which files use it. For a file the graph cannot parse (an Astro, Vue or Svelte file, or a language it has no grammar for) it shows the file's numbered lines instead, so you can cite one.",
    input_schema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  },
  {
    name: "graph_callers",
    description: "Who calls or inherits from a function, method or class (an id, or a name if only one thing has it), with the file:line of each call. For a file path: which files import it.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  },
  {
    name: "graph_callees",
    description: "What a function, method or class calls or inherits from, with the file:line of each call. For a file path: what code at its top level calls, and which files it imports.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  },
  {
    name: "graph_path",
    description: "The shortest chain of calls (and inheritance) from one thing to another, each hop with the line it happens on. Use it to trace a flow or to check that A really reaches B.",
    input_schema: { type: "object", required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
  },
  {
    name: "graph_entrypoints",
    description: "Where the code starts: files no other file imports, and functions nothing in the repository calls but that call others (often handlers a framework calls, such as routes, commands or event handlers).",
    input_schema: { type: "object", properties: {} },
  },
];

interface Index {
  byId: Map<string, Def>;
  out: Map<string, Edge[]>;
  in: Map<string, Edge[]>;
  files: Set<string>;
}
const indexes = new WeakMap<Graph, Index>();
function index(g: Graph): Index {
  let ix = indexes.get(g);
  if (ix) return ix;
  ix = { byId: new Map(g.defs.map((d) => [d.id, d])), out: new Map(), in: new Map(), files: new Set(g.defs.map((d) => d.file)) };
  for (const e of g.edges) {
    ix.out.set(e.from, [...(ix.out.get(e.from) ?? []), e]);
    ix.in.set(e.to, [...(ix.in.get(e.to) ?? []), e]);
    if (e.kind === "imports") ix.files.add(e.from).add(e.to);
    // A link found by name in a file with no grammar starts or ends at the file itself.
    for (const end of [e.from, e.to]) if (!ix.byId.has(end)) ix.files.add(end);
  }
  indexes.set(g, ix);
  return ix;
}

const qual = (d: Def) => d.id.slice(d.id.indexOf("#") + 1).replace(/@\d+$/, "");
const fileOf = (ix: Index, id: string) => ix.byId.get(id)?.file ?? id;
const label = (ix: Index, id: string) => {
  const d = ix.byId.get(id);
  return d ? `${qual(d)} (${d.kind}, ${d.file}:${d.start}-${d.end})` : `${id} (file)`;
};
const lines = (ix: Index, e: Edge) => (e.lines.length ? `${fileOf(ix, e.from)}:${e.lines.slice(0, 4).join(",")}${e.lines.length > 4 ? ",…" : ""}` : "");

/** An id, a file path, a Class.method or a bare name; several matches are listed for the agent to pick from. */
function resolveName(g: Graph, ix: Index, raw: string): { id: string } | { error: string } {
  // `file::name`, `file:name` and `file.name` are how agents guess an id; the graph writes `file#name`.
  const trimmed = raw.trim().replace(/^\.?\//, "");
  const guess = /^(.+\.\w+)(?:::|:(?!\d)|#)(.+)$/.exec(trimmed);
  const s = guess && ix.files.has(guess[1]) ? `${guess[1]}#${guess[2]}` : trimmed;
  if (ix.byId.has(s) || ix.files.has(s)) return { id: s };
  const hits = g.defs.filter((d) => qual(d) === s || d.name === s || qual(d).endsWith(`.${s}`));
  if (hits.length === 1) return { id: hits[0].id };
  if (!hits.length) {
    const file = [...ix.files].filter((f) => f.endsWith(s));
    if (file.length === 1) return { id: file[0] };
    return { error: `Nothing in the graph is called "${raw}". Try graph_find with part of the name. (The graph holds functions, methods and classes; framework wiring such as decorators or events is not in it.)` };
  }
  return { error: `"${raw}" is ${hits.length} things; call again with one id:\n${hits.slice(0, 20).map((d) => `  ${d.id}  ${d.kind}  ${d.file}:${d.start}-${d.end}`).join("\n")}` };
}

function find(g: Graph, ix: Index, name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) return "Give a name.";
  const hits = g.defs
    .filter((d) => qual(d).toLowerCase().includes(n))
    .sort((a, b) => Number(b.name.toLowerCase() === n) - Number(a.name.toLowerCase() === n) || (ix.in.get(b.id)?.length ?? 0) - (ix.in.get(a.id)?.length ?? 0));
  if (!hits.length) return `No function, method or class matches "${name}".`;
  return hits.slice(0, 30).map((d) => `${d.id}  ${d.kind}  ${d.file}:${d.start}-${d.end}  ← ${ix.in.get(d.id)?.length ?? 0} callers, → ${ix.out.get(d.id)?.length ?? 0} callees${d.does ? `\n    ${d.does}` : ""}`).join("\n") + (hits.length > 30 ? `\n… ${hits.length - 30} more; narrow the name` : "");
}

/** How much of a file with no grammar graph_file shows: a page or component, not a dump. */
const SOURCE_LINES = 300;

function outline(g: Graph, ix: Index, path: string): string {
  const p = path.trim().replace(/^\.?\//, "");
  const defs = g.defs.filter((d) => d.file === p);
  if (!defs.length && !ix.files.has(p) && unparsedSource(g, p) === null) return `No code file ${p} in the graph.`;
  const depth = (d: Def): number => (d.parent ? 1 + depth(ix.byId.get(d.parent)!) : 0);
  const body = defs.map((d) => `${"  ".repeat(depth(d))}${d.start}-${d.end} ${d.name} (${d.kind})${d.does ? ` — ${d.does}` : ""}`).join("\n");
  const outFiles = new Map<string, number>();
  const inFiles = new Map<string, number>();
  const mine = new Set([p, ...defs.map((d) => d.id)]);
  for (const id of mine) {
    for (const e of ix.out.get(id) ?? []) if (fileOf(ix, e.to) !== p) outFiles.set(fileOf(ix, e.to), (outFiles.get(fileOf(ix, e.to)) ?? 0) + 1);
    for (const e of ix.in.get(id) ?? []) if (fileOf(ix, e.from) !== p) inFiles.set(fileOf(ix, e.from), (inFiles.get(fileOf(ix, e.from)) ?? 0) + 1);
  }
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, n]) => `  ${f} (${n})`).join("\n") || "  nothing";
  // No grammar read it, so its lines are the outline: the only way to see where it uses what.
  const src = unparsedSource(g, p);
  const shown = src && src.split("\n").slice(0, SOURCE_LINES);
  const text = shown ? `\nThe graph cannot parse this file, so here are its lines${src!.split("\n").length > SOURCE_LINES ? ` (the first ${SOURCE_LINES})` : ""}; a link from it was found by name and is inferred:\n${shown.map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join("\n")}` : "";
  return `${p}${g.about?.[p] ? `\n${g.about[p]}` : ""}\n${body || (src ? "" : "  (no functions or classes)")}${text}\nUses:\n${list(outFiles)}\nUsed by:\n${list(inFiles)}`;
}

function neighbours(g: Graph, ix: Index, name: string, dir: "in" | "out"): string {
  const r = resolveName(g, ix, name);
  if ("error" in r) return r.error;
  const es = (dir === "in" ? ix.in : ix.out).get(r.id) ?? [];
  if (!es.length) return dir === "in" ? `Nothing in the repository calls, inherits from or imports ${label(ix, r.id)}. A framework, a test or another program may call it.` : `${label(ix, r.id)} calls nothing else in the repository.`;
  const order: Edge["kind"][] = ["inherits", "calls", "imports"];
  const shown = [...es].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.lines.length - a.lines.length).slice(0, 40);
  const head = label(ix, r.id);
  return `${head}\n${shown.map((e) => `  ${dir === "in" ? "←" : "→"} ${e.kind} ${label(ix, dir === "in" ? e.from : e.to)}${e.lines.length ? ` at ${lines(ix, e)}` : ""} [${e.how}]`).join("\n")}${es.length > 40 ? `\n  … ${es.length - 40} more` : ""}`;
}

function show(g: Graph, ix: Index, name: string): string {
  const r = resolveName(g, ix, name);
  if ("error" in r) return r.error;
  if (!ix.byId.has(r.id)) return outline(g, ix, r.id);
  const d = ix.byId.get(r.id)!;
  const kids = g.defs.filter((k) => k.parent === d.id);
  const ins = ix.in.get(d.id) ?? [];
  const outs = ix.out.get(d.id) ?? [];
  return [
    `${d.id}  ${d.kind}  ${d.file}:${d.start}-${d.end}`,
    d.head ? `\n${d.head}` : "",
    d.doc ? `\nDoc: ${d.doc}` : "",
    d.does ? `\nDoes: ${d.does}` : "",
    d.parent ? `\nIn: ${label(ix, d.parent)}` : "",
    kids.length ? `\nHolds:\n${kids.slice(0, 40).map((k) => `  ${k.start}-${k.end} ${k.name} (${k.kind})${k.does ? ` — ${k.does}` : ""}`).join("\n")}` : "",
    `\nCalled by (${ins.length}):${ins.length ? "\n" + ins.slice(0, 15).map((e) => `  ← ${e.kind} ${label(ix, e.from)}${e.lines.length ? ` at ${lines(ix, e)}` : ""} [${e.how}]`).join("\n") : " nothing in the repository"}`,
    `\nCalls (${outs.length}):${outs.length ? "\n" + outs.slice(0, 25).map((e) => `  → ${e.kind} ${label(ix, e.to)}${e.lines.length ? ` at ${lines(ix, e)}` : ""} [${e.how}]`).join("\n") : " nothing in the repository"}`,
  ].join("");
}

/** Whether a definition or file falls under a spec: its id, its file, or a directory it is in. */
const under = (ix: Index, id: string, specs: string[]) => {
  const file = fileOf(ix, id);
  return specs.some((raw) => {
    const s = raw.trim().replace(/^\.?\//, "");
    return s && (id === s || file === s || (s.endsWith("/") ? file.startsWith(s) : file.startsWith(`${s}/`)) || id.startsWith(`${s}.`) || id.startsWith(`${s}#`));
  });
};

function links(g: Graph, ix: Index, from: string[], to: string[]): string {
  if (!from.length || !to.length) return "Give both sides: files, directories ending in /, or ids.";
  const hits = g.edges.filter((e) => e.kind !== "imports" && under(ix, e.from, from) && under(ix, e.to, to) && !under(ix, e.from, to));
  if (!hits.length) {
    const imp = g.edges.filter((e) => e.kind === "imports" && under(ix, e.from, from) && under(ix, e.to, to));
    return `No call from ${from.join(", ")} into ${to.join(", ")}.${imp.length ? ` ${imp.length} import${imp.length === 1 ? "" : "s"} between them (${imp.slice(0, 5).map((e) => `${e.from} → ${e.to}`).join("; ")}), so they are linked some way the graph cannot follow: a callback, a decorator, an event or a framework. An arrow there must be marked inferred.` : " If they connect, it is through something the graph cannot see (a callback, an event, a queue, a framework, the network); an arrow there must be marked inferred."}`;
  }
  const shown = [...hits].sort((a, b) => Number(b.how === "extracted") - Number(a.how === "extracted")).slice(0, 60);
  return `${hits.length} link${hits.length === 1 ? "" : "s"}; cite one's line as the arrow's \`at\`:\n${shown.map((e) => `  ${label(ix, e.from)} —${e.kind}${e.lines.length ? ` at ${lines(ix, e)}` : ""} [${e.how}]→ ${label(ix, e.to)}`).join("\n")}${hits.length > 60 ? `\n  … ${hits.length - 60} more; narrow a side` : ""}`;
}

function path(g: Graph, ix: Index, from: string, to: string): string {
  const a = resolveName(g, ix, from);
  if ("error" in a) return a.error;
  const b = resolveName(g, ix, to);
  if ("error" in b) return b.error;
  // A file stands for the code in it: its top level and every definition.
  const starts = ix.files.has(a.id) ? [a.id, ...g.defs.filter((d) => d.file === a.id).map((d) => d.id)] : [a.id];
  const goal = (id: string) => id === b.id || (ix.files.has(b.id) && fileOf(ix, id) === b.id);
  const prev = new Map<string, Edge | null>(starts.map((s) => [s, null]));
  const queue = [...starts];
  while (queue.length) {
    const cur = queue.shift()!;
    if (goal(cur) && !starts.includes(cur)) {
      const hops: Edge[] = [];
      for (let e = prev.get(cur); e; e = prev.get(e.from)) hops.unshift(e);
      const weakest = hops.some((h) => h.how === "inferred") ? "inferred" : "extracted";
      return `${hops.length} hop${hops.length === 1 ? "" : "s"} (${weakest}):\n${label(ix, hops[0].from)}\n${hops.map((h) => `  —${h.kind}${h.lines.length ? ` at ${lines(ix, h)}` : ""} [${h.how}]→ ${label(ix, h.to)}`).join("\n")}`;
    }
    for (const e of ix.out.get(cur) ?? []) {
      if (e.kind === "imports" || prev.has(e.to)) continue;
      prev.set(e.to, e);
      queue.push(e.to);
    }
  }
  const imp = ix.files.has(fileOf(ix, a.id)) && (ix.out.get(fileOf(ix, a.id)) ?? []).some((e) => e.to === fileOf(ix, b.id));
  return `No chain of calls leads from ${label(ix, a.id)} to ${label(ix, b.id)}.${imp ? " Its file does import the other's file." : ""} The link may run through something the graph cannot see (a decorator, a callback passed as a value, an event, a queue, a framework); look in the code.`;
}

function entrypoints(g: Graph, ix: Index): string {
  const test = /(^|\/)(tests?|__tests__|specs?|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)(test_[^/]+|[^/]+_test)\.(py|go)$/;
  const roots = [...ix.files]
    .filter((f) => !test.test(f) && !(ix.in.get(f) ?? []).some((e) => e.kind === "imports"))
    .map((f) => [f, (ix.out.get(f) ?? []).filter((e) => e.kind === "imports").length] as const)
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 25);
  const fns = g.defs
    .filter((d) => (d.kind === "function" || d.kind === "method") && !test.test(d.file) && !(ix.in.get(d.id) ?? []).length)
    .map((d) => [d, (ix.out.get(d.id) ?? []).filter((e) => e.kind === "calls").length] as const)
    .filter(([, n]) => n >= 3)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 25);
  return `Files nothing imports (imports they make):\n${roots.map(([f, n]) => `  ${f} (${n})`).join("\n") || "  none"}\nFunctions nothing calls (calls they make):\n${fns.map(([d, n]) => `  ${d.id}  ${d.file}:${d.start}-${d.end} (${n})`).join("\n") || "  none"}`;
}

/** Runs one graph tool call; the answer is the text the agent reads. */
export function graphTool(g: Graph, call: { name: string; input: Record<string, unknown> | undefined }): string {
  const ix = index(g);
  const i = call.input ?? {};
  switch (call.name) {
    case "graph_find": return find(g, ix, String(i.name ?? ""));
    case "graph_file": return outline(g, ix, String(i.path ?? ""));
    case "graph_show": return show(g, ix, String(i.name ?? ""));
    case "graph_links": return links(g, ix, (Array.isArray(i.from) ? i.from : [i.from]).filter(Boolean).map(String), (Array.isArray(i.to) ? i.to : [i.to]).filter(Boolean).map(String));
    case "graph_callers": return neighbours(g, ix, String(i.name ?? ""), "in");
    case "graph_callees": return neighbours(g, ix, String(i.name ?? ""), "out");
    case "graph_path": return path(g, ix, String(i.from ?? ""), String(i.to ?? ""));
    case "graph_entrypoints": return entrypoints(g, ix);
    default: return `No tool called ${call.name}.`;
  }
}
export const isGraphTool = (name: string) => GRAPH_TOOLS.some((t) => t.name === name);

/** A definition's signature on one line, decorators kept: what a brief lists in place of its bare name. */
export function signature(d: Def, max = 160): string {
  const s = (d.head ?? "").replace(/\s+/g, " ").replace(/\s*[{:]\s*$/, "").trim();
  if (!s) return `${d.name} (${d.kind})`;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A file's definitions as a brief lists them: nested as they sit, each with its lines, signature and what it does. */
export function outlineLines(g: Graph, file: string, pad = "    "): string[] {
  const ix = index(g);
  const depth = (d: Def): number => (d.parent && ix.byId.has(d.parent) ? 1 + depth(ix.byId.get(d.parent)!) : 0);
  return g.defs.filter((d) => d.file === file).map((d) => `${pad}${"  ".repeat(depth(d))}${d.start}-${d.end} ${signature(d)}${d.does ? ` — ${d.does}` : ""}`);
}

/**
 * The calls a root's brief carries, so its author draws arrows without asking
 * graph_links for each pair: every call from one of its files into another,
 * and every call across its boundary, grouped by file pair, each with the line
 * to cite. `ownerOf` names the root that explains a file outside it.
 */
export function briefCalls(g: Graph, mine: string[], ownerOf: (file: string) => string, budget = 40_000): { inside: string; across: string } {
  const ix = index(g);
  const own = new Set(mine);
  const pairs = new Map<string, Edge[]>();
  for (const e of g.edges) {
    if (e.kind === "imports") continue;
    const a = fileOf(ix, e.from), b = fileOf(ix, e.to);
    if (a === b || (!own.has(a) && !own.has(b))) continue;
    const k = `${a}\n${b}`;
    pairs.set(k, [...(pairs.get(k) ?? []), e]);
  }
  const name = (id: string) => (ix.byId.has(id) ? qual(ix.byId.get(id)!) : "(top level)");
  const PER_PAIR = 6;
  const render = (keys: string[], tag: (a: string, b: string) => string) => {
    const out: string[] = [];
    let size = 0, cut = 0;
    for (const k of keys) {
      const [a, b] = k.split("\n");
      const es = [...pairs.get(k)!].sort((x, y) => Number(y.how === "extracted") - Number(x.how === "extracted") || y.lines.length - x.lines.length);
      const block = [`${tag(a, b)}`, ...es.slice(0, PER_PAIR).map((e) => `  ${name(e.from)} —${e.kind}→ ${name(e.to)}${e.lines.length ? ` at ${lines(ix, e)}` : ""}${e.how === "inferred" ? " [inferred]" : ""}`), ...(es.length > PER_PAIR ? [`  … ${es.length - PER_PAIR} more (graph_links)`] : [])].join("\n");
      if (size + block.length > budget) { cut++; continue; }
      out.push(block);
      size += block.length + 1;
    }
    return out.join("\n") + (cut ? `\n… ${cut} more file pairs left out for length; graph_links has them` : "");
  };
  const byCount = (ks: string[]) => ks.sort((x, y) => pairs.get(y)!.length - pairs.get(x)!.length || x.localeCompare(y));
  const keys = [...pairs.keys()];
  const insideKeys = byCount(keys.filter((k) => k.split("\n").every((f) => own.has(f))));
  const acrossKeys = byCount(keys.filter((k) => !k.split("\n").every((f) => own.has(f))));
  const who = (f: string) => (own.has(f) ? f : `${f}${ownerOf(f) ? ` (${ownerOf(f)})` : ""}`);
  return {
    inside: insideKeys.length ? render(insideKeys, (a, b) => `${a} → ${b}`) : "",
    across: acrossKeys.length ? render(acrossKeys, (a, b) => `${who(a)} → ${who(b)}`) : "",
  };
}

/** A definition named the way an author names one: its id, a Class.method, or a name only one thing has. Null when none or several match. */
export function resolveDef(g: Graph, raw: string): Def | null {
  const ix = index(g);
  const r = resolveName(g, ix, raw);
  return "id" in r ? (ix.byId.get(r.id) ?? null) : null;
}
