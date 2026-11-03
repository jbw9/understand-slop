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
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { citations, required, symbolsOf, TRIVIAL_LINES, type Sym } from "@/lib/coverage";
import type { Node } from "@/lib/data";
import { BACKEND, invoke, callsOf, type Block, type Message, type Tool } from "./bedrock";
import { ccAgent, type Handled } from "./claude-code";
import type { Cut, Root } from "./cut";
import { cutRepo, excludedBy, owners, place, unclaimed } from "./cut";
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
  /** Required symbols of the files this root explains, and those still unexplained when it was accepted. */
  coverage?: { symbols: number; gaps: { file: string; symbol: Sym }[] };
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
    description: "Read a file from the repository with line numbers, at most 400 lines per call. Any text file on disk can be read, including installed dependencies (node_modules, site-packages) and config (.github, .yml, .toml). A file of 400 lines or fewer: leave out start and end and read it whole, once. Ask for every read you already know you need in the same turn.",
    input_schema: { type: "object", required: ["path"], properties: { path: { type: "string" }, start: { type: "integer" }, end: { type: "integer" } } },
  },
  {
    name: "grep",
    description: "Search the repository (git grep -E, case-sensitive). Returns up to 60 matching lines as path:line:text. With `under`, it also searches ignored files there, such as a dependency in node_modules.",
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
  // detailed keeps each one's first paragraph and picture, brief its first
  // sentence, minimal that sentence only if it is one line, none drops them.
  const cut = (n: any): any => {
    const { explain, children, ...rest } = n;
    const first = explain?.body?.split(/(?<=[.!?])\s+/)[0];
    const kept =
      EXPLAIN_LEVEL === "detailed" && explain
        ? { body: explain.body.split(/\n\s*\n/)[0], ...(explain.blocks?.length ? { blocks: explain.blocks.slice(0, 1) } : {}) }
        : first && (EXPLAIN_LEVEL === "brief" || (EXPLAIN_LEVEL === "minimal" && first.split(/\s+/).length <= 30))
          ? { body: first }
          : undefined;
    return { ...rest, ...(kept ? { explain: kept } : {}), ...(children ? { children: children.map(cut) } : {}) };
  };
  return JSON.stringify(cut(JSON.parse(text)), null, 2);
}

/** The rules at the map's explain level (D70): the plain-words section as written, rewritten shorter, or gone. */
const BRIEF_RULES = `## The plain-words layer: \`explain\`

The reader of this map knows the field; what they lack is this project. Every node has a short \`explain\`, shown under an Explain toggle:

- \`body\`: one or two sentences, at most 60 words: what this part is for in this project, naming any word the project uses in its own sense ("a *job* here is one queued email, not a cron task"). Don't restate \`detail\`, and don't explain the field.
- No \`blocks\`.

`;
const MINIMAL_RULES = `## The plain-words layer: \`explain\`

The reader of this map knows the field and has used this project; what they lack is its vocabulary. Every node has a one-line \`explain\`, shown under an Explain toggle:

- \`body\`: one sentence, at most 30 words: what this project means by this part where the title alone would not say ("a *job* here is one queued email, not a cron task"). Don't restate \`detail\`, and don't explain the field.
- No \`blocks\`.

`;
const DETAILED_RULES = `## The plain-words layer: \`explain\`

The reader of this map knows a little of the field and nothing of this project. Every node has an \`explain\`, shown under an Explain toggle:

- \`body\`: one or two short paragraphs, a blank line between them, at most 120 words (a leaf's is often 20–60).
  - Start from what this part is for, then how it works, in everyday words.
  - Define each word of the project or its field the first time it appears, in the sentence that uses it. Don't assume the parent's explainer was read.
  - Don't restate \`detail\`; say what someone needs before \`detail\` makes sense.
- \`blocks\`: at most one picture, only where it shows what the prose cannot — usually a \`diagram\` of how things relate, its boxes opening nothing and its arrows needing no \`at\`. Most leaves need none; a leaf's explain picture is never the same kind as one of its own blocks.

`;
function rules(): string {
  const all = readFileSync("scripts/generate/prompts/rules.md", "utf8");
  if (EXPLAIN_LEVEL === "full") return all;
  const from = all.indexOf("## The plain-words layer");
  const to = all.indexOf("## ", from + 3);
  return all.slice(0, from) + { none: "", minimal: MINIMAL_RULES, brief: BRIEF_RULES, detailed: DETAILED_RULES }[EXPLAIN_LEVEL] + all.slice(to);
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

/** The files whose symbols this root must explain: source it owns first, so a shared file is held to one root. */
const explains = (root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>) =>
  inv.files.filter((f) => isSource(f) && sums[f.path] && !excludedBy(cut, f.path) && owners(cut, f.path)[0] === root.id);

/**
 * The shortest symbol a root must explain. On a large repository holding
 * every symbol over TRIVIAL_LINES to a leaf made coverage rounds, and trees,
 * grow with the code; there only the sizeable ones are required.
 * SLOP_COVER_LINES overrides.
 */
const LARGE_REPO = 400;
export const coverLines = (inv: Inventory) =>
  Number(process.env.SLOP_COVER_LINES) || (inv.files.filter(isSource).length > LARGE_REPO ? 20 : TRIVIAL_LINES);
const needs = (inv: Inventory) => {
  const min = coverLines(inv);
  return (s: Sym) => required(s) && s.end - s.start + 1 > min;
};

/** At most this many rounds are spent on coverage alone; what is left is recorded, not hidden. */
const COVER_ROUNDS = 2;

/** A root's own source files, and those just across its boundary: what it imports, and what imports it. */
function neighbourhood(root: Root, cut: Cut, inv: Inventory) {
  const mine = inv.files.filter((f) => isSource(f) && owners(cut, f.path).includes(root.id));
  const mineSet = new Set(mine.map((f) => f.path));
  const near = new Set<string>();
  for (const [from, tos] of Object.entries(inv.imports))
    for (const to of tos) {
      if (mineSet.has(from) && !mineSet.has(to)) near.add(to);
      if (mineSet.has(to) && !mineSet.has(from)) near.add(from);
    }
  return { mine, near };
}

/**
 * What a root's authoring depends on beyond its brief: the content of the
 * files it owns and of those it talks to. The brief names no commit, so a
 * commit that leaves these alone replays the root from cache.
 */
function contentKey(root: Root, cut: Cut, inv: Inventory): string {
  const { mine, near } = neighbourhood(root, cut, inv);
  const hash = new Map(inv.files.map((f) => [f.path, f.hash]));
  const lines = [...mine.map((f) => f.path), ...near].sort().map((p) => `${p} ${hash.get(p) ?? "-"}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

function brief(root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string {
  const { mine, near } = neighbourhood(root, cut, inv);
  return [
    `# Repository: ${inv.name}`,
    `## README (excerpt)\n${inv.readme.slice(0, 2500) || "(none)"}`,
    ...(inv.instructions ? [`## What the repository tells coding agents\nIts own conventions and rules (AGENTS.md, CLAUDE.md). They say what its parts are meant to be; where the code departs from them, that is worth an issue.\n\n${inv.instructions}`] : []),
    ...(inv.docs.length ? [`## Its docs (${inv.docs.length}): path, lines, first heading\n${inv.docs.slice(0, 80).map((d) => `${d.path} (${d.lines})${d.title ? ` — ${d.title}` : ""}`).join("\n")}`] : []),
    ...(inv.scope ? [`## Scope\nThis map covers only part of the repository. Its reader: ${inv.scope.focus} Files outside it can still be read and cited.`] : []),
    `## The whole map's top level — ${cut.about}\n${cut.roots.map((r) => `- ${r.id}: ${r.title} — ${r.sub}`).join("\n")}`,
    `Code another root explains is not unknown: read it if you need it, and draw it as a box with no \`opens\` labelled with that root's title. Never mark a node unsure because something lies outside your root.`,
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
Every level with parts has a diagram whose boxes open each of them; every leaf is one piece of code with its own lines, and each step of a leaf's flow or sequence cites the lines it happens on in \`at\`. ${{ full: "Every level also has an `explain` for a reader new to the project and its field. ", detailed: "Every level also has a one- or two-paragraph `explain` for a reader who knows a little of the field and none of this project. ", brief: "Every level also has a one- or two-sentence `explain` for a reader who knows the field but not this project. ", minimal: "Every level also has a one-sentence `explain` for a reader who knows the field and has used this project. ", none: "" }[EXPLAIN_LEVEL]}Aim for 2-3 levels, 3-6 children per node, and real issues where the code has them.
Cover the code: every symbol listed above of more than ${coverLines(inv)} lines, in a file whose first owner is this root, must be opened by a leaf's \`code\` or a step's \`at\`. A few small related ones may share a leaf; a part with more pieces than fit gets another level, not a summary.
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
    const listed = known.has(path);
    if (!listed && (reach || !unlisted(inv.repo, path))) return `No such file in the repository: ${path}`;
    const start = Math.max(1, Number(i.start) || 1);
    const end = Math.min(start + 399, Number(i.end) || start + 399);
    const total = listed ? inv.files.find((f) => f.path === path)!.lines : readFileSync(join(inv.repo, path), "utf8").split("\n").length;
    return `${path} (lines ${start}-${Math.min(end, total)} of ${total})\n${numbered(inv.repo, path, start, end)}`;
  }
  if (call.name === "grep") {
    const args = ["-C", inv.repo, "grep", "--untracked", "-n", "-I", "-E", "-e", String(i.pattern ?? "")];
    // Scoped to a path, grep also searches what git ignores (installed dependencies, generated files), never .env files.
    if (i.under) {
      args.splice(4, 0, "--no-exclude-standard");
      args.push("--", String(i.under).replace(/^\.?\//, ""), ":!:**/.env*");
    } else if (reach) args.push("--", ...reach);
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
    if (!hits.length && !reach) {
      const abs = resolve(inv.repo, dir);
      if (inside(inv.repo, abs) && existsSync(abs) && statSync(abs).isDirectory())
        return readdirSync(abs, { withFileTypes: true }).slice(0, 200).map((e) => `${posixPath(relative(inv.repo, join(abs, e.name)))}${e.isDirectory() ? "/" : ""}`).join("\n") || "Nothing there.";
    }
    return hits.slice(0, 200).map((f) => `${f.path} (${f.lines})`).join("\n") + (hits.length > 200 ? `\n… ${hits.length - 200} more` : "") || "Nothing there.";
  }
  return `Unknown tool ${call.name}`;
}

const posixPath = (p: string) => p.split(sep).join("/");
const inside = (repo: string, abs: string) => abs.startsWith(resolve(repo) + sep);

/**
 * Whether read_file may open a file the listing leaves out: anything in the
 * repo on disk that git ignores or the inventory skips (installed dependencies,
 * generated code, configs), so a claim settled there can be checked. Never
 * .git, .env files or binaries.
 */
function unlisted(repo: string, path: string): boolean {
  const abs = resolve(repo, path);
  if (!inside(repo, abs) || /(^|\/)\.git\//.test(path) || /(^|\/)\.env[^/]*$/.test(path)) return false;
  if (!existsSync(abs) || !statSync(abs).isFile() || statSync(abs).size > 2_000_000) return false;
  return !readFileSync(abs).includes(0);
}

const tryJson = (s: string) => {
  try { return JSON.parse(s); } catch { return null; }
};

/**
 * A fix laid over the node it fixes: fields it leaves out are kept, one set to
 * null is removed. Authors send only what they changed — replacing the node
 * whole wiped its title and sub and cost a round of "title missing" (as many
 * as 68 problems in one rejection). The tool's wording is left as it was, so
 * the API path's requests still replay from the committed maps' caches.
 */
function merged(old: Node, fix: Node): Node {
  const out: any = { ...old, ...fix, children: fix.children ?? old.children };
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  if (!out.children) delete out.children;
  return out;
}

/** `tree` with each fix merged into the node with its id; ids with no such node go to `missing`. */
export function patched(tree: Node, fixes: Node[], missing: string[]): Node {
  let out = structuredClone(tree);
  const swap = (n: Node, fix: Node): boolean => {
    const kids = n.children ?? [];
    const i = kids.findIndex((k) => k.id === fix.id);
    if (i >= 0) {
      kids[i] = merged(kids[i], fix);
      return true;
    }
    return kids.some((k) => swap(k, fix));
  };
  for (const fix of fixes) {
    if (!fix || typeof fix !== "object" || !fix.id) continue;
    if (fix.id === out.id) out = merged(out, fix);
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
  const owned = explains(root, cut, inv, sums);
  const need = needs(inv);
  let coverRounds = 0;
  const gapsIn = (node: Node) => {
    const cited = citations([node]);
    return owned.flatMap((f) => symbolsOf(cited, f.path, sums[f.path]).filter((s) => need(s) && !s.by.length).map((symbol) => ({ file: f.path, symbol })));
  };

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
    let problems = missing.length
      ? missing.map((id) => `REPLACE no node "${id}" in your last submit — send it with its parent, or send the whole root`)
      : submitProblems(node, root.prefix, inv.repo);
    // Coverage is asked only of a tree that is otherwise clean, so it never
    // competes with a problem the map cannot be shown with.
    if (!problems.length) {
      const gaps = gapsIn(node);
      res.coverage = { symbols: owned.reduce((a, f) => a + sums[f.path].symbols.filter(need).length, 0), gaps };
      if (gaps.length && coverRounds < COVER_ROUNDS) {
        coverRounds++;
        const byFile = new Map<string, typeof gaps>();
        for (const g of gaps) byFile.set(g.file, [...(byFile.get(g.file) ?? []), g]);
        problems = [...byFile].map(([file, gs]) => `COVER ${file}: ${gs.map((g) => `${g.symbol.name} (${g.symbol.start}-${g.symbol.end})`).join(", ")} — no leaf or step opens these lines; give each a leaf, or a step that cites it`);
      }
    }
    res.problems = problems;
    res.trail.push(stepOf(name, input, "", problems));
    onSubmit(res.submits, problems.length, node);
    // The whole result rides on `done`: Claude Code caches it, and a replay calls no tools.
    if (!problems.length) return { content: "Accepted. This root is done; stop now.", done: { ...res, root: node } };
    return { content: `Not accepted. Fix every one of these, then submit with \`replace\`: only the nodes you changed.\n- ${problems.slice(0, 80).join("\n- ")}`, isError: true };
  };

  const r = await converse<Authored>({ prompt: brief(root, cut, inv, sums), handle, model, stage: "author", maxTurns: 40, salt: contentKey(root, cut, inv) });
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
  /** Extra cache key through Claude Code (contentKey); the API path keys on the tool results it is sent. */
  salt?: string;
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
    return ccAgent<T>({ model: a.model, system: a.system ?? system(), prompt: a.prompt, tools: a.tools ?? TOOLS, handle: a.handle, effort: a.ccEffort ?? "medium", stage: a.stage, maxTurns: a.maxTurns, nudge, salt: a.salt });
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

/* ── large roots: cut into parts, authored in parallel, then joined ── */

/** A root owning more than this many source files, or required symbols, is split. SLOP_SPLIT_FILES / SLOP_SPLIT_SYMBOLS override. */
const SPLIT_FILES = Number(process.env.SLOP_SPLIT_FILES ?? 40);
const SPLIT_SYMBOLS = Number(process.env.SLOP_SPLIT_SYMBOLS ?? 150);

/**
 * Whether one agent should not write this root alone. One that did reached
 * 20–29 turns and 160k tokens of context, re-sent every turn, and held a
 * concurrency slot for most of the run.
 */
export function tooBig(root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): boolean {
  const owned = explains(root, cut, inv, sums);
  const need = needs(inv);
  return owned.length > SPLIT_FILES || owned.reduce((a, f) => a + sums[f.path].symbols.filter(need).length, 0) > SPLIT_SYMBOLS;
}

/** The repository as a cut of one root sees it: only that root's files are source. */
function scoped(root: Root, cut: Cut, inv: Inventory): Inventory {
  const files = inv.files.map((f) => (isSource(f) && owners(cut, f.path).includes(root.id) ? f : { ...f, code: false, outside: true }));
  return { ...inv, files, scope: { paths: root.files, focus: `${inv.scope ? `${inv.scope.focus} ` : ""}This is one part of the map, "${root.title}" (${root.sub}): ${root.why} Cut it into the 2-6 parts a reader of that part opens first.` } };
}

/** The parts' cut, its ids and prefixes put under the root's, as the briefs of its parts read it. */
function partsCut(root: Root, sub: Cut, cut: Cut): Cut {
  return {
    about: `${root.title} — ${root.sub}, one part of a map whose top level is ${cut.roots.map((r) => r.title).join(", ")}. ${sub.about}`,
    roots: sub.roots.map((p) => ({ ...p, id: `${root.prefix}-${p.id}`, prefix: `${root.prefix}-${p.prefix}`, why: `${p.why} It is one part of ${root.title}: ${root.why}` })),
    excluded: [...cut.excluded, ...sub.excluded],
  };
}

export interface Split {
  /** The parts as cut, kept between runs (like the top cut) so a re-run keeps their names. */
  cut: Cut;
  authored: Authored;
}

/**
 * A large root, written in pieces: its files cut into parts as the repository
 * is (cutRepo, scoped to them), each part written as its own subtree by
 * `authorRoot` with a brief a fraction of the size, all at once; then one
 * short agent writes the root's own level over the parts that came back.
 * `keep` is the parts' cut from a previous run.
 */
export async function authorSplit(
  root: Root,
  cut: Cut,
  inv: Inventory,
  sums: Record<string, FileSummary>,
  models: { cut: string; part: string; join: string },
  keep: Cut | null,
  on: { submit: (submit: number, problems: number, draft: unknown) => void; part: (draft: Node) => void; say: (s: string) => void },
): Promise<Split | null> {
  const inner = scoped(root, cut, inv);
  let sub: Cut;
  if (keep) {
    const added = unclaimed(keep, inner);
    sub = added.length ? (await place(keep, added, inner, sums, models.cut)).cut : keep;
  } else sub = (await cutRepo(inner, sums, models.cut)).cut;
  if (sub.roots.length < 2) return null;
  const parts = partsCut(root, sub, cut);
  on.say(`${root.id}: split into ${parts.roots.map((p) => p.id).join(", ")}`);

  const done: Record<string, Authored> = {};
  const provisional = () => {
    const children = parts.roots.flatMap((p) => (done[p.id]?.root ? [done[p.id].root!] : []));
    return { id: root.id, title: root.title, sub: root.sub, state: "partial", code: [], children } as unknown as Node;
  };
  await Promise.all(
    parts.roots.map(async (p) => {
      done[p.id] = await authorRoot(p, parts, inv, sums, models.part, () => {});
      on.say(`${p.id}: ${done[p.id].root ? "accepted" : "FAILED"} after ${done[p.id].turns + 1} turns`);
      if (done[p.id].root) on.part(provisional());
    }),
  );
  const kids = parts.roots.flatMap((p) => (done[p.id].root ? [done[p.id].root!] : []));
  const all = Object.values(done);
  const total: Authored = {
    root: null,
    turns: all.reduce((a, x) => a + x.turns, 0),
    reads: all.reduce((a, x) => a + x.reads, 0),
    submits: all.reduce((a, x) => a + x.submits, 0),
    problems: parts.roots.filter((p) => !done[p.id].root).flatMap((p) => done[p.id].problems.map((x) => `${p.id}: ${x}`)),
    trail: parts.roots.flatMap((p) => done[p.id].trail.map((t) => ({ ...t, what: `${p.id} ${t.what}` }))),
    coverage: { symbols: all.reduce((a, x) => a + (x.coverage?.symbols ?? 0), 0), gaps: all.flatMap((x) => x.coverage?.gaps ?? []) },
  };
  if (kids.length < 2) {
    total.problems.unshift(`only ${kids.length} of ${parts.roots.length} parts were accepted`);
    return { cut: sub, authored: total };
  }

  const joined = await joinParts(root, kids, inv, models.join, on.submit);
  total.turns += joined.turns;
  total.submits += joined.submits;
  if (joined.node) total.root = joined.node;
  else total.problems.unshift(...joined.problems.map((x) => `join: ${x}`));
  return { cut: sub, authored: total };
}

/** The root's own level over parts already written: its words and the diagram whose boxes open them. */
async function joinParts(root: Root, kids: Node[], inv: Inventory, model: string, onSubmit: (submit: number, problems: number, draft: unknown) => void) {
  const known = new Set(inv.files.map((f) => f.path));
  const out = { node: null as Node | null, turns: 0, submits: 0, problems: [] as string[] };
  const describe = (n: Node) => `- ${n.id}: ${n.title} — ${n.sub}\n  ${n.detail ?? ""}\n  its parts: ${(n.children ?? []).map((c) => c.title).join(", ")}`;
  const prompt = [
    `# Repository: ${inv.name}`,
    `## Your root\nid: ${root.id}\ntitle: ${root.title}\nsub: ${root.sub}\nscope: ${root.why}`,
    `## Its parts, already written and checked\nEach is a child of this root as it stands; you do not change them.\n${kids.map(describe).join("\n")}`,
    `## Task
Write this root's own level only, and submit it as \`root\` without \`children\`: they are put under it as they are. It has the fields any level with parts has: title, sub, detail, state, code (the few ranges that tie the parts together, or none), a diagram whose boxes open each part by its id (${kids.map((k) => k.id).join(", ")}) with arrows that cite the lines where one part reaches another${EXPLAIN_LEVEL === "none" ? "" : ", and an explain"}.
Read only what you need to draw those arrows. Budget: about 10 tool calls before you submit.`,
  ].join("\n\n");
  const handle = (name: string, input: any): Handled => {
    if (name !== "submit") return { content: runTool({ name, input }, inv, known) };
    out.submits++;
    const top = input?.root;
    if (!top || typeof top !== "object") return { content: "Send `root`: this root's own level, without children.", isError: true };
    const node = { ...top, id: root.id, children: structuredClone(kids) };
    // The parts were checked as they were written; what is asked of this agent is its own level.
    const problems = submitProblems(node, root.prefix, inv.repo).filter((p) => p.includes(root.id) || !kids.some((k) => p.includes(k.id)));
    out.problems = problems;
    onSubmit(out.submits, problems.length, node);
    if (!problems.length) return { content: "Accepted. This root is done; stop now.", done: node };
    return { content: `Not accepted. Fix every one of these, then submit the whole level again as \`root\`:\n- ${problems.slice(0, 60).join("\n- ")}`, isError: true };
  };
  const r = await converse<Node>({ prompt, handle, model, stage: "author-join", maxTurns: 16, salt: createHash("sha256").update(JSON.stringify(kids)).digest("hex") });
  out.turns = r.turns;
  out.node = r.value;
  return out;
}
