/**
 * Whether a map helps someone understand the code, measured: developer
 * questions with answer keys, answered by an agent that can read only the map
 * (or only the code, or both), each answer graded fact by fact. Every other
 * number in evaluate.ts is about the map's shape; this one is about the reader.
 *
 * The questions follow the kinds the developer-question research ranks
 * highest (Sillito et al., LaToza & Myers): where a behaviour lives, what a
 * change affects, which type is a concept, what happens end to end, where
 * data is written and read, where to add one more, where a rule is enforced.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { MapIndex } from "@/lib/coverage";
import { mapSearch, mapSection, mapWhere } from "@/lib/lookup";
import { buildMap, type MapFile } from "@/lib/map";
import { parseArgs } from "./args";
import { converse, runTool, TOOLS } from "./author";
import { ask, bill, cacheIn, MODELS, type Tool } from "./bedrock";
import { ccClose } from "./claude-code";
import { buildGraph, type Graph } from "./graph";
import { GRAPH_TOOLS, graphTool, isGraphTool } from "./graph-tools";
import { inventory } from "./inventory";

export interface Question {
  id: string;
  kind: "parts" | "location" | "data" | "flow" | "impact" | "term" | "extend" | "enforce";
  q: string;
  facts: string[];
  where: string[];
}
type Mode = "map" | "grep" | "both" | "graph";
type Verdict = "stated" | "partly" | "missing" | "contradicted";
interface Answer { answer: string; cites: string[] }

const MAP_TOOLS: Tool[] = [
  { name: "map_search", description: "Search the map: sections whose title or text match, and top-level symbols and files by name, each with the section that explains it and its id path.", input_schema: { type: "object", required: ["query"], properties: { query: { type: "string", description: "Words, a symbol name, or part of a path." } } } },
  { name: "map_section", description: "One section of the map: what it is, what it says, the code it cites, its parts (with id paths to go deeper) and what to watch out for. An empty name is the whole repository.", input_schema: { type: "object", required: ["name"], properties: { name: { type: "string", description: "An id path from map_search, an id, or a title." } } } },
  { name: "map_where", description: "Which sections of the map explain a file, or one line of it.", input_schema: { type: "object", required: ["file"], properties: { file: { type: "string" }, line: { type: "integer" } } } },
];
const ANSWER: Tool = {
  name: "answer",
  description: "Hand in your answer, once.",
  input_schema: {
    type: "object",
    required: ["answer", "cites"],
    properties: {
      answer: { type: "string", description: "A few plain sentences that answer the question completely, naming the functions, files, tables or types involved." },
      cites: { type: "array", items: { type: "string" }, description: "The file:start-end ranges the answer rests on." },
    },
  },
};
const CODE_TOOLS = TOOLS.filter((t) => t.name !== "submit");
const TOOLS_OF: Record<Mode, Tool[]> = { map: [...MAP_TOOLS, ANSWER], grep: [...CODE_TOOLS, ANSWER], both: [...MAP_TOOLS, ...CODE_TOOLS, ANSWER], graph: [...GRAPH_TOOLS, ...CODE_TOOLS, ANSWER] };
const SEES: Record<Mode, string> = {
  map: "Your tools read a map of the repository: a tree of sections, each explaining a part of the code and citing the lines it rests on. You cannot read the code itself.",
  grep: "Your tools read the repository's code.",
  both: "Your tools read a map of the repository (a tree of sections, each explaining a part of the code and citing its lines) and the repository's code itself.",
  graph: "Your tools read the repository's code, and a graph of it built from the code: its functions, methods and classes, and who calls, inherits from and imports whom. Use the graph to find where things are and how they connect, then read the lines you need.",
};
const SYSTEM = "You answer questions about one codebase from what your tools show, never from what similar projects usually do.";

const GRADE: Tool = {
  name: "grade",
  description: "Record a verdict for every numbered key fact.",
  input_schema: {
    type: "object",
    required: ["facts"],
    properties: {
      facts: {
        type: "array",
        items: { type: "object", required: ["n", "verdict"], properties: { n: { type: "integer" }, verdict: { type: "string", enum: ["stated", "partly", "missing", "contradicted"] } } },
      },
    },
  },
};
const POINTS: Record<Verdict, number> = { stated: 1, partly: 0.5, missing: 0, contradicted: 0 };

/** A cite lands on a key range when it names the same file and comes within a few lines of it. */
function lands(cites: string[], where: string[]): boolean {
  const span = (s: string) => {
    const m = /^(.+?):(\d+)(?:-(\d+))?$/.exec(s.trim().replace(/^\.?\//, ""));
    return m ? { file: m[1], start: Number(m[2]), end: Number(m[3] ?? m[2]) } : null;
  };
  const keys = where.map(span).filter(Boolean) as NonNullable<ReturnType<typeof span>>[];
  return cites.some((c) => {
    const s = span(c);
    return !!s && keys.some((k) => (s.file === k.file || s.file.endsWith(`/${k.file}`) || k.file.endsWith(`/${s.file}`)) && s.start <= k.end + 10 && s.end >= k.start - 10);
  });
}

async function answer(q: Question, mode: Mode, ctx: { repo: string; m: ReturnType<typeof buildMap> | null; index: MapIndex | null; inv: ReturnType<typeof inventory>; graph: Graph | null; salt: string; model: string }) {
  const known = new Set(ctx.inv.files.map((f) => f.path));
  const handle = (name: string, input: any) => {
    if (name === "answer") return { content: "Recorded. Stop now.", done: { answer: String(input?.answer ?? ""), cites: Array.isArray(input?.cites) ? input.cites.map(String) : [] } };
    if (isGraphTool(name)) return mode === "graph" && ctx.graph ? { content: graphTool(ctx.graph, { name, input }) } : { content: `No tool called ${name}.`, isError: true };
    if (!ctx.m && name.startsWith("map_")) return { content: `No tool called ${name}.`, isError: true };
    if (name === "map_search") return { content: mapSearch(ctx.m!, ctx.index, String(input?.query ?? "")) };
    if (name === "map_section") return { content: mapSection(ctx.m!, String(input?.name ?? ""), ctx.index) };
    if (name === "map_where") return { content: mapWhere(ctx.m!, ctx.index, String(input?.file ?? ""), Number(input?.line) || undefined) };
    if (mode === "map") return { content: `No tool called ${name}.`, isError: true };
    return { content: runTool({ name, input }, ctx.inv, known) };
  };
  const prompt = `# A question about the repository ${ctx.m?.RUN.repo ?? ctx.inv.name}\n\n${q.q}\n\nYou are a developer new to this codebase. ${SEES[mode]} Find the answer, then call \`answer\` once. If your tools don't show part of the answer, say which part instead of guessing.\nBudget: about 12 tool calls.`;
  const r = await converse<Answer>({ prompt, handle, model: ctx.model, stage: `ask-${mode}`, maxTurns: 16, system: SYSTEM, tools: TOOLS_OF[mode], ccEffort: "low", nudge: "Finish by calling answer.", salt: `${mode} ${ctx.salt}` });
  return { got: r.value ?? { answer: "(no answer: the turns ran out)", cites: [] }, turns: r.turns };
}

async function grade(q: Question, got: Answer): Promise<Verdict[]> {
  const prompt = `## Question\n${q.q}\n\n## Key facts\n${q.facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n## The answer to grade\n${got.answer}\n\nCites: ${got.cites.join(", ") || "none"}\n\nFor each key fact, say whether the answer states it (stated: a paraphrase or an equivalent name counts), states only part of it (partly), leaves it out (missing), or says something that contradicts it (contradicted). Judge only against the key; extra correct detail neither helps nor hurts.`;
  const r = await ask<{ facts: { n: number; verdict: Verdict }[] }>({ model: MODELS.sonnet, system: "You grade answers about a codebase against an answer key, strictly and fairly.", messages: [{ role: "user", content: prompt }], tool: GRADE, stage: "ask-grade", maxTokens: 2000 });
  return q.facts.map((_, i) => r.facts.find((f) => f.n === i + 1)?.verdict ?? "missing");
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function score(args: string[]) {
  const { opt, repo: dir } = parseArgs(args);
  const out = resolve(dir!);
  const qfile = args.find((a, i) => i > 0 && a.endsWith(".json") && !args[i - 1]?.startsWith("--"));
  if (!qfile) throw new Error("usage: ask.mts <map dir> <questions.json> [--repo dir] [--modes map,grep,both,graph] [--only id,id]");
  const modes = (opt("--modes") ?? "map,grep").split(",") as Mode[];
  // Only the map modes need a map: grep and graph read the checkout, and the dir just holds ask.json.
  const needsMap = modes.some((m) => m === "map" || m === "both");
  if (!needsMap) mkdirSync(out, { recursive: true });
  const file: MapFile | null = needsMap || existsSync(`${out}/map.json`) ? JSON.parse(readFileSync(`${out}/map.json`, "utf8")) : null;
  const indexPath = `${out}/index.json`;
  const index: MapIndex | null = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : null;
  const repo = resolve(opt("--repo") ?? file?.RUN.root ?? "");
  if (!existsSync(repo)) throw new Error(`no checkout at ${repo}: pass --repo`);
  const only = opt("--only")?.split(",");
  const set: { repo: string; commit: string; questions: Question[] } = JSON.parse(readFileSync(qfile, "utf8"));
  const questions = set.questions.filter((q) => !only || only.includes(q.id));

  cacheIn(`${out}/.cache`);
  const m = file ? buildMap(file, basename(out)) : null;
  const inv = inventory(repo);
  const graph = modes.includes("graph") ? await buildGraph(inv) : null;
  const model = MODELS[(process.env.SLOP_ASK ?? "sonnet") as keyof typeof MODELS] ?? MODELS.sonnet;
  // A map-reading answer depends on the map; a code-reading one on the checkout.
  const mapSalt = file ? createHash("sha256").update(readFileSync(`${out}/map.json`)).update(index ? readFileSync(indexPath) : "").digest("hex") : "";
  // A graph answer depends on the graph too: a change to graph.ts is a new answer, not a cached one.
  const graphSalt = graph ? createHash("sha256").update(JSON.stringify(graph.edges)).digest("hex").slice(0, 16) : "";
  const ctx = { repo, m, index, inv, graph, model, salt: "" };
  if (inv.commit && set.commit && !inv.commit.startsWith(set.commit) && !set.commit.startsWith(inv.commit))
    console.warn(`warning: the questions were written at ${set.commit}, the checkout is at ${inv.commit}`);

  const rows = await Promise.all(
    questions.flatMap((q) =>
      modes.map(async (mode) => {
        // "list 2": grep answers cached before `list` took "." as the root said the repository was empty.
        const { got, turns } = await answer(q, mode, { ...ctx, salt: mode === "grep" ? `${inv.commit} list 2` : mode === "graph" ? `${inv.commit} graph ${graphSalt}` : mapSalt });
        const verdicts = await grade(q, got);
        return { id: q.id, kind: q.kind, mode, score: mean(verdicts.map((v) => POINTS[v])), wrong: verdicts.includes("contradicted"), found: lands(got.cites, q.where), turns, verdicts, ...got };
      }),
    ),
  );
  await ccClose();

  const summary = Object.fromEntries(
    modes.map((mode) => {
      const mine = rows.filter((r) => r.mode === mode);
      const b = bill[`ask-${mode}`];
      return [mode, {
        score: mean(mine.map((r) => r.score)),
        found: mean(mine.map((r) => (r.found ? 1 : 0))),
        wrong: mine.filter((r) => r.wrong).length,
        turns: mean(mine.map((r) => r.turns)),
        tokens: b ? Math.round((b.input + b.cacheRead + b.output) / Math.max(1, mine.length)) : 0,
        usd: b ? Math.round(b.fullUsd * 100) / 100 : 0,
      }];
    }),
  );
  const kinds = [...new Set(questions.map((q) => q.kind))];
  console.log(`${set.repo}: ${questions.length} questions, ${file ? `map ${out}` : `checkout ${repo}`}`);
  console.table(Object.fromEntries(kinds.map((k) => [k, Object.fromEntries(modes.map((mode) => [mode, pct(mean(rows.filter((r) => r.kind === k && r.mode === mode).map((r) => r.score)))]))])));
  console.table(Object.fromEntries(modes.map((mode) => [mode, { score: pct(summary[mode].score), "cites a key line": pct(summary[mode].found), contradicted: summary[mode].wrong, "turns/q": summary[mode].turns.toFixed(1), "tokens/q": summary[mode].tokens, usd: summary[mode].usd }])));
  writeFileSync(`${out}/ask.json`, JSON.stringify({ at: new Date().toISOString(), questions: resolve(qfile), commit: inv.commit, model, summary, rows }, null, 1) + "\n");
}
