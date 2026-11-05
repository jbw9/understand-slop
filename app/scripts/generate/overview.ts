/**
 * Stage 3b — the repository's own level (D60): what it is, and one picture
 * whose boxes open the roots and whose arrows are paths the code really takes
 * from one root to another.
 *
 * It runs after the roots are accepted, so it draws what the authors found
 * rather than what the cut guessed. Its evidence for an arrow between two
 * roots is the import graph: each file of one that uses a file of the other,
 * with the first line that names what it uses. The authors' own arrows
 * across roots were the evidence before, and missed most of these (a root
 * draws its own parts, not who calls it). The same agent tools and checker as
 * an author; only the brief and what a submit must hold differ.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import type { Node } from "@/lib/data";
import type { Overview } from "@/lib/map";
import { converse, runTool } from "./author";
import { type Handled } from "./claude-code";
import { bareLines, check, EXPLAIN_LEVEL, fileReader, OVERVIEW_ID, WALK_STEPS, WALKS } from "./check";
import { owners, type Cut } from "./cut";
import type { Inventory } from "./inventory";
import { shapeProblems } from "./schema";
import type { FileSummary } from "./summarize";

export interface Overviewed {
  overview: Overview | null;
  turns: number;
  submits: number;
  problems: string[];
}

/** An overview's own fields, out of the node it was checked as. */
export const toOverview = (n: any): Overview =>
  Object.fromEntries(["sub", "detail", "anatomy", "issues", "code", "state", "unsure", "explain", "glossary", "walkthroughs"].filter((k) => n[k] !== undefined).map((k) => [k, n[k]])) as Overview;

/** Symbol names too common to say which import a line uses. */
const COMMON = /^(default|constructor|main|init|__init__|new|run|get|set|handler|config|props|index|value|data|type|impl|fn|pub|struct|class|def|func|trait|enum|object)$/i;
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Root-to-root edges from the import graph, each with up to three of the
 * files behind it and, where one can be found, the first line past the
 * imports that names a symbol of the file it uses: the call site to cite.
 */
export function edges(roots: Node[], cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string[] {
  const ids = new Set(roots.map((r) => r.id));
  const linesOf = fileReader(inv.repo);
  const site = (a: string, b: string) => {
    const names = [...new Set((sums[b]?.symbols ?? []).map((x) => x.name.split(/[.\s(:#]/).filter(Boolean).pop() ?? "").filter((n) => n.length >= 3 && !COMMON.test(n)))];
    const lines = linesOf(a);
    if (!names.length || !lines) return null;
    const re = new RegExp(`\\b(${names.map(esc).join("|")})\\b`);
    const bare = bareLines(lines);
    for (let i = 0; i < lines.length; i++) {
      const m = !bare[i] && re.exec(lines[i]);
      if (m) return { line: i + 1, name: m[1] };
    }
    return null;
  };
  const pairs = new Map<string, { count: number; seen: string[] }>();
  for (const [a, bs] of Object.entries(inv.imports))
    for (const b of bs)
      for (const x of owners(cut, a).filter((r) => ids.has(r)))
        for (const y of owners(cut, b).filter((r) => ids.has(r) && r !== x && !owners(cut, a).includes(r))) {
          const k = `${x} → ${y}`;
          const p = pairs.get(k) ?? { count: 0, seen: [] };
          p.count++;
          if (p.seen.length < 3) {
            const s = site(a, b);
            p.seen.push(s ? `${a}:${s.line} uses \`${s.name}\` (${b})` : `${a} imports ${b}`);
          }
          pairs.set(k, p);
        }
  return [...pairs].sort((a, b) => b[1].count - a[1].count).map(([k, p]) => `- ${k} (${p.count} import${p.count > 1 ? "s" : ""}): ${p.seen.join("; ")}`);
}

/** What each root's files read and write, as their summaries say: the evidence for where data lives. */
function stores(roots: Node[], cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string[] {
  return roots.flatMap((r) => {
    const mine = inv.files.filter((f) => owners(cut, f.path).includes(r.id)).map((f) => sums[f.path]).filter(Boolean);
    const w = [...new Set(mine.flatMap((s) => s.writes))].slice(0, 8);
    const rd = [...new Set(mine.flatMap((s) => s.reads))].slice(0, 8);
    return w.length || rd.length ? [`- ${r.id}: ${w.length ? `writes ${w.join(", ")}` : ""}${w.length && rd.length ? "; " : ""}${rd.length ? `reads ${rd.join(", ")}` : ""}`] : [];
  });
}

/** Every part's id and title, indented as the tree nests: what a walkthrough step's `path` is made of. */
function tree(roots: Node[]): string {
  const out: string[] = [];
  const walk = (n: Node, d: number) => { out.push(`${"  ".repeat(d)}- ${n.id}: ${n.title} — ${n.sub}`); (n.children ?? []).forEach((c) => walk(c, d + 1)); };
  roots.forEach((r) => walk(r, 0));
  return out.join("\n");
}

function brief(roots: Node[], cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string {
  const cross = edges(roots, cut, inv, sums);
  const data = stores(roots, cut, inv, sums);
  return [
    `# Repository: ${inv.name} @ ${inv.commit}`,
    `## README (excerpt)\n${inv.readme.slice(0, 2500) || "(none)"}`,
    `## Its roots, as their authors wrote them — ${cut.about}\n${roots
      .map((r) => `- ${r.id}: ${r.title} — ${r.sub}\n  ${r.detail ?? ""}\n  cites: ${(r.code ?? []).map((c) => `${c.file}:${c.start}-${c.end}`).join(", ")}`)
      .join("\n")}`,
    `## Every part, by id\n${tree(roots)}`,
    cross.length
      ? `## Where one root's code uses another's, by import — evidence for an arrow between roots\nEach line: the files behind the edge, and where one was found, the first line that names what it uses.\n${cross.slice(0, 60).join("\n")}`
      : "",
    data.length ? `## What each root's files read and write, as their summaries say\n${data.join("\n")}` : "",
    `## Task
Write the top level of the map: the repository itself, the level a reader lands on before opening any root. Submit it with \`root\`, a node with no \`id\`, \`title\` or \`children\`:
- \`sub\`: at most 8 words, what this repository IS.
- \`detail\`: at most two sentences and 40 words, the one thing to know before the picture.
- \`anatomy\`: exactly one \`diagram\`, its \`caption\` a heading of at most 5 words ("How the roots connect"), not a sentence. One box per root, labelled with the root's title, with \`opens\` set to the root's id; lay them out left to right in the order someone meets them, a branch on a row of its own. Add a box that opens nothing only for a thing outside every root that the roots meet (the database, an outside API).
- Arrows only where the code goes from one root to another — a call, a redirect, a write another reads — each with \`at\` as file:line, a line in one of the two roots' files. Every edge listed above with a call site is a real path; draw the ones a reader needs (the most-used, and every one a walkthrough crosses), reading the line first. Roots with nothing between them get no arrow.
- Where the code stores data (a database, files, a cache, browser storage, a queue), a \`table\` captioned "Where data lives", with columns Store | Holds | Defined at | Written by | Read by: one row per store, what it holds in a few words, the file:line where its schema or shape is defined (a migration, a model, a type), and the roots that write and read it, by title. Read the code to confirm each writer and reader; the summaries above are leads. A repository that stores nothing has none.
- \`code\`: the lines that show how the whole fits together (the entry point, the router), \`state\`, and \`issues\` only if one spans roots.
- \`walkthroughs\`: ${WALKS[0]}-${WALKS[1]} of \`{title, steps}\` — the core things this system does, each followed from start to end across the roots it passes through ("A visitor pays for a plan", "A broker joins the cluster"): the ones a developer new to the code most needs, not edge cases. ${WALK_STEPS[0]}-${WALK_STEPS[1]} steps each, in the order they happen. Each step: \`title\` a few words, \`detail\` one or two plain sentences naming the function that does it, and \`path\` the ids from a root down to the part where it happens (from the list above), as deep as the step is specific.

${WAY_IN[EXPLAIN_LEVEL]}Budget: about 10 tool calls before you submit.`,
  ].filter(Boolean).join("\n\n");
}

/** What the top level adds for a newcomer, at the map's explain level (D70). The full text is D68's, unchanged. */
const WAY_IN = {
  full: `Then the way in for a reader who has never seen this project or its field — shown under an Explain toggle, so it can say more than the rest of the map:
- \`explain\`: \`body\` is 2-4 short paragraphs (blank line between, at most 200 words): what this system is for and who uses it, the problem it solves, and the idea behind how it works, defining each word of its field the first time. \`blocks\` holds 0-2 pictures only where they teach more than the prose — usually one \`diagram\` of the system in its world (the users, the machines, the outside services, and what flows between them), its boxes opening nothing and its arrows needing no \`at\`.
- \`glossary\`: 4-12 terms the map's titles and details lean on, as \`{term, meaning}\`, each meaning one plain sentence of at most 25 words. Terms of the field ("quorum", "webhook") and of this project ("metadata image") alike; skip words everyone knows. It is never listed — each term is defined on hover where the map uses it, so use the exact word the text uses.
`,
  detailed: `Then the way in for a reader who knows a little of this kind of software and none of this project — shown under an Explain toggle:
- \`explain\`: \`body\` is one or two short paragraphs (blank line between, at most 120 words): what this system is for and who uses it, and the idea behind how it works, defining each word of its field the first time. \`blocks\` holds at most one picture, only where it teaches more than the prose — usually a \`diagram\` of the system in its world, its boxes opening nothing and its arrows needing no \`at\`.
- \`glossary\`: 4-10 terms the map's titles and details lean on, as \`{term, meaning}\`, each meaning one plain sentence of at most 25 words. Terms of the field and of this project alike; skip words everyone knows. It is never listed — each term is defined on hover where the map uses it, so use the exact word the text uses.
`,
  brief: `Then a short way in for a reader who knows this kind of software but not this project — shown under an Explain toggle:
- \`explain\`: \`body\` is one to three sentences, at most 60 words: what this system is for and the idea behind how it is built. No \`blocks\`.
- \`glossary\`: 3-8 terms, as \`{term, meaning}\`, each meaning one plain sentence of at most 25 words — only this project's own words, or words a developer outside this field would not know. It is never listed — each term is defined on hover where the map uses it, so use the exact word the text uses.
`,
  minimal: `Then a one-line way in for a reader who knows this kind of software and has used this project — shown under an Explain toggle:
- \`explain\`: \`body\` is one sentence, at most 30 words: what this system is for. No \`blocks\`.
- \`glossary\`: 2-5 terms, as \`{term, meaning}\`, each meaning one plain sentence of at most 25 words — only words this project uses in its own sense. It is never listed — each term is defined on hover where the map uses it, so use the exact word the text uses.
`,
  none: "",
};

/** Problems with a submitted overview: its shape, the checker's verdict on it, a box for every root, and arrows between roots that cite one of theirs. */
export function overviewProblems(o: any, roots: Node[], repo: string, cut: Cut): string[] {
  if (!o || typeof o !== "object") return ["root is not an object"];
  const as = { ...o, id: OVERVIEW_ID, title: "Overview", children: [] };
  const shape = shapeProblems(as, "", true);
  if (shape.length) return shape;
  const diagrams = (o.anatomy ?? []).filter((b: any) => b.kind === "diagram");
  if (diagrams.length !== 1) return [`${OVERVIEW_ID}: anatomy needs exactly one diagram, has ${diagrams.length}`];
  const opened = diagrams[0].boxes.map((x: any) => x.opens).filter(Boolean);
  const out = roots.filter((r) => opened.filter((id: string) => id === r.id).length !== 1).map((r) => `${OVERVIEW_ID}: diagram needs exactly one box that opens root "${r.id}"`);
  const rootOf = (id: string) => diagrams[0].boxes.find((x: any) => x.id === id)?.opens;
  for (const a of diagrams[0].arrows ?? []) {
    const [x, y] = [rootOf(a.from), rootOf(a.to)];
    const file = /^(.+):\d+(?:-\d+)?$/.exec(a.at ?? "")?.[1];
    if (x && y && file && !owners(cut, file).some((r) => r === x || r === y))
      out.push(`ARROW ${OVERVIEW_ID} ${a.from}→${a.to} cites ${a.at}, a file neither ${x} nor ${y} owns — cite the line in one of theirs where the one reaches the other`);
  }
  out.push(...check({ AUTHORED: roots, OVERVIEW: toOverview(as) }, repo, { generated: true }).problems.filter((p) => p.includes(OVERVIEW_ID)));
  return out;
}

export async function overviewOf(roots: Node[], cut: Cut, inv: Inventory, model: string, onSubmit: (submit: number, problems: number) => void, sums: Record<string, FileSummary> = {}): Promise<Overviewed> {
  const known = new Set(inv.files.map((f) => f.path));
  const res: Overviewed = { overview: null, turns: 0, submits: 0, problems: [] };
  let last: any = null;

  const handle = (name: string, input: any): Handled => {
    if (name !== "submit") return { content: runTool({ name, input }, inv, known) };
    res.submits++;
    // A fix after a rejection may send only what changed; it lands on the last submit.
    const fixes = typeof input?.replace === "string" ? JSON.parse(input.replace) : input?.replace;
    const o = input?.root ?? (Array.isArray(fixes) && last ? Object.assign(structuredClone(last), ...fixes) : null);
    if (o && typeof o === "object") last = structuredClone(o);
    const problems = overviewProblems(o, roots, inv.repo, cut);
    res.problems = problems;
    onSubmit(res.submits, problems.length);
    if (!problems.length) return { content: "Accepted. Stop now.", done: { ...res, overview: toOverview(o) } };
    return { content: `Not accepted. Fix every one of these, then submit the whole overview again with \`root\`:\n- ${problems.slice(0, 40).join("\n- ")}`, isError: true };
  };

  const r = await converse<Overviewed>({ prompt: brief(roots, cut, inv, sums), handle, model, stage: "overview", maxTurns: 22, nudge: "Continue: finish by calling submit with the overview as `root`." });
  return { ...(r.value ?? res), turns: r.turns };
}
