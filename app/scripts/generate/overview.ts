/**
 * Stage 3b — the repository's own level (D60): what it is, and one picture
 * whose boxes open the roots and whose arrows are paths the code really takes
 * from one root to another.
 *
 * It runs after the roots are accepted, so it draws what the authors found
 * rather than what the cut guessed: every root's own arrows that cite a file
 * another root owns are handed to it as the cheap evidence for an arrow
 * between them. The same agent tools and the same checker as an author; only
 * the brief and what a submit must hold differ.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import type { Node } from "@/lib/data";
import type { Overview } from "@/lib/map";
import { converse, runTool } from "./author";
import { type Handled } from "./claude-code";
import { check, OVERVIEW_ID } from "./check";
import { owners, type Cut } from "./cut";
import type { Inventory } from "./inventory";
import { shapeProblems } from "./schema";

export interface Overviewed {
  overview: Overview | null;
  turns: number;
  submits: number;
  problems: string[];
}

/** An overview's own fields, out of the node it was checked as. */
export const toOverview = (n: any): Overview =>
  Object.fromEntries(["sub", "detail", "anatomy", "issues", "code", "state", "unsure", "explain", "glossary", "walkthrough"].filter((k) => n[k] !== undefined).map((k) => [k, n[k]])) as Overview;

/** Arrows anywhere under a root whose cited line is in a file another root owns. */
function crossings(roots: Node[], cut: Cut): string[] {
  const out: string[] = [];
  const walk = (root: Node, n: Node) => {
    for (const b of n.anatomy ?? []) {
      if (b.kind !== "diagram") continue;
      for (const a of b.arrows) {
        const file = (a.at ?? "").replace(/:\d+(-\d+)?$/, "");
        const other = file ? owners(cut, file).filter((id) => id !== root.id) : [];
        if (!other.length) continue;
        const label = (id: string) => b.boxes.find((x) => x.id === id)?.label ?? id;
        out.push(`- ${root.id} → ${other.join("/")}: "${label(a.from)}" ${a.label ?? "→"} "${label(a.to)}" at ${a.at}`);
      }
    }
    (n.children ?? []).forEach((c) => walk(root, c));
  };
  roots.forEach((r) => walk(r, r));
  return out;
}

/** Every part's id and title, indented as the tree nests: what a walkthrough step's `path` is made of. */
function tree(roots: Node[]): string {
  const out: string[] = [];
  const walk = (n: Node, d: number) => { out.push(`${"  ".repeat(d)}- ${n.id}: ${n.title} — ${n.sub}`); (n.children ?? []).forEach((c) => walk(c, d + 1)); };
  roots.forEach((r) => walk(r, 0));
  return out.join("\n");
}

function brief(roots: Node[], cut: Cut, inv: Inventory): string {
  const cross = crossings(roots, cut);
  return [
    `# Repository: ${inv.name} @ ${inv.commit}`,
    `## README (excerpt)\n${inv.readme.slice(0, 2500) || "(none)"}`,
    `## Its roots, as their authors wrote them — ${cut.about}\n${roots
      .map((r) => `- ${r.id}: ${r.title} — ${r.sub}\n  ${r.detail ?? ""}\n  cites: ${(r.code ?? []).map((c) => `${c.file}:${c.start}-${c.end}`).join(", ")}`)
      .join("\n")}`,
    `## Every part, by id\n${tree(roots)}`,
    cross.length
      ? `## Arrows inside the roots that cite a file another root owns — evidence for an arrow between roots\n${cross.slice(0, 60).join("\n")}`
      : "",
    `## Task
Write the top level of the map: the repository itself, the level a reader lands on before opening any root. Submit it with \`root\`, a node with no \`id\`, \`title\` or \`children\`:
- \`sub\`: at most 8 words, what this repository IS.
- \`detail\`: at most two sentences and 40 words, the one thing to know before the picture.
- \`anatomy\`: exactly one \`diagram\`, its \`caption\` a heading of at most 5 words ("How the roots connect"), not a sentence. One box per root, labelled with the root's title, with \`opens\` set to the root's id; lay them out left to right in the order someone meets them, a branch on a row of its own. Add a box that opens nothing only for a thing outside every root that the roots meet (the database, an outside API).
- Arrows only where the code goes from one root to another — a call, a redirect, a write another reads — each with \`at\` as file:line. The evidence above is a start; read the lines before you use them. Roots with nothing between them get no arrow.
- \`code\`: the lines that show how the whole fits together (the entry point, the router), \`state\`, and \`issues\` only if one spans roots.

Then the way in for a reader who has never seen this project or its field — shown under an Explain toggle, so it can say more than the rest of the map:
- \`explain\`: \`body\` is 2-4 short paragraphs (blank line between, at most 200 words): what this system is for and who uses it, the problem it solves, and the idea behind how it works, defining each word of its field the first time. \`blocks\` holds 0-2 pictures only where they teach more than the prose — usually one \`diagram\` of the system in its world (the users, the machines, the outside services, and what flows between them), its boxes opening nothing and its arrows needing no \`at\`.
- \`glossary\`: 4-12 terms the map's titles and details lean on, as \`{term, meaning}\`, each meaning one plain sentence of at most 25 words. Terms of the field ("quorum", "webhook") and of this project ("metadata image") alike; skip words everyone knows.
- \`walkthrough\`: \`{title, steps}\` — one concrete thing followed through the system from start to end ("A new broker joins the cluster", "A visitor pays for a plan"), 3-8 steps in the order they happen. Each step: \`title\` a few words, \`detail\` one or two plain sentences, and \`path\` the ids from a root down to the part where it happens (from the list above), as deep as the step is specific.
Budget: about 10 tool calls before you submit.`,
  ].filter(Boolean).join("\n\n");
}

/** Problems with a submitted overview: its shape, the checker's verdict on it, and a box for every root. */
export function overviewProblems(o: any, roots: Node[], repo: string): string[] {
  if (!o || typeof o !== "object") return ["root is not an object"];
  const as = { ...o, id: OVERVIEW_ID, title: "Overview", children: [] };
  const shape = shapeProblems(as, "", true);
  if (shape.length) return shape;
  const diagrams = (o.anatomy ?? []).filter((b: any) => b.kind === "diagram");
  if (diagrams.length !== 1) return [`${OVERVIEW_ID}: anatomy needs exactly one diagram, has ${diagrams.length}`];
  const opened = diagrams[0].boxes.map((x: any) => x.opens).filter(Boolean);
  const out = roots.filter((r) => opened.filter((id: string) => id === r.id).length !== 1).map((r) => `${OVERVIEW_ID}: diagram needs exactly one box that opens root "${r.id}"`);
  out.push(...check({ AUTHORED: roots, OVERVIEW: toOverview(as), LINKS: [] }, repo, { generated: true }).problems.filter((p) => p.includes(OVERVIEW_ID)));
  return out;
}

export async function overviewOf(roots: Node[], cut: Cut, inv: Inventory, model: string, onSubmit: (submit: number, problems: number) => void): Promise<Overviewed> {
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
    const problems = overviewProblems(o, roots, inv.repo);
    res.problems = problems;
    onSubmit(res.submits, problems.length);
    if (!problems.length) return { content: "Accepted. Stop now.", done: { ...res, overview: toOverview(o) } };
    return { content: `Not accepted. Fix every one of these, then submit the whole overview again with \`root\`:\n- ${problems.slice(0, 40).join("\n- ")}`, isError: true };
  };

  const r = await converse<Overviewed>({ prompt: brief(roots, cut, inv), handle, model, stage: "overview", maxTurns: 22, nudge: "Continue: finish by calling submit with the overview as `root`." });
  return { ...(r.value ?? res), turns: r.turns };
}
