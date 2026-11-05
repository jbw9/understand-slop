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
 * An issue that is accurate but describes behaviour the code means to have is
 * flagged `intended` and dropped: on flask, a mature library with few real
 * bugs, a third of the issues were documented rules written up as defects.
 */
import type { Anatomy, CodeRef, Node } from "@/lib/data";
import { ask, BACKEND, callsOf, invoke, MODELS, type Block, type Message } from "./bedrock";
import { converse, runTool, TOOLS } from "./author";
import { bareLines, fileReader, LEAF, sentences, STEP_LINES, words } from "./check";
import { numbered, type Inventory } from "./inventory";

export interface Verdict {
  id: string;
  ok: boolean;
  flagged: number;
  rewritten: boolean;
  downgraded: boolean;
  claims: string[];
  /** Every claim the first reader questioned, with its verdict, before review. */
  flags?: string[];
  /** The detail as the reviewer corrected it, when it changed. */
  fixed?: string;
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
          required: ["claim", "why", "verdict"],
          properties: {
            claim: { type: "string", description: "The claim, quoted briefly." },
            why: { type: "string", description: "What the shown code says about it, worked out before the verdict." },
            verdict: { type: "string", enum: ["supported", "contradicted", "not_shown", "intended"], description: "supported: the cited lines show it. contradicted: they show otherwise. not_shown: nothing cited bears on it. intended (issues only): the lines show it, but it is behaviour the code means to have — a documented rule, a deliberate error for misuse, standard language behaviour — not something going wrong." },
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
    required: ["real", "detail", "issues", "code_labels", "add_refs", "lines", "unresolvable"],
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
      lines: {
        type: "array",
        description: "For each flagged entry of `lines` (A1, S2, M3) that is wrong: where it really happens, as file:start-end you have read, or an empty `at` when it happens nowhere; and, for an arrow or message whose words are wrong, the corrected words (an arrow's at most 24 characters).",
        items: { type: "object", additionalProperties: false, required: ["ref", "at"], properties: { ref: { type: "string" }, at: { type: "string" }, says: { type: "string" } } },
      },
      unresolvable: { type: "string", description: "Only when a claim the node depends on cannot be shown from anything in this repository (it lives in an external service, a deploy setting, an unchecked-in schema): one plain sentence saying what is not certain and why. Otherwise empty." },
    },
  },
};

/** A file this short is shown whole; a longer one, the cited lines with this much either side. */
const WHOLE = 250;
const AROUND = 30;

/**
 * Each cited range with the code around it. With only the cited lines, most
 * of what the screen flagged was a constant or call just outside them, and the
 * reviewer's searches to dismiss those cost more than the rest of the run's
 * checking (mira: 39 flags, 4 upheld).
 */
export function evidence(n: Node, inv: Inventory): string {
  const shown = new Set<string>();
  const windows: { file: string; start: number; end: number }[] = [];
  const refs = (n.code ?? []).map((c, i) => {
    const head = `[${i}] ${c.label} — ${c.file}:${c.start}-${c.end}`;
    const total = inv.files.find((f) => f.path === c.file)?.lines ?? c.end;
    if (total > WHOLE) {
      const w = { file: c.file, start: Math.max(1, c.start - AROUND), end: Math.min(c.end, c.start + 150) + AROUND };
      windows.push(w);
      return `${head}, with the lines around it\n${numbered(inv.repo, c.file, w.start, w.end)}`;
    }
    if (shown.has(c.file)) return `${head} (the whole file is shown above)`;
    shown.add(c.file);
    return `${head}, in the whole file\n${numbered(inv.repo, c.file)}`;
  });
  // The lines each arrow, step, message and issue points at, unless a ref above already shows them.
  const seen = new Set<string>();
  const pointed = [...entries(n).map((e) => ({ ref: e.ref, at: e.at })), ...(n.issues ?? []).flatMap((x, i) => (x.where ? [{ ref: `issue ${i + 1}`, at: x.where }] : []))].flatMap(({ ref, at }) => {
    const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(at);
    const f = m && inv.files.find((x) => x.path === m[1]);
    if (!m || !f || seen.has(at)) return [];
    seen.add(at);
    const start = +m[2], end = Math.min(+(m[3] ?? m[2]), start + STEP_LINES);
    if (shown.has(f.path) || windows.some((w) => w.file === f.path && w.start <= start && w.end >= end)) return [];
    return [`[${ref}] at ${at}\n${numbered(inv.repo, f.path, Math.max(1, start - 5), end + 5)}`];
  });
  return [...refs, ...pointed].join("\n\n");
}

/** A line the node points at and says something about: an arrow, a step, a message. */
interface Entry { ref: string; says: string; at: string; kind: "arrow" | "step" | "message"; target: { at?: string; label?: string; state?: string }; list?: unknown[] }

/** Every arrow, step and message of a node that cites a line, numbered A1, S1, M1 in reading order. */
function entries(n: Node): Entry[] {
  const out: Entry[] = [];
  const count = { A: 0, S: 0, M: 0 };
  const walk = (bs: Anatomy[] = []) => {
    for (const b of bs) {
      if (b.kind === "diagram") {
        const label = (id: string) => b.boxes.find((x) => x.id === id)?.label ?? id;
        for (const a of b.arrows) if (a.at) out.push({ ref: `A${++count.A}`, kind: "arrow", says: `${label(a.from)} → ${label(a.to)}${a.label ? `: ${a.label}` : ""}`, at: a.at, target: a, list: b.arrows });
      }
      if (b.kind === "flow") for (const r of b.rows) if (r.at) out.push({ ref: `S${++count.S}`, kind: "step", says: `${r.title} — ${r.detail}`, at: r.at, target: r });
      if (b.kind === "sequence") for (const r of b.rows) if (r.at) out.push({ ref: `M${++count.M}`, kind: "message", says: `${r.from} → ${r.to}: ${r.label}`, at: r.at, target: r });
      if ("rows" in b && Array.isArray(b.rows)) for (const r of b.rows as { under?: Anatomy[] }[]) walk(r?.under);
    }
  };
  walk(n.anatomy);
  return out;
}

function claims(n: Node): string {
  const lines = entries(n).map(({ ref, says, at }) => ({ ref, says, at }));
  return JSON.stringify({ title: n.title, sub: n.sub, detail: n.detail, issues: n.issues ?? [], code_labels: (n.code ?? []).map((c) => c.label), ...(lines.length ? { lines } : {}) }, null, 1);
}


type Screen = { claims: { claim: string; verdict: string; why?: string }[] };

const SCREEN_SYSTEM = "You check a short explanation of code against the code it cites, shown with the code around it; anything in what you are shown counts. List every factual claim in the detail, issues and code labels, and give each a verdict. Reasonable summary and wording are supported; a fact, behaviour, name or number the lines do not show is not. An issue must be something going wrong; one that describes deliberate behaviour is intended, even when it is accurate. Each entry of `lines` is one claim, quoted with its ref first (\"A2: …\"): the code at its `at` must show it happening — an arrow, the call, write or send from one box to the other; a step, that step; a message, it being sent or answered. A line that only names it in an import, a comment or a declaration is not_shown.";

/** The first reader on one node. Null when it gave no answer. */
async function screenOne(n: Node, inv: Inventory): Promise<Screen | null> {
  const screenWith = (maxTokens: number) => ask<Screen>({
    model: MODELS.haiku,
    stage: "verify",
    maxTokens,
    system: SCREEN_SYSTEM,
    messages: [{ role: "user", content: `## The node\n${claims(n)}\n\n## The cited code\n${evidence(n, inv)}` }],
    tool: SCREEN,
  });
  // A node with many claims can outrun the first answer's room (umami's did);
  // it gets more, and if it still has no answer it is unverified, not fatal.
  return screenWith(4000).catch(() => screenWith(16000)).catch(() => null);
}

const SCREENS = {
  name: "screens",
  description: "For each node shown, one verdict per factual claim in it.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["nodes"],
    properties: {
      nodes: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["id", "claims"], properties: { id: { type: "string" }, claims: SCREEN.input_schema.properties.claims } },
      },
    },
  },
};

/** Evidence a batch of screens may carry, in characters, and nodes per batch. */
const BATCH_CHARS = 60_000;
const BATCH_NODES = 8;

/**
 * The first reader on many nodes at once, for Claude Code: every `claude -p`
 * pays its own start-up and prompt, which one call per node multiplied by the
 * whole map. A node the batch leaves out is screened on its own.
 */
async function screenMany(nodes: Node[], inv: Inventory): Promise<Map<string, Screen | null>> {
  const parts = nodes.map((n) => ({ n, text: `# Node ${n.id}\n## The node\n${claims(n)}\n\n## The cited code\n${evidence(n, inv)}` }));
  const batches: (typeof parts)[] = [];
  for (const p of parts) {
    const b = batches[batches.length - 1];
    if (b && b.length < BATCH_NODES && b.reduce((a, x) => a + x.text.length, 0) + p.text.length <= BATCH_CHARS) b.push(p);
    else batches.push([p]);
  }
  const out = new Map<string, Screen | null>();
  await Promise.all(
    batches.map(async (b) => {
      if (b.length > 1) {
        const r = await ask<{ nodes: ({ id: string } & Screen)[] }>({
          model: MODELS.haiku,
          stage: "verify",
          system: `${SCREEN_SYSTEM} Each node is checked against its own cited code only. Answer for every node shown, by its id.`,
          messages: [{ role: "user", content: b.map((p) => p.text).join("\n\n") }],
          tool: SCREENS,
        }).catch(() => null);
        for (const x of r?.nodes ?? []) if (b.some((p) => p.n.id === x.id)) out.set(x.id, { claims: x.claims });
      }
      await Promise.all(b.filter((p) => !out.has(p.n.id)).map(async (p) => out.set(p.n.id, await screenOne(p.n, inv))));
    }),
  );
  return out;
}

/** The claims a screen did not find supported, as the reviewer reads them. */
const flagsOf = (screen: Screen) => screen.claims.filter((c) => c.verdict !== "supported").map((c) => `${c.claim} — ${c.verdict}${c.why ? `: ${c.why}` : ""}`);

/**
 * What the screen's flags come to: dismissed, rewritten, or the node marked
 * partial. `reviewed` holds rulings already made in a batch (reviewMany); a
 * node it has none for is reviewed on its own.
 */
async function settle(n: Node, screen: Screen | null, inv: Inventory, model: string, reviewed?: Map<string, Review>): Promise<Verdict> {
  const v: Verdict = { id: n.id, ok: true, flagged: 0, rewritten: false, downgraded: false, claims: [] };
  if (!screen) return { ...v, ok: false, claims: ["the verify screen gave no answer"] };
  const flags = flagsOf(screen);
  v.flagged = flags.length;
  v.flags = flags;
  if (!flags.length) {
    n.verified = { claims: screen.claims.length, corrected: 0 };
    return v;
  }

  // One failed review leaves this node unreviewed; it must not fail the whole stage.
  const r = reviewed?.get(n.id) ?? (await review(n, flags, inv, model).catch(() => null));
  // Unreviewed, the flags stand: passing the node would call questioned claims derived.
  if (!r) {
    n.state = "partial";
    n.unsure = `Not confirmed against the code: ${screen.claims.find((c) => c.verdict !== "supported")!.claim}`.slice(0, 300);
    return { ...v, ok: false, downgraded: true, claims: ["the review gave no ruling"] };
  }
  v.claims = r.real;
  n.verified = { claims: screen.claims.length, corrected: r.real.length };
  if (!r.real.length) return v;
  // A rewrite that still breaks the length rule is not applied; the node keeps its own detail.
  if (words(r.detail) <= 40 && sentences(r.detail) <= 2 && r.detail !== n.detail) n.detail = v.fixed = r.detail;
  n.issues = r.issues.length ? r.issues : undefined;
  (n.code ?? []).forEach((c, i) => { if (r.code_labels[i]) c.label = r.code_labels[i]; });
  const linesOf = fileReader(inv.repo);
  const byRef = new Map(entries(n).map((e) => [e.ref, e]));
  for (const l of r.lines) {
    const e = byRef.get(l.ref);
    if (!e) continue;
    const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(l.at.trim());
    const lines = m && linesOf(m[1]);
    const [s, t] = m ? [+m[2], +(m[3] ?? m[2])] : [0, 0];
    if (lines && s >= 1 && s <= t && t <= lines.length && (e.kind === "arrow" || t - s < STEP_LINES) && !bareLines(lines).slice(s - 1, t).every(Boolean)) e.target.at = l.at.trim();
    else if (!l.at.trim()) {
      // An arrow is a path in the code (D19): one that happens nowhere is not drawn. A step stays, unconfirmed.
      if (e.kind === "arrow") e.list!.splice(e.list!.indexOf(e.target), 1);
      else { delete e.target.at; e.target.state = "partial"; }
    }
    if (l.says?.trim() && e.kind !== "step" && (e.kind === "message" || l.says.trim().length <= 24)) e.target.label = l.says.trim();
  }
  // A leaf's refs are its code drawer, held to one piece of code (LEAF); a ref
  // that would push it past that backs the claim at the cost of the drawer, so
  // the claim stands on the review instead.
  const fits = (code: CodeRef[]) =>
    n.children?.length || (code.length <= LEAF.refs && new Set(code.map((x) => x.file)).size <= LEAF.files && code.reduce((a, x) => a + x.end - x.start + 1, 0) <= LEAF.lines);
  for (const c of r.add_refs) {
    const lines = linesOf(c.file);
    if (lines && c.start >= 1 && c.start <= c.end && c.end <= lines.length && fits([...(n.code ?? []), c])) (n.code ??= []).push(c);
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

interface Review { real: string[]; detail: string; issues: { title: string; detail: string; where?: string }[]; code_labels: string[]; add_refs: CodeRef[]; lines: { ref: string; at: string; says?: string }[]; unresolvable: string }

/**
 * A review call's input with every field present. Through Claude Code a tool's
 * input is not held to its schema, and a reply without `unresolvable` once
 * threw in settle after a 36-minute run.
 */
const filled = (input: unknown): Review => {
  const r = (input ?? {}) as Partial<Review>;
  return { real: r.real ?? [], detail: r.detail ?? "", issues: r.issues ?? [], code_labels: r.code_labels ?? [], add_refs: r.add_refs ?? [], lines: r.lines ?? [], unresolvable: r.unresolvable ?? "" };
};

const REVIEW_SYSTEM = `You rule on flags a first reader raised against an explanation of code. The first reader saw only the cited lines and a little around them, so many flags are false alarms or true claims that were simply not cited.
- A false alarm: dismiss it.
- A true claim whose lines were not cited: find them (read_file, grep) and add them in add_refs.
- A wrong claim: correct the wording so every claim is shown by code — never add what the code does not show.
- A claim nothing in this repository can show: say so in unresolvable — but only after you have searched for it. Grep the whole repository (config, CI workflows under .github, other parts of the code) and the installed source of any dependency it hinges on (grep with under: "node_modules/<pkg>" or the Python site-packages). Code explained elsewhere in the map is not unresolvable.
- Behaviour that only varies with the user's machine (an installed tool's version, what is on PATH) is not unresolvable when the code shows what it does: state what the code does.
- A flagged entry of lines (an arrow, step or message): find where it really happens and give that in lines; if it happens nowhere, give it an empty at.
- An issue flagged intended: if the code shows the behaviour is deliberate (a docstring or comment saying so, an explicit raise for misuse, standard language behaviour), drop it from issues. Keep it only if it really makes something go wrong for whoever hits it.
The detail must stay at most two sentences and 40 words. Finish by calling review.`;

const tooLong = (out: Review) => out.real.length && (words(out.detail) > 40 || sentences(out.detail) > 2);
const lengthError = (out: Review) => `The detail has ${words(out.detail)} words and ${sentences(out.detail)} sentences; the limit is 40 words and 2 sentences. Call review again.`;

/** The second reader: may read and grep the repository before ruling. */
async function review(n: Node, flags: string[], inv: Inventory, model: string): Promise<Review | null> {
  const known = new Set(inv.files.map((f) => f.path));
  const tools = [...TOOLS.filter((t) => t.name !== "submit"), REVIEW];
  const system = REVIEW_SYSTEM;
  const prompt = `## The node\n${claims(n)}\n\n## Claims a first reader flagged\n- ${flags.join("\n- ")}\n\n## The cited code\n${evidence(n, inv)}`;

  if (BACKEND === "claude-code") {
    const r = await converse<Review>({
      prompt, model, system, tools, stage: "verify-review", maxTurns: 10, nudge: "Finish by calling review.",
      handle: (name, input) => {
        if (name !== "review") return { content: runTool({ name, input }, inv, known) };
        const out = filled(input);
        return tooLong(out) ? { content: lengthError(out), isError: true } : { content: "Recorded. Stop now.", done: out };
      },
    });
    return r.value;
  }

  // The API path keeps its own loop: its requests are what the committed maps' caches replay.
  const messages: Message[] = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < 10; turn++) {
    const r = await invoke({ model, stage: "verify-review", effort: "medium", maxTokens: 8000, system, messages, tools });
    messages.push({ role: "assistant", content: r.content });
    const calls = callsOf(r);
    const done = calls.find((c) => c.name === "review");
    if (done) {
      const out = filled(done.input);
      if (tooLong(out) && turn < 9) {
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: done.id, is_error: true, content: lengthError(out) }] });
        continue;
      }
      return out;
    }
    if (!calls.length) { messages.push({ role: "user", content: "Finish by calling review." }); continue; }
    messages.push({ role: "user", content: calls.map((c): Block => ({ type: "tool_result", tool_use_id: c.id, content: runTool(c as { name: string; input: unknown }, inv, known) })) });
  }
  return null;
}

const REVIEWS = {
  ...REVIEW,
  description: "Your ruling on one node's flagged claims, and that node's corrected wording. Call it once per node shown.",
  input_schema: { ...REVIEW.input_schema, required: ["id", ...REVIEW.input_schema.required], properties: { id: { type: "string", description: "The node's id, as shown." }, ...REVIEW.input_schema.properties } },
};

/** Evidence a batch of reviews may carry, in characters, and nodes per batch. */
const REVIEW_CHARS = 80_000;
const REVIEW_NODES = 8;

/**
 * The second reader on many flagged nodes at once, for Claude Code: one
 * `claude -p` per node paid its own start-up and system prompt 83 times on
 * this repository's map, mostly to dismiss false alarms. The nodes of a batch
 * share one conversation, so a file read for one is already read for the
 * next. A node it leaves unruled is reviewed on its own (settle).
 */
async function reviewMany(items: { n: Node; flags: string[] }[], inv: Inventory, model: string): Promise<Map<string, Review>> {
  const known = new Set(inv.files.map((f) => f.path));
  const tools = [...TOOLS.filter((t) => t.name !== "submit"), REVIEWS];
  const parts = items.map(({ n, flags }) => ({ n, text: `# Node ${n.id}\n## The node\n${claims(n)}\n\n## Claims a first reader flagged\n- ${flags.join("\n- ")}\n\n## The cited code\n${evidence(n, inv)}` }));
  const batches: (typeof parts)[] = [];
  for (const p of parts) {
    const b = batches[batches.length - 1];
    if (b && b.length < REVIEW_NODES && b.reduce((a, x) => a + x.text.length, 0) + p.text.length <= REVIEW_CHARS) b.push(p);
    else batches.push([p]);
  }
  const out = new Map<string, Review>();
  await Promise.all(
    batches.map(async (b) => {
      // A batch of one is the single review, as it always was.
      if (b.length < 2) return;
      const ids = new Set(b.map((p) => p.n.id));
      const left = () => [...ids].filter((id) => !out.has(id));
      await converse<true>({
        prompt: `${b.map((p) => p.text).join("\n\n")}\n\nRule on every node above: call review once per node, with its id.`,
        model,
        system: `${REVIEW_SYSTEM} Several nodes are shown, each with its own flags and cited code; a file you read for one counts for all. Call review once for each node, by its id.`,
        tools,
        stage: "verify-review",
        maxTurns: 6 + 3 * b.length,
        nudge: "Continue: call review for every node shown that you have not ruled on yet.",
        handle: (name, input) => {
          if (name !== "review") return { content: runTool({ name, input }, inv, known) };
          const id = (input as { id?: string } | null)?.id ?? "";
          const r = filled(input);
          if (!ids.has(id)) return { content: `No node "${id}" here; the ids are ${[...ids].join(", ")}.`, isError: true };
          if (tooLong(r)) return { content: lengthError(r), isError: true };
          out.set(id, r);
          const rest = left();
          return rest.length ? { content: `Recorded ${id}. Still to rule on: ${rest.join(", ")}.` } : { content: "Recorded. Stop now.", done: true };
        },
      }).catch(() => null);
    }),
  );
  return out;
}

export async function verifyTree(root: Node, inv: Inventory, model: string): Promise<Verdict[]> {
  const nodes: Node[] = [];
  const walk = (n: Node) => { nodes.push(n); (n.children ?? []).forEach(walk); };
  walk(root);
  const cited = nodes.filter((n) => n.code?.length);
  const screens = BACKEND === "claude-code" ? await screenMany(cited, inv) : null;
  // Through Claude Code the flagged nodes are reviewed together; the API path
  // reviews each alone, as the committed maps' caches replay.
  const flagged = screens ? cited.flatMap((n) => { const s = screens.get(n.id); const flags = s ? flagsOf(s) : []; return flags.length ? [{ n, flags }] : []; }) : [];
  const reviewed = flagged.length ? await reviewMany(flagged, inv, model) : undefined;
  const verdicts = await Promise.all(
    nodes.map(async (n) =>
      n.code?.length
        ? settle(n, screens ? (screens.get(n.id) ?? null) : await screenOne(n, inv), inv, model, reviewed)
        : { id: n.id, ok: false, flagged: 0, rewritten: false, downgraded: false, claims: ["no code refs"] },
    ),
  );
  // After the review, which rewrites issues. The same problem told on a level and again on the part it is in: the part keeps it, where its line is.
  const below = (n: Node): Set<string> => new Set((n.children ?? []).flatMap((c) => [...(c.issues ?? []).flatMap((x) => (x.where ? [x.where] : [])), ...below(c)]));
  for (const n of nodes)
    if (n.issues?.length && n.children?.length) {
      const deeper = below(n);
      const kept = n.issues.filter((x) => !x.where || !deeper.has(x.where));
      n.issues = kept.length ? kept : undefined;
    }
  return verdicts;
}
