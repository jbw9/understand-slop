/**
 * Stage 3 — one agent per root writes that root's whole subtree.
 *
 * It reads the code itself (numbered lines, grep, directory listings) and
 * hands in the finished node through `submit`, which runs the same checks the
 * map is held to. Problems come back as the tool's answer, so the repair loop
 * is the conversation itself: the model fixes what the checker names, with
 * the code still in front of it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Node } from "@/lib/data";
import { BACKEND, invoke, callsOf, type Block, type Message, type Tool } from "./bedrock";
import { ccAgent, type Handled } from "./claude-code";
import { check } from "./check";
import type { Cut, Root } from "./cut";
import { owners } from "./cut";
import { numbered, type Inventory } from "./inventory";
import { shapeProblems, typeReference } from "./schema";
import { full, oneLine, type FileSummary } from "./summarize";

export interface Authored {
  root: Node | null;
  turns: number;
  reads: number;
  submits: number;
  /** The checker's last word when the root never came back clean. */
  problems: string[];
}

export const TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read a file from the repository with line numbers. At most 400 lines per call; read the ranges you need.",
    input_schema: { type: "object", required: ["path"], properties: { path: { type: "string" }, start: { type: "integer" }, end: { type: "integer" } } },
  },
  {
    name: "grep",
    description: "Search the repository (git grep -E, case-sensitive). Returns up to 60 matching lines as path:line:text.",
    input_schema: { type: "object", required: ["pattern"], properties: { pattern: { type: "string" }, under: { type: "string", description: "Optional directory or file to search within." } } },
  },
  {
    name: "list",
    description: "List the files under a directory with their line counts.",
    input_schema: { type: "object", required: ["dir"], properties: { dir: { type: "string" } } },
  },
  {
    name: "submit",
    description: "Hand in the complete root node, with every descendant. It is checked; if anything fails you get the list back and must submit again with everything fixed.",
    input_schema: { type: "object", required: ["root"], properties: { root: { type: "object", description: "A Node (see the types): the root and its whole subtree." } } },
  },
];

/** The explorify root used as the worked example, minus what generated maps may not use. */
function exemplar(): string {
  const map = JSON.parse(readFileSync("maps/explorify/map.json", "utf8"));
  const root = structuredClone(map.AUTHORED.find((r: any) => r.id === "check-in"));
  const strip = (n: any) => {
    if (n.shape?.kind === "figure") delete n.shape;
    for (const b of n.anatomy ?? []) if (b.kind === "screen") delete b.shot;
    (n.children ?? []).forEach(strip);
  };
  strip(root);
  return JSON.stringify(root, null, 1);
}

let systemCache: Block[] | null = null;
export function system(): Block[] {
  systemCache ??= [
    { type: "text", text: readFileSync("scripts/generate/prompts/rules.md", "utf8") },
    {
      type: "text",
      text: `# The types (lib/data.ts) — every field's comment is part of the standard\n\n${typeReference()}\n\n# A worked example: one root of a hand-authored map, at the standard to match\n\nIt was written before diagram arrows carried \`at\`; yours must. It is from a different repository — match its depth, density and honesty, not its content.\n\n${exemplar()}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  return systemCache;
}

function brief(root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string {
  const mine = inv.files.filter((f) => f.code && !f.test && owners(cut, f.path).includes(root.id));
  const mineSet = new Set(mine.map((f) => f.path));
  // Files just across the boundary: what this root imports, and what imports it.
  const near = new Set<string>();
  for (const [from, tos] of Object.entries(inv.imports))
    for (const to of tos) {
      if (mineSet.has(from) && !mineSet.has(to)) near.add(to);
      if (mineSet.has(to) && !mineSet.has(from)) near.add(from);
    }
  return [
    `# Repository: ${inv.name} @ ${inv.commit}`,
    `## README (excerpt)\n${inv.readme.slice(0, 2500) || "(none)"}`,
    ...(inv.scope ? [`## Scope\nThis map covers only part of the repository. Its reader: ${inv.scope.focus} Files outside it can still be read and cited.`] : []),
    `## The whole map's top level — ${cut.about}\n${cut.roots.map((r) => `- ${r.id}: ${r.title} — ${r.sub}`).join("\n")}`,
    `## Your root\nid: ${root.id}\ntitle: ${root.title}\nsub: ${root.sub}\nscope: ${root.why}\nEvery node id under it starts with "${root.prefix}-".`,
    `Brand marks you may use: ${inv.marks.length ? inv.marks.join(", ") : "none"}.`,
    `## Files this root owns (${mine.length}), with what each does\n${mine.map((f) => (sums[f.path] ? full(sums[f.path]) : `${f.path} (${f.lines} lines)`)).join("\n")}`,
    near.size ? `## Files just outside it that it talks to\n${[...near].sort().slice(0, 60).map((p) => (sums[p] ? oneLine(sums[p]) : p)).join("\n")}` : "",
    `## Task
Read the code you need — use the symbol line ranges above to read targeted ranges, not whole files — then submit this root with its full subtree.
Aim for 2-3 levels, 3-6 children per node, a diagram on most levels whose boxes open the children they show, and real issues where the code has them.
Budget: about 25 tool calls before you submit.`,
  ].filter(Boolean).join("\n\n");
}

/**
 * One read-only tool call. `known` is what read_file may open; `reach`, when
 * given, also bounds grep and list, so an update's agent searches only the
 * part of the repo that changed.
 */
export function runTool(call: { name: string; input: any }, inv: Inventory, known: Set<string>, reach?: string[]): string {
  const i = call.input ?? {};
  if (call.name === "read_file") {
    const path = String(i.path ?? "").replace(/^\.?\//, "");
    if (!known.has(path)) return `No such file in the repository listing: ${path}`;
    const start = Math.max(1, Number(i.start) || 1);
    const end = Math.min(start + 399, Number(i.end) || start + 399);
    const total = inv.files.find((f) => f.path === path)!.lines;
    return `${path} (lines ${start}-${Math.min(end, total)} of ${total})\n${numbered(inv.repo, path, start, end)}`;
  }
  if (call.name === "grep") {
    const args = ["-C", inv.repo, "grep", "-n", "-I", "-E", String(i.pattern ?? "")];
    if (i.under) args.push("--", String(i.under).replace(/^\.?\//, ""));
    else if (reach) args.push("--", ...reach);
    try {
      const hits = execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 << 20, stdio: ["ignore", "pipe", "pipe"] }).split("\n").filter(Boolean);
      return hits.slice(0, 60).map((h) => h.slice(0, 220)).join("\n") + (hits.length > 60 ? `\n… ${hits.length - 60} more` : "");
    } catch (e: any) {
      return e.status === 1 ? "No matches." : `grep failed: ${String(e.stderr ?? e.message).slice(0, 200)}`;
    }
  }
  if (call.name === "list") {
    const dir = String(i.dir ?? "").replace(/^\.?\//, "").replace(/\/?$/, "/");
    const hits = inv.files.filter((f) => (dir === "/" || f.path.startsWith(dir)) && (!reach || known.has(f.path)));
    return hits.slice(0, 200).map((f) => `${f.path} (${f.lines})`).join("\n") + (hits.length > 200 ? `\n… ${hits.length - 200} more` : "") || "Nothing there.";
  }
  return `Unknown tool ${call.name}`;
}

/** The last block of the last message carries the cache mark, so each turn re-reads the conversation from cache. */
function withCacheMark(messages: Message[]): Message[] {
  const out = messages.map((m) => ({ ...m, content: typeof m.content === "string" ? [{ type: "text", text: m.content } as Block] : m.content.map((b) => ({ ...b })) }));
  const last = out[out.length - 1].content as any[];
  last[last.length - 1].cache_control = { type: "ephemeral" };
  return out;
}

export async function authorRoot(
  root: Root,
  cut: Cut,
  inv: Inventory,
  sums: Record<string, FileSummary>,
  model: string,
  log: (s: string) => void,
): Promise<Authored> {
  const known = new Set(inv.files.map((f) => f.path));
  const res: Authored = { root: null, turns: 0, reads: 0, submits: 0, problems: [] };
  const MAX_TURNS = 45;

  /** One tool call, answered the same way whichever backend made it. */
  const handle = (name: string, input: any): Handled => {
    if (name !== "submit") {
      res.reads++;
      return { content: runTool({ name, input }, inv, known) };
    }
    res.submits++;
    const node = input?.root;
    if (node && typeof node === "object" && node.id !== root.id) node.id = root.id;
    const problems = shapeProblems(node, root.prefix);
    if (!problems.length) problems.push(...check({ AUTHORED: [node], E0: [], LINKS: [] }, inv.repo, { generated: true }).problems);
    res.problems = problems;
    log(`${root.id}: submit ${res.submits} — ${problems.length ? `${problems.length} problems` : "clean"}`);
    if (!problems.length) return { content: "Accepted. This root is done; stop now.", done: { node, reads: res.reads, submits: res.submits } };
    return { content: `Not accepted. Fix every one of these and submit the whole root again:\n- ${problems.slice(0, 80).join("\n- ")}`, isError: true };
  };

  const r = await converse<{ node: Node; reads: number; submits: number }>(brief(root, cut, inv, sums), handle, model, "author", MAX_TURNS);
  // A replayed run calls no tools, so its counts come from the cache.
  return { ...res, root: r.value?.node ?? null, turns: r.turns, reads: r.value?.reads ?? res.reads, submits: r.value?.submits ?? res.submits };
}

/**
 * One agent over TOOLS, on either backend, until `handle` hands back a
 * `done`: that is the value. Null when the turns ran out first.
 */
export async function converse<T>(
  prompt: string,
  handle: (name: string, input: any) => Handled,
  model: string,
  stage: string,
  maxTurns: number,
): Promise<{ value: T | null; turns: number }> {
  if (BACKEND === "claude-code") {
    return ccAgent<T>({
      model, system: system(), prompt, tools: TOOLS, handle, effort: "high", stage,
      maxTurns, nudge: "Continue: use the tools, and finish by calling submit.",
    });
  }

  const messages: Message[] = [{ role: "user", content: prompt }];
  let turns = 0;
  for (; turns < maxTurns; turns++) {
    const r = await invoke({ model, stage, effort: "high", maxTokens: 64000, system: system(), messages: withCacheMark(messages), tools: TOOLS });
    messages.push({ role: "assistant", content: r.content });
    const calls = callsOf(r);
    if (!calls.length) {
      messages.push({ role: "user", content: r.stop_reason === "max_tokens" ? "Your reply was cut off at the token limit. Submit again; keep labels short." : "Continue: use the tools, and finish by calling submit." });
      continue;
    }
    const results: Block[] = [];
    for (const c of calls) {
      const h = handle(c.name, c.input);
      if (h.done) return { value: h.done as T, turns };
      // Key order as before, so the requests of maps already made still replay from cache.
      results.push(h.isError ? { type: "tool_result", tool_use_id: c.id, is_error: true, content: h.content } : { type: "tool_result", tool_use_id: c.id, content: h.content });
    }
    if (turns === maxTurns - 6) results.push({ type: "text", text: "You are almost out of turns. Submit the complete root now." });
    messages.push({ role: "user", content: results });
  }
  return { value: null, turns };
}
