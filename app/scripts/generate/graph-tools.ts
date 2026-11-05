/**
 * The fact graph (graph.ts) as tools an agent calls instead of grepping for
 * structure: find a definition, outline a file, list who calls something and
 * what it calls, trace a path between two things, and list where the code
 * starts. Every answer names file:line, so the agent reads only what it then
 * needs to explain. Edges say whether the source states them (extracted) or
 * the graph resolved them by name (inferred).
 */
import type { Tool } from "./bedrock";
import type { Def, Edge, Graph } from "./graph";

export const GRAPH_TOOLS: Tool[] = [
  {
    name: "graph_find",
    description: "Find functions, methods and classes by name (or part of one, or Class.method). Returns each one's id, kind, file:lines and how many callers and callees it has. Start here to get ids for the other graph tools.",
    input_schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  },
  {
    name: "graph_file",
    description: "Outline one file: every function, method and class in it with line ranges, then which files it uses and which files use it.",
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
  const s = raw.trim().replace(/^\.?\//, "");
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
  return hits.slice(0, 30).map((d) => `${d.id}  ${d.kind}  ${d.file}:${d.start}-${d.end}  ← ${ix.in.get(d.id)?.length ?? 0} callers, → ${ix.out.get(d.id)?.length ?? 0} callees`).join("\n") + (hits.length > 30 ? `\n… ${hits.length - 30} more; narrow the name` : "");
}

function outline(g: Graph, ix: Index, path: string): string {
  const p = path.trim().replace(/^\.?\//, "");
  const defs = g.defs.filter((d) => d.file === p);
  if (!defs.length && !ix.files.has(p)) return `No code file ${p} in the graph.`;
  const depth = (d: Def): number => (d.parent ? 1 + depth(ix.byId.get(d.parent)!) : 0);
  const body = defs.map((d) => `${"  ".repeat(depth(d))}${d.start}-${d.end} ${d.name} (${d.kind})`).join("\n");
  const outFiles = new Map<string, number>();
  const inFiles = new Map<string, number>();
  const mine = new Set([p, ...defs.map((d) => d.id)]);
  for (const id of mine) {
    for (const e of ix.out.get(id) ?? []) if (fileOf(ix, e.to) !== p) outFiles.set(fileOf(ix, e.to), (outFiles.get(fileOf(ix, e.to)) ?? 0) + 1);
    for (const e of ix.in.get(id) ?? []) if (fileOf(ix, e.from) !== p) inFiles.set(fileOf(ix, e.from), (inFiles.get(fileOf(ix, e.from)) ?? 0) + 1);
  }
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, n]) => `  ${f} (${n})`).join("\n") || "  nothing";
  return `${p}\n${body || "  (no functions or classes)"}\nUses:\n${list(outFiles)}\nUsed by:\n${list(inFiles)}`;
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
    case "graph_callers": return neighbours(g, ix, String(i.name ?? ""), "in");
    case "graph_callees": return neighbours(g, ix, String(i.name ?? ""), "out");
    case "graph_path": return path(g, ix, String(i.from ?? ""), String(i.to ?? ""));
    case "graph_entrypoints": return entrypoints(g, ix);
    default: return `No tool called ${call.name}.`;
  }
}
export const isGraphTool = (name: string) => GRAPH_TOOLS.some((t) => t.name === name);
