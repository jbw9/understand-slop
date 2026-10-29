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
import type { Cut, Root } from "./cut";
import { owners } from "./cut";
import { isSource, numbered, type Inventory } from "./inventory";
import { EXPLAIN_LEVEL } from "./check";
import { submitProblems, typeReference } from "./schema";
import { fit, full, oneLine, type FileSummary } from "./summarize";

export interface Authored {
  root: Node | null;
  turns: number;
  reads: number;
  submits: number;
  /** The checker's last word when the root never came back clean. */
  problems: string[];
  /** What the agent did, in order: each read, search and submit, for the run's audit. */
  trail: Step[];
}

/** One agent action, in words: "read app/page.tsx 1-80", and what came of it. */
export interface Step {
  tool: string;
  what: string;
  result: string;
}

/** A tool call as a line of the audit: the call, and what it found. */
function stepOf(name: string, input: any, content: string, problems?: string[]): Step {
  const i = input ?? {};
  if (name === "read_file") return { tool: name, what: `${i.path}${i.start || i.end ? ` ${i.start ?? 1}-${i.end ?? "end"}` : ""}`, result: /^\d/.test(content) ? `${content.split("\n").length} lines` : content.split("\n")[0].slice(0, 120) };
  if (name === "grep") return { tool: name, what: `/${i.pattern}/${i.under ? ` under ${i.under}` : ""}`, result: content === "No matches." ? "no matches" : `${content.split("\n").length} matches` };
  if (name === "list") return { tool: name, what: String(i.dir ?? ""), result: `${content.split("\n").length} entries` };
  const fixes = i.root ? null : typeof i.replace === "string" ? tryJson(i.replace) : i.replace;
  const what = Array.isArray(fixes) ? `fixes to ${fixes.map((n: any) => n?.id).filter(Boolean).join(", ")}` : "the whole root";
  return { tool: name, what, result: problems?.length ? `rejected — ${problems.length} problems: ${problems.slice(0, 8).join("; ")}${problems.length > 8 ? "; …" : ""}` : "accepted" };
}

export const TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "Read a file from the repository with line numbers, at most 400 lines per call. A file of 400 lines or fewer: leave out start and end and read it whole, once. Ask for every read you already know you need in the same turn.",
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
    description: "Hand in the complete root node, with every descendant. It is checked — every detail at most two sentences and 40 words — and if anything fails you get the list back. Then send `replace` instead of `root`: only the nodes you changed.",
    input_schema: {
      type: "object",
      properties: {
        root: { type: "object", description: "A Node (see the types): the root and its whole subtree." },
        replace: { type: "array", items: { type: "object" }, description: "After a rejected submit: the fixed nodes, each replacing the node with its id in that submit. A node without `children` keeps the children it had." },
      },
    },
  },
];

/**
 * The worked example: one root of the hand-authored explorify map, kept as a
 * prompt file now that the example maps are gone. It was cut from that map
 * with figures and screenshots stripped, which generated maps may not use.
 */
function exemplar(): string {
  const text = readFileSync("scripts/generate/prompts/exemplar.json", "utf8").trimEnd();
  if (EXPLAIN_LEVEL === "full") return text;
  // At a lesser level the example's explainers would teach the wrong length:
  // brief keeps each one's first sentence, none drops them.
  const cut = (n: any): any => {
    const { explain, children, ...rest } = n;
    const first = explain?.body?.split(/(?<=[.!?])\s+/)[0];
    return { ...rest, ...(EXPLAIN_LEVEL === "brief" && first ? { explain: { body: first } } : {}), ...(children ? { children: children.map(cut) } : {}) };
  };
  return JSON.stringify(cut(JSON.parse(text)), null, 2);
}

/** The rules at the map's explain level (D70): the plain-words section as written, shortened, or gone. */
const BRIEF_RULES = `## The plain-words layer: \`explain\`

The reader of this map knows the field; what they lack is this project. Every node has a short \`explain\`, shown under an Explain toggle:

- \`body\`: one or two sentences, at most 60 words: what this part is for in this project, naming any word the project uses in its own sense ("a *job* here is one queued email, not a cron task"). Don't restate \`detail\`, and don't explain the field.
- No \`blocks\`.

`;
function rules(): string {
  const all = readFileSync("scripts/generate/prompts/rules.md", "utf8");
  if (EXPLAIN_LEVEL === "full") return all;
  const from = all.indexOf("## The plain-words layer");
  const to = all.indexOf("## ", from + 3);
  return all.slice(0, from) + (EXPLAIN_LEVEL === "brief" ? BRIEF_RULES : "") + all.slice(to);
}

let systemCache: Block[] | null = null;
export function system(): Block[] {
  systemCache ??= [
    { type: "text", text: rules() },
    {
      type: "text",
      text: `# The types (lib/data.ts) — every field's comment is part of the standard\n\n${typeReference()}\n\n# A worked example: one root of a hand-authored map, at the standard to match\n\nIt passes every check yours will. It is from a different repository — match its depth, density and honesty, not its content.\n\n${exemplar()}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  return systemCache;
}

/**
 * How much of the brief a root's own files may take, in characters (about 30k
 * tokens). The brief is re-sent on every turn of the author's conversation, so
 * a root owning hundreds of files is folded by directory (fit): the author
 * still sees all of it, and lists or reads a folded directory to go further.
 */
const OWNED_BUDGET = 110_000;

function brief(root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string {
  const mine = inv.files.filter((f) => isSource(f) && owners(cut, f.path).includes(root.id));
  const mineSet = new Set(mine.map((f) => f.path));
  // Files just across the boundary: what this root imports, and what imports it.
  const near = new Set<string>();
  for (const [from, tos] of Object.entries(inv.imports))
    for (const to of tos) {
      if (mineSet.has(from) && !mineSet.has(to)) near.add(to);
      if (mineSet.has(to) && !mineSet.has(from)) near.add(from);
    }
  return [
    `# Repository: ${inv.name} @ ${inv.commit}${inv.dirty.length ? ` (with uncommitted edits to ${inv.dirty.length} files, which you read as they are on disk)` : ""}`,
    `## README (excerpt)\n${inv.readme.slice(0, 2500) || "(none)"}`,
    ...(inv.instructions ? [`## What the repository tells coding agents\nIts own conventions and rules (AGENTS.md, CLAUDE.md). They say what its parts are meant to be; where the code departs from them, that is worth an issue.\n\n${inv.instructions}`] : []),
    ...(inv.docs.length ? [`## Its docs (${inv.docs.length}): path, lines, first heading\n${inv.docs.slice(0, 80).map((d) => `${d.path} (${d.lines})${d.title ? ` — ${d.title}` : ""}`).join("\n")}`] : []),
    ...(inv.scope ? [`## Scope\nThis map covers only part of the repository. Its reader: ${inv.scope.focus} Files outside it can still be read and cited.`] : []),
    `## The whole map's top level — ${cut.about}\n${cut.roots.map((r) => `- ${r.id}: ${r.title} — ${r.sub}`).join("\n")}`,
    `## Your root\nid: ${root.id}\ntitle: ${root.title}\nsub: ${root.sub}\nscope: ${root.why}\nEvery node id under it starts with "${root.prefix}-".`,
    `Brand marks you may use: ${inv.marks.length ? inv.marks.join(", ") : "none"}.`,
    `Screens: ${
      inv.device === "phone"
        ? "this is a mobile app, so every screen block is device \"phone\"."
        : inv.device === "web"
          ? "no mobile framework is in its dependencies, so every screen block is device \"web\", with the route it is at."
          : "it has both a mobile app and a web one — give each screen block the device of the code it is read from."
    }`,
    ((owned) =>
      `## Files this root owns (${mine.length}), with what each does${owned.folded ? "\nToo many to list one by one, so the deepest directories are folded into a line each (`dir/ (N files …)`); list or grep a folded directory to see its files." : ""}\n${owned.text}`)(
      fit(mine, sums, (f) => (sums[f.path] ? full(sums[f.path]) : `${f.path} (${f.lines} lines)`), OWNED_BUDGET),
    ),
    near.size ? `## Files just outside it that it talks to\n${[...near].sort().slice(0, 60).map((p) => (sums[p] ? oneLine(sums[p]) : p)).join("\n")}` : "",
    `## Task
Read the code you need, then submit this root with its full subtree. Every turn re-sends the whole conversation, so read in few turns: ask for all the reads you already know you need at once, read a file of 400 lines or fewer whole and once, and use the symbol line ranges above only for longer files.
Every level with parts has a diagram whose boxes open each of them; every leaf is one piece of code with its own lines, and each step of a leaf's flow or sequence cites the lines it happens on in \`at\`. ${{ full: "Every level also has an `explain` for a reader new to the project and its field. ", brief: "Every level also has a one- or two-sentence `explain` for a reader who knows the field but not this project. ", none: "" }[EXPLAIN_LEVEL]}Aim for 2-3 levels, 3-6 children per node, and real issues where the code has them.
${inv.docs.length ? "Where a doc above explains why this root's parts are built as they are (a design note, a recorded decision), grep or read the passage and cite it in `docs` on the node it explains: the passage's own lines, labelled with what it says. Cite docs only where they bear on the node; most nodes have none.\n" : ""}
Budget: about 25 tool calls before you submit. Before you submit, count each detail: two sentences and 40 words at most.`,
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
    const args = ["-C", inv.repo, "grep", "-n", "-I", "-E", "-e", String(i.pattern ?? "")];
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

const tryJson = (s: string) => {
  try { return JSON.parse(s); } catch { return null; }
};

/** `tree` with each fix put in place of the node with its id; ids with no such node go to `missing`. */
export function patched(tree: Node, fixes: Node[], missing: string[]): Node {
  const out = structuredClone(tree);
  const swap = (n: Node, fix: Node): boolean => {
    const kids = n.children ?? [];
    const i = kids.findIndex((k) => k.id === fix.id);
    if (i >= 0) {
      kids[i] = { ...fix, children: fix.children ?? kids[i].children };
      return true;
    }
    return kids.some((k) => swap(k, fix));
  };
  for (const fix of fixes) {
    if (!fix || typeof fix !== "object" || !fix.id) continue;
    if (fix.id === out.id) Object.assign(out, { ...fix, children: fix.children ?? out.children });
    else if (!swap(out, fix)) missing.push(String(fix.id));
  }
  return out;
}

/** The last block of the last message carries the cache mark, so each turn re-reads the conversation from cache. */
function withCacheMark(messages: Message[]): Message[] {
  const out = messages.map((m) => ({ ...m, content: typeof m.content === "string" ? [{ type: "text", text: m.content } as Block] : m.content.map((b) => ({ ...b })) }));
  const last = out[out.length - 1].content as any[];
  last[last.length - 1].cache_control = { type: "ephemeral" };
  return out;
}

/**
 * `onSubmit` hears each submit's verdict as it comes, with the tree handed
 * in, so the run's progress can show the draft while it is being checked.
 */
export async function authorRoot(
  root: Root,
  cut: Cut,
  inv: Inventory,
  sums: Record<string, FileSummary>,
  model: string,
  onSubmit: (submit: number, problems: number, draft: unknown) => void,
): Promise<Authored> {
  const known = new Set(inv.files.map((f) => f.path));
  const res: Authored = { root: null, turns: 0, reads: 0, submits: 0, problems: [], trail: [] };
  // The last tree handed in, so a fix after a rejection resends only the nodes it changed.
  let last: Node | null = null;

  /** One tool call, answered the same way whichever backend made it. */
  const handle = (name: string, input: any): Handled => {
    if (name !== "submit") {
      res.reads++;
      const content = runTool({ name, input }, inv, known);
      res.trail.push(stepOf(name, input, content));
      return { content };
    }
    res.submits++;
    const fixes = typeof input?.replace === "string" ? tryJson(input.replace) : input?.replace;
    const missing: string[] = [];
    const node = Array.isArray(fixes) && last && !input?.root ? patched(last, fixes, missing) : input?.root;
    if (node && typeof node === "object" && node.id !== root.id) node.id = root.id;
    if (node && typeof node === "object") last = structuredClone(node);
    const problems = missing.length
      ? missing.map((id) => `REPLACE no node "${id}" in your last submit — send it with its parent, or send the whole root`)
      : submitProblems(node, root.prefix, inv.repo);
    res.problems = problems;
    res.trail.push(stepOf(name, input, "", problems));
    onSubmit(res.submits, problems.length, node);
    // The whole result rides on `done`: Claude Code caches it, and a replay calls no tools.
    if (!problems.length) return { content: "Accepted. This root is done; stop now.", done: { ...res, root: node } };
    return { content: `Not accepted. Fix every one of these, then submit with \`replace\`: only the nodes you changed.\n- ${problems.slice(0, 80).join("\n- ")}`, isError: true };
  };

  const r = await converse<Authored>({ prompt: brief(root, cut, inv, sums), handle, model, stage: "author", maxTurns: 45 });
  return { ...(r.value ?? res), turns: r.turns };
}

/** How an agent runs, beyond its prompt and tools. The defaults are the author's. */
interface Agent {
  prompt: string;
  handle: (name: string, input: any) => Handled;
  model: string;
  stage: string;
  maxTurns: number;
  system?: string | Block[];
  tools?: Tool[];
  /** Through Claude Code, which gives Opus thinking no budget (see claude-code.ts). */
  ccEffort?: "low" | "medium" | "high";
  nudge?: string;
}

/**
 * One agent, on either backend, until `handle` hands back a `done`: that is
 * the value. Null when the turns ran out first. The API loop below is the
 * author's and the updater's only; its requests are what their caches replay,
 * so it stays as it was.
 */
export async function converse<T>(a: Agent): Promise<{ value: T | null; turns: number }> {
  const nudge = a.nudge ?? "Continue: use the tools, and finish by calling submit.";
  if (BACKEND === "claude-code") {
    // Medium, not the API path's high: at high one root thought for 32k
    // tokens in a reply. Medium halved that root's time (1118s to 614s) with a map as full.
    return ccAgent<T>({ model: a.model, system: a.system ?? system(), prompt: a.prompt, tools: a.tools ?? TOOLS, handle: a.handle, effort: a.ccEffort ?? "medium", stage: a.stage, maxTurns: a.maxTurns, nudge });
  }

  const messages: Message[] = [{ role: "user", content: a.prompt }];
  let turns = 0;
  for (; turns < a.maxTurns; turns++) {
    const r = await invoke({ model: a.model, stage: a.stage, effort: "high", maxTokens: 64000, system: system(), messages: withCacheMark(messages), tools: TOOLS });
    messages.push({ role: "assistant", content: r.content });
    const calls = callsOf(r);
    if (!calls.length) {
      messages.push({ role: "user", content: r.stop_reason === "max_tokens" ? "Your reply was cut off at the token limit. Submit again; keep labels short." : nudge });
      continue;
    }
    const results: Block[] = [];
    for (const c of calls) {
      const h = a.handle(c.name, c.input);
      if (h.done) return { value: h.done as T, turns };
      // Key order as before, so the requests of maps already made still replay from cache.
      results.push(h.isError ? { type: "tool_result", tool_use_id: c.id, is_error: true, content: h.content } : { type: "tool_result", tool_use_id: c.id, content: h.content });
    }
    if (turns === a.maxTurns - 6) results.push({ type: "text", text: "You are almost out of turns. Submit the complete root now." });
    messages.push({ role: "user", content: results });
  }
  return { value: null, turns };
}
