/**
 * Stage 2 — the top level: what someone does with this product, and which
 * files each of those things owns (D16, D33).
 *
 * The one call whose mistakes every later stage inherits, so it runs on the
 * strongest model available and its output is checked mechanically: every
 * source file must land in a root or be excluded with a reason. How the roots
 * connect is drawn later, from the code, by the overview (overview.ts).
 */

import { readFileSync } from "node:fs";
import { ask, type Message } from "./bedrock";
import { SUB_WORDS, words } from "./check";
import { isSource, type Inventory, type RepoFile } from "./inventory";
import { fit, oneLine, type FileSummary } from "./summarize";

export interface Root {
  id: string;
  prefix: string;
  title: string;
  sub: string;
  why: string;
  /** Repo paths; one ending in "/" claims everything under it. */
  files: string[];
}

export interface Cut {
  about: string;
  roots: Root[];
  excluded: { path: string; reason: string }[];
}

const TOOL = {
  name: "cut",
  description: "Record the top level of the map.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["about", "roots", "excluded"],
    properties: {
      about: { type: "string", description: "One sentence for the authors: what the top level is cut by and why that order. E.g. 'Cut by the life of one event — an organisation creates it, a student finds and joins it — after the two steps every account passes first.'" },
      roots: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "prefix", "title", "sub", "why", "files"],
          properties: {
            id: { type: "string", description: "kebab-case, short: 'sign-up', 'billing'." },
            prefix: { type: "string", description: "2-3 lowercase letters, unique per root; every node id under this root starts with '<prefix>-'." },
            title: { type: "string", description: "1-4 words, Title Case, everyday words." },
            sub: { type: "string", description: "At most 8 words, plainly: what someone does here. 'Add a repo and watch it get mapped.' Not a list of its parts. No file paths." },
            why: { type: "string", description: "One sentence for the author of this root: what it covers and where its boundary with the neighbouring roots is." },
            files: { type: "array", items: { type: "string" }, description: "Paths this root owns. A path ending in '/' claims every file under it. A shared file may appear in more than one root." },
          },
        },
      },
      excluded: {
        type: "array",
        description: "Source files or directories ('/'-terminated) deliberately left out of every root, each with a reason: generated, vendored, dead, or tooling with no logic of its own (a framework config). Shared code is never excluded; it goes in Foundations.",
        items: { type: "object", additionalProperties: false, required: ["path", "reason"], properties: { path: { type: "string" }, reason: { type: "string" } } },
      },
    },
  },
};

const INSTRUCTIONS = `Choose the top level of the map: 4 to 10 roots.

- Roots are what someone DOES with the product, in the order they do it — a journey, not a stack of layers. For a library, the someone is the caller.
- Title a journey root as the action, the way a user would say it: "Signing Up", "Writing A Post", "Making A Request" — not a layer or module name like "Authentication" or "Post Dashboard". Roots that are not steps may be nouns ("The Database").
- List the roots in the order someone meets them.
- Things that are not steps (the database, background jobs, admin tooling) may be roots of their own. Use them sparingly; fold infrastructure into the feature that uses it when only one feature does.
- Code that two or more features share — the data model and its types, shared state, utilities, a UI kit — goes in one last root titled "Foundations", never excluded and never parked in whichever feature happens to use it first. Every part of the repository must be explained somewhere a reader would look for it.
- Every source file listed must be in at least one root's files or in excluded. Use '/'-terminated directory paths to keep the list short when a whole directory belongs to one root.
- A root should own enough to explain in 2-3 levels and not so much that it can't: roughly 3-60 files.
- Ids are kebab-case; prefixes are 2-3 letters and unique.
Call the cut tool once.`;

/**
 * How much of the prompt the file listing may take, in characters (about 60k
 * tokens): the rest of the window holds the rules, the README, the reply,
 * every rejected round sent back, and through Claude Code its own system
 * prompt. One line per file overflows it past roughly 2,000 files; a larger
 * repository is folded by directory (fit). Kafka's 4,021 files were ~300k
 * tokens one per line.
 */
const LISTING_BUDGET = 220_000;

/** The roots that claim a path: an exact listing, else the longest directory claim. */
export function owners(cut: Cut, path: string): string[] {
  const exact = cut.roots.filter((r) => r.files.includes(path)).map((r) => r.id);
  if (exact.length) return exact;
  let best = -1;
  let ids: string[] = [];
  for (const r of cut.roots)
    for (const f of r.files)
      if (f.endsWith("/") && path.startsWith(f)) {
        if (f.length > best) { best = f.length; ids = [r.id]; }
        else if (f.length === best && !ids.includes(r.id)) ids.push(r.id);
      }
  return ids;
}

export const excludedBy = (cut: Cut, path: string) => cut.excluded.some((e) => e.path === path || (e.path.endsWith("/") && path.startsWith(e.path)));

/** Kinds of file that are the shape of the code, whatever uses them: never left out. */
const SHARED_KINDS = new Set(["types", "data-model", "state"]);

function problems(cut: Cut, inv: Inventory, sums: Record<string, FileSummary>): string[] {
  const out: string[] = [];
  const prefixes = new Set<string>();
  for (const r of cut.roots) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) out.push(`root id "${r.id}" is not kebab-case`);
    if (!/^[a-z]{2,3}$/.test(r.prefix) || prefixes.has(r.prefix)) out.push(`root ${r.id}: prefix "${r.prefix}" must be 2-3 lowercase letters and unique`);
    prefixes.add(r.prefix);
    if (r.title.split(/\s+/).length > 4) out.push(`root ${r.id}: title "${r.title}" has more than 4 words`);
    if (words(r.sub) > SUB_WORDS) out.push(`root ${r.id}: sub "${r.sub}" has more than ${SUB_WORDS} words`);
  }
  const missing = inv.files.filter((f) => isSource(f) && !owners(cut, f.path).length && !excludedBy(cut, f.path)).map((f) => f.path);
  if (missing.length) out.push(`${missing.length} source files are in no root and not excluded:\n${missing.slice(0, 300).join("\n")}`);
  // Imported from two roots, or the shape of the data: shared, so it belongs in Foundations.
  const importers = new Map<string, Set<string>>();
  for (const [from, tos] of Object.entries(inv.imports))
    for (const to of tos) for (const id of owners(cut, from)) importers.set(to, (importers.get(to) ?? new Set()).add(id));
  const shared = inv.files
    .filter((f) => isSource(f) && excludedBy(cut, f.path) && (SHARED_KINDS.has(sums[f.path]?.kind ?? "") || (importers.get(f.path)?.size ?? 0) >= 2))
    .map((f) => f.path);
  if (shared.length) out.push(`${shared.length} excluded files are shared code — the data model, state, or imported by two or more roots — and belong in Foundations, not excluded:\n${shared.slice(0, 100).join("\n")}`);
  return out;
}

export async function cutRepo(inv: Inventory, sums: Record<string, FileSummary>, model: string): Promise<{ cut: Cut; leftover: string[]; rejected: string[][] }> {
  // Only what bears on the cut: rules for writing a level change often, and
  // each change would otherwise re-cut every repository and rename its roots.
  const all = readFileSync("scripts/generate/prompts/rules.md", "utf8");
  const rules = all.slice(0, all.indexOf("## What a level shows"));
  // How many files import each: the shared code Foundations is for, seen rather than guessed from names.
  const fanIn = new Map<string, number>();
  for (const tos of Object.values(inv.imports)) for (const to of tos) fanIn.set(to, (fanIn.get(to) ?? 0) + 1);
  const listing = fit(
    inv.files.filter(isSource),
    sums,
    (f) => `${sums[f.path] ? oneLine(sums[f.path]) : `${f.path} (${f.lines} lines)`}${(fanIn.get(f.path) ?? 0) >= 3 ? ` · imported by ${fanIn.get(f.path)} files` : ""}`,
    LISTING_BUDGET,
  );
  const other = inv.files.filter((f) => (!f.code || f.test) && !f.outside).map((f) => f.path);
  const messages: Message[] = [
    {
      role: "user",
      content: [
        `# Repository: ${inv.name} @ ${inv.commit}`,
        `## README\n${inv.readme.slice(0, 12000) || "(none)"}`,
        ...(inv.scope ? [`## Scope\nThis map covers only part of the repository: ${inv.scope.paths.join(", ")}. Its reader: ${inv.scope.focus} Cut the roots by what that reader does with this part. Code outside the scope is not listed and needs no root.`] : []),
        `## Dependencies\n${inv.deps.join(", ") || "(none)"}`,
        listing.folded
          ? `## Source files (${inv.files.filter(isSource).length}), one line each where there was room\nThe repository is too large to list file by file, so its deepest directories are folded: a line ending in \`/ (N files …)\` stands for every file under that directory, with its largest few named. Claim a folded directory whole, by that \`/\`-terminated path or a parent's; a root of a repository this size will own far more than 60 files.\n${listing.text}`
          : `## Source files (${inv.files.filter(isSource).length}), one line each\n${listing.text}`,
        `## Other files (tests, config, docs, assets) — need no root\n${other.slice(0, 400).join("\n")}${other.length > 400 ? `\n… and ${other.length - 400} more` : ""}`,
        INSTRUCTIONS,
      ].join("\n\n"),
    },
  ];
  const system = [{ type: "text" as const, text: rules, cache_control: { type: "ephemeral" as const } }];

  let cut: Cut | null = null;
  // Each round sent back, with why: the audit's account of how the cut settled.
  const rejected: string[][] = [];
  for (let round = 0; round < 3; round++) {
    cut = await ask<Cut>({ model, stage: "cut", effort: "high", maxTokens: 32000, system, messages, tool: TOOL });
    const p = problems(cut, inv, sums);
    if (!p.length) return { cut, leftover: [], rejected };
    rejected.push(p);
    messages.push(
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(cut) }] },
      { role: "user", content: `That cut has problems. Fix them and call cut again with the complete corrected cut:\n- ${p.join("\n- ")}` },
    );
  }
  // Still uncovered after three rounds: recorded, not silently dropped.
  const leftover = inv.files.filter((f) => isSource(f) && !owners(cut!, f.path).length && !excludedBy(cut!, f.path)).map((f) => f.path);
  cut!.excluded.push(...leftover.map((path) => ({ path, reason: "left unassigned by the cut after three rounds" })));
  return { cut: cut!, leftover, rejected };
}

const covers = (claim: string, path: string) => claim === path || (claim.endsWith("/") && path.startsWith(claim));

/** Source files the cut neither gives a root nor excludes: code added since it was made. */
export const unclaimed = (cut: Cut, inv: Inventory) =>
  inv.files.filter((f) => isSource(f) && !owners(cut, f.path).length && !excludedBy(cut, f.path)).map((f) => f.path);

const PLACE_TOOL = {
  name: "place",
  description: "Place the new files in the map's top level.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["placed", "roots", "excluded"],
    properties: {
      placed: {
        type: "array",
        description: "Each new file and the root that takes it: an existing root's id, or the id of a root in `roots`. A path ending in '/' places every new file under it; claim a new directory whole when one root takes all of it.",
        items: { type: "object", additionalProperties: false, required: ["path", "root"], properties: { path: { type: "string" }, root: { type: "string" } } },
      },
      roots: {
        type: "array",
        description: "New roots, only for files that are a new thing someone does that no existing root covers. Usually empty.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "prefix", "title", "sub", "why"],
          properties: {
            id: TOOL.input_schema.properties.roots.items.properties.id,
            prefix: TOOL.input_schema.properties.roots.items.properties.prefix,
            title: TOOL.input_schema.properties.roots.items.properties.title,
            sub: TOOL.input_schema.properties.roots.items.properties.sub,
            why: TOOL.input_schema.properties.roots.items.properties.why,
          },
        },
      },
      excluded: TOOL.input_schema.properties.excluded,
    },
  },
};

interface Placement {
  placed: { path: string; root: string }[];
  roots: Omit<Root, "files">[];
  excluded: { path: string; reason: string }[];
}

/**
 * Code added since the cut was made, given a place in it without cutting
 * again: a new cut would rename the roots and redo every one of them, where
 * placing redoes only the roots that gain files and writes any new one.
 * Returns the cut with the files claimed, the existing roots that took some,
 * and the roots added.
 */
export async function place(
  cut: Cut,
  files: string[],
  inv: Inventory,
  sums: Record<string, FileSummary>,
  model: string,
): Promise<{ cut: Cut; gained: Map<string, string[]>; added: Root[] }> {
  const all = readFileSync("scripts/generate/prompts/rules.md", "utf8");
  const rules = all.slice(0, all.indexOf("## What a level shows"));
  const byPath = new Map(inv.files.map((f) => [f.path, f]));
  const dirs = new Set(files.map((p) => p.slice(0, p.lastIndexOf("/") + 1)));
  const messages: Message[] = [
    {
      role: "user",
      content: [
        `# Repository: ${inv.name} @ ${inv.commit}`,
        `## The map's top level — ${cut.about}\n${cut.roots
          .map((r) => `- ${r.id} (prefix ${r.prefix}): ${r.title} — ${r.sub}\n  ${r.why}\n  owns: ${r.files.slice(0, 25).join(", ")}${r.files.length > 25 ? `, … ${r.files.length - 25} more` : ""}`)
          .join("\n")}`,
        ((listed) => `## New source files (${files.length}), in no root yet${listed.folded ? "\nToo many to list one by one, so the deepest directories are folded into a line each; place a folded directory whole by its path ending in '/'." : ""}\n${listed.text}`)(
          fit(files.map((p) => byPath.get(p)).filter((f): f is RepoFile => !!f), sums, (f) => (sums[f.path] ? oneLine(sums[f.path]) : f.path), LISTING_BUDGET / 2),
        ),
        ((others) => `## Other files beside them (markup, styles, config) — a directory claim takes these too\n${others.slice(0, 400).join("\n") || "(none)"}${others.length > 400 ? `\n… and ${others.length - 400} more` : ""}`)(
          inv.files.filter((f) => !f.code && dirs.has(f.path.slice(0, f.path.lastIndexOf("/") + 1))).map((f) => f.path),
        ),
        `Give every new file a root. Put it in the existing root whose work it does — a file a feature uses goes with that feature, shared code in Foundations if there is one. Add a new root only for files that are a new thing someone does, which no root covers now: a new page, a new command, a new flow. Its id must not match an existing root's and its prefix must be new. Exclude only what a full cut would: generated, vendored, dead, or config with no logic of its own.
Call the place tool once.`,
      ].join("\n\n"),
    },
  ];
  const system = [{ type: "text" as const, text: rules, cache_control: { type: "ephemeral" as const } }];
  const taken = new Set(cut.roots.map((r) => r.prefix));
  const check = (p: Placement): string[] => {
    const out: string[] = [];
    const ids = new Set([...cut.roots.map((r) => r.id), ...p.roots.map((r) => r.id)]);
    const prefixes = new Set(taken);
    for (const r of p.roots) {
      if (cut.roots.some((x) => x.id === r.id)) out.push(`new root id "${r.id}" is already a root's`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) out.push(`root id "${r.id}" is not kebab-case`);
      if (!/^[a-z]{2,3}$/.test(r.prefix) || prefixes.has(r.prefix)) out.push(`root ${r.id}: prefix "${r.prefix}" must be 2-3 lowercase letters and unused`);
      prefixes.add(r.prefix);
      if (r.title.split(/\s+/).length > 4) out.push(`root ${r.id}: title "${r.title}" has more than 4 words`);
      if (words(r.sub) > SUB_WORDS) out.push(`root ${r.id}: sub "${r.sub}" has more than ${SUB_WORDS} words`);
    }
    for (const x of p.placed) if (!ids.has(x.root)) out.push(`${x.path}: no root "${x.root}"`);
    const missing = files.filter((f) => ![...p.placed, ...p.excluded].some((x) => covers(x.path, f)));
    if (missing.length) out.push(`${missing.length} new files are placed nowhere:\n${missing.slice(0, 200).join("\n")}${missing.length > 200 ? `\n… and ${missing.length - 200} more` : ""}`);
    return out;
  };

  let p: Placement = { placed: [], roots: [], excluded: [] };
  for (let round = 0; round < 2; round++) {
    p = await ask<Placement>({ model, stage: "place", effort: "medium", maxTokens: 8000, system, messages, tool: PLACE_TOOL });
    const wrong = check(p);
    if (!wrong.length) break;
    messages.push(
      { role: "assistant", content: [{ type: "text", text: JSON.stringify(p) }] },
      { role: "user", content: `That has problems. Fix them and call place again with every file:\n- ${wrong.join("\n- ")}` },
    );
  }

  // Applied as far as it holds: a bad new root or an unknown id leaves its
  // files excluded with the reason, never silently dropped.
  const next: Cut = structuredClone(cut);
  const added: Root[] = [];
  const prefixes = new Set(taken);
  for (const r of p.roots)
    if (!next.roots.some((x) => x.id === r.id) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id) && /^[a-z]{2,3}$/.test(r.prefix) && !prefixes.has(r.prefix)) {
      prefixes.add(r.prefix);
      const root = { ...r, files: [] };
      added.push(root);
      next.roots.push(root);
    }
  const gained = new Map<string, string[]>();
  const wanted = new Set(files);
  for (const x of p.placed) {
    const root = next.roots.find((r) => r.id === x.root);
    const mine = [...wanted].filter((f) => covers(x.path, f));
    if (!root || !mine.length) continue;
    if (!root.files.includes(x.path)) root.files.push(x.path);
    for (const f of mine) wanted.delete(f);
    if (!added.includes(root)) gained.set(root.id, [...(gained.get(root.id) ?? []), ...mine]);
  }
  for (const x of p.excluded) if ([...wanted].filter((f) => covers(x.path, f)).map((f) => wanted.delete(f)).length) next.excluded.push(x);
  next.excluded.push(...[...wanted].map((path) => ({ path, reason: "left unplaced when it was added to the map" })));
  // A new root nothing went into has nothing to explain.
  next.roots = next.roots.filter((r) => r.files.length || !added.includes(r));
  return { cut: next, gained, added: added.filter((r) => r.files.length) };
}
