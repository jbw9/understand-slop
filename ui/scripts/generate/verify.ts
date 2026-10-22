/**
 * Stage 4 — does each node's prose hold against the lines it cites?
 *
 * The checker proves a cited range exists; only a reading proves it says what
 * the node claims. Two readers, because one was not enough: Haiku alone
 * flagged claims and in the same breath called them accurate (taxonomy: 18 of
 * 54 nodes downgraded, most wrongly). So Haiku screens every claim with an
 * explicit verdict, and only what it marks contradicted or not shown goes to
 * the author model. That reviewer can search the repository: a true claim
 * whose lines were simply not cited gets the missing code ref (taxonomy's
 * second run downgraded 24 nodes for exactly that), a false one is corrected,
 * and only a claim the repository cannot show at all marks the node `partial`.
 */
import type { CodeRef, Node } from "@/lib/data";
import { ask, callsOf, invoke, MODELS, type Block, type Message } from "./bedrock";
import { runTool, TOOLS } from "./author";
import { fileReader } from "./check";
import { numbered, type Inventory } from "./inventory";

export interface Verdict {
  id: string;
  ok: boolean;
  flagged: number;
  rewritten: boolean;
  downgraded: boolean;
  claims: string[];
}

const SCREEN = {
  name: "verdicts",
  description: "One verdict per factual claim in the node.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["claims"],
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "verdict"],
          properties: {
            claim: { type: "string", description: "The claim, quoted briefly." },
            verdict: { type: "string", enum: ["supported", "contradicted", "not_shown"], description: "supported: the cited lines show it. contradicted: they show otherwise. not_shown: nothing cited bears on it." },
            why: { type: "string" },
          },
        },
      },
    },
  },
};

const REVIEW = {
  name: "review",
  description: "Your ruling on the flagged claims, and the node's corrected wording.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["real", "detail", "issues", "code_labels", "add_refs", "unresolvable"],
    properties: {
      real: { type: "array", items: { type: "string" }, description: "The flags that are right. Empty if every flag is a false alarm." },
      detail: { type: "string", description: "The node's detail, corrected if needed. At most two sentences and 40 words." },
      issues: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: { type: "string" }, detail: { type: "string" }, where: { type: "string" } } } },
      code_labels: { type: "array", items: { type: "string" }, description: "One label per existing code ref, same order." },
      add_refs: {
        type: "array",
        description: "Code refs to add for true claims whose lines were not cited — lines you have read.",
        items: { type: "object", additionalProperties: false, required: ["file", "start", "end", "label"], properties: { file: { type: "string" }, start: { type: "integer" }, end: { type: "integer" }, label: { type: "string" } } },
      },
      unresolvable: { type: "string", description: "Only when a claim the node depends on cannot be shown from anything in this repository (it lives in an external service, a deploy setting, an unchecked-in schema): one plain sentence saying what is not certain and why. Otherwise empty." },
    },
  },
};

function evidence(n: Node, inv: Inventory): string {
  return (n.code ?? [])
    .map((c, i) => `[${i}] ${c.label} — ${c.file}:${c.start}-${c.end}\n${numbered(inv.repo, c.file, c.start, Math.min(c.end, c.start + 150))}`)
    .join("\n\n");
}

function claims(n: Node): string {
  return JSON.stringify({ title: n.title, sub: n.sub, detail: n.detail, issues: n.issues ?? [], code_labels: (n.code ?? []).map((c) => c.label) }, null, 1);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z"`(])/).filter(Boolean).length;

async function verifyNode(n: Node, inv: Inventory, model: string): Promise<Verdict> {
  const v: Verdict = { id: n.id, ok: true, flagged: 0, rewritten: false, downgraded: false, claims: [] };
  const screen = await ask<{ claims: { claim: string; verdict: string; why?: string }[] }>({
    model: MODELS.haiku,
    stage: "verify",
    maxTokens: 4000,
    system: "You check a short explanation of code against the code it cites. List every factual claim in the detail, issues and code labels, and give each a verdict. Reasonable summary and wording are supported; a fact, behaviour, name or number the lines do not show is not.",
    messages: [{ role: "user", content: `## The node\n${claims(n)}\n\n## The cited code\n${evidence(n, inv)}` }],
    tool: SCREEN,
  });
  const flags = screen.claims.filter((c) => c.verdict !== "supported").map((c) => `${c.claim} — ${c.verdict}${c.why ? `: ${c.why}` : ""}`);
  v.flagged = flags.length;
  if (!flags.length) return v;

  const r = await review(n, flags, inv, model);
  if (!r) return v;
  v.claims = r.real;
  if (!r.real.length) return v;
  // A rewrite that still breaks the length rule is not applied; the node keeps its own detail.
  if (words(r.detail) <= 40 && sentences(r.detail) <= 2) n.detail = r.detail;
  n.issues = r.issues.length ? r.issues : undefined;
  (n.code ?? []).forEach((c, i) => { if (r.code_labels[i]) c.label = r.code_labels[i]; });
  const linesOf = fileReader(inv.repo);
  for (const c of r.add_refs) {
    const lines = linesOf(c.file);
    if (lines && c.start >= 1 && c.start <= c.end && c.end <= lines.length) (n.code ??= []).push(c);
  }
  v.rewritten = true;
  if (r.unresolvable.trim()) {
    n.state = "partial";
    n.unsure = r.unresolvable.trim().slice(0, 300);
    v.downgraded = true;
    v.ok = false;
  }
  return v;
}

interface Review { real: string[]; detail: string; issues: { title: string; detail: string; where?: string }[]; code_labels: string[]; add_refs: CodeRef[]; unresolvable: string }

/** The second reader: may read and grep the repository before ruling. */
async function review(n: Node, flags: string[], inv: Inventory, model: string): Promise<Review | null> {
  const known = new Set(inv.files.map((f) => f.path));
  const tools = [...TOOLS.filter((t) => t.name !== "submit"), REVIEW];
  const system = `You rule on flags a first reader raised against an explanation of code. The first reader saw only the cited lines, so many flags are false alarms or true claims that were simply not cited.
- A false alarm: dismiss it.
- A true claim whose lines were not cited: find them (read_file, grep) and add them in add_refs.
- A wrong claim: correct the wording so every claim is shown by code — never add what the code does not show.
- A claim nothing in this repository can show: say so in unresolvable.
The detail must stay at most two sentences and 40 words. Finish by calling review.`;
  const messages: Message[] = [{ role: "user", content: `## The node\n${claims(n)}\n\n## Claims a first reader flagged\n- ${flags.join("\n- ")}\n\n## The cited code\n${evidence(n, inv)}` }];
  for (let turn = 0; turn < 10; turn++) {
    const r = await invoke({ model, stage: "verify-review", effort: "medium", maxTokens: 8000, system, messages, tools });
    messages.push({ role: "assistant", content: r.content });
    const calls = callsOf(r);
    const done = calls.find((c) => c.name === "review");
    if (done) {
      const out = done.input as Review;
      if (out.real.length && (words(out.detail) > 40 || sentences(out.detail) > 2) && turn < 9) {
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: done.id, is_error: true, content: `The detail has ${words(out.detail)} words and ${sentences(out.detail)} sentences; the limit is 40 words and 2 sentences. Call review again.` }] });
        continue;
      }
      return out;
    }
    if (!calls.length) { messages.push({ role: "user", content: "Finish by calling review." }); continue; }
    messages.push({ role: "user", content: calls.map((c): Block => ({ type: "tool_result", tool_use_id: c.id, content: runTool(c as { name: string; input: unknown }, inv, known) })) });
  }
  return null;
}

export async function verifyTree(root: Node, inv: Inventory, model: string): Promise<Verdict[]> {
  const nodes: Node[] = [];
  const walk = (n: Node) => { nodes.push(n); (n.children ?? []).forEach(walk); };
  walk(root);
  return Promise.all(nodes.map((n) => (n.code?.length ? verifyNode(n, inv, model) : Promise.resolve({ id: n.id, ok: false, flagged: 0, rewritten: false, downgraded: false, claims: ["no code refs"] }))));
}
