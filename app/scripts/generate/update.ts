/**
 * Keeping a map up with its code, a few sections at a time.
 *
 * A full run maps a checkout once. After that, code moves: an agent edits a
 * file, a user saves one. An update finds what changed since the map last
 * looked, and redoes only the sections it touches:
 *
 *   1. What changed: every file whose text differs from what the map was made
 *      from — the map's commit, or the copy this kept at the last update
 *      (<out>/base.json), new and deleted files included.
 *   2. Every line reference in the map moves with the code (a ref below an
 *      inserted line shifts down), so the sections left alone stay true.
 *   3. The sections touched: the deepest ones whose own references overlap a
 *      changed line. A change no reference covers goes to the section nearest
 *      it in that file, or, for a new file, in its root's directory.
 *   4. One agent per touched section rewrites it, seeing the diff and the old
 *      section, able to read only the changed files, what they import and
 *      what imports them, and the files the section already cites. It is
 *      checked as a full run's root is, then verified.
 *   5. The sections go back in place. One that could not be redone stays, its
 *      references moved, marked partial with the reason; one whose code is
 *      gone is taken out.
 *
 * The coding agent's turns that asked for the update wait in
 * <out>/turns.json (lib/vault.ts). Each brings its transcript — what the
 * agent did and why, so a fix or a deletion is redone knowing it was one —
 * and the sections it reported wrong with slop-map-fix, which are redone
 * with its notes even where no code changed.
 *
 * Writes <out>/map.json, <out>/base.json, <out>/update.json (what this run
 * did, read by the app) and adds the run to <out>/report.json's `updates`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- model tool inputs */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { parseArgs } from "./args";
import { converse, runTool } from "./author";
import { changes, moved, refs, touches, type Base, type Change } from "./gitdiff";
import { bill, cacheIn, MODELS } from "./bedrock";
import { ccClose, type Handled } from "./claude-code";
import { check } from "./check";
import { owners, type Cut, type Root } from "./cut";
import { inventory, isSource, type Inventory } from "./inventory";
import { idsOf, submitProblems } from "./schema";
import { full, oneLine, summarize, type FileSummary } from "./summarize";
import { verifyTree } from "./verify";

/** Written whole and renamed into place, so the open map never reads half a file. */
function atomic(path: string, body: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

/* ── 3. which sections ───────────────────────────────────────── */

interface Placed {
  node: Node;
  /** Root first, the node last. */
  path: Node[];
}

function walk(roots: Node[]): Placed[] {
  const out: Placed[] = [];
  const go = (n: Node, up: Node[]) => {
    const path = [...up, n];
    out.push({ node: n, path });
    for (const c of n.children ?? []) go(c, path);
  };
  roots.forEach((r) => go(r, []));
  return out;
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
const shared = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i).lastIndexOf("/") + 1;
};

/** The sections to redo — the ones the code changes touch, and `also` — and the changed files no section could take. */
function targets(map: MapFile, cut: Cut, byPath: Map<string, Change>, also: Placed[], isCode: (path: string) => boolean): { picked: Placed[]; homeless: string[] } {
  const all = walk(map.AUTHORED);
  const picked = new Set<Placed>(also.map((a) => all.find((p) => p.node === a.node)!).filter(Boolean));
  const covered = new Set<string>();
  for (const p of all)
    for (const r of refs(p.node)) {
      const c = byPath.get(r.file);
      if (c && touches(c, r.s, r.e)) {
        picked.add(p);
        covered.add(c.path);
      }
    }
  const homeless: string[] = [];
  for (const c of byPath.values()) {
    // A doc edited away from every passage cited from it only moves those
    // passages' lines: adding a decision to a long log redoes nothing.
    if (covered.has(c.path) || c.after === null || !isCode(c.path)) continue;
    // The section citing this file nearest the first change; deeper wins a tie.
    const at = c.hunks[0]?.os ?? 1;
    let best: { p: Placed; d: number } | null = null;
    for (const p of all)
      for (const r of refs(p.node))
        if (r.file === c.path) {
          const d = Math.min(Math.abs(r.s - at), Math.abs(r.e - at));
          if (!best || d < best.d || (d === best.d && p.path.length > best.p.path.length)) best = { p, d };
        }
    if (!best) {
      // A file no section cites: the section of its root that cites the most
      // of its directory, else the root itself.
      const root = owners(cut, c.path).map((id) => all.find((p) => p.node.id === id && p.path.length === 1)).find(Boolean);
      if (!root) {
        homeless.push(c.path);
        continue;
      }
      let near = { p: root, d: 0 };
      for (const p of all)
        if (p.path[0] === root.node)
          for (const r of refs(p.node)) {
            const d = shared(dirOf(r.file), dirOf(c.path));
            if (d > near.d || (d === near.d && d > 0 && p.path.length > near.p.path.length)) near = { p, d };
          }
      best = { p: near.p, d: 0 };
    }
    picked.add(best.p);
  }
  // A section inside another being redone goes with it.
  const list = [...picked];
  return { picked: list.filter((p) => !list.some((q) => q !== p && p.path.includes(q.node))), homeless };
}

/* ── the agent's turns ───────────────────────────────────────── */

/** A turn of the coding agent's that asked for this update (lib/vault.ts). */
interface Turn {
  transcript?: string;
  corrections: { section: string; note: string }[];
}

/**
 * What the agent did in its last `n` turns of a session, in its own words:
 * what it was asked, the files it changed and the commands it ran, and what
 * it said — the end of it kept, where it sums up. Read from Claude Code's
 * transcript.
 */
function account(transcript: string, n: number): string {
  let entries: any[];
  try {
    entries = readFileSync(transcript, "utf8").split("\n").filter(Boolean).flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
  } catch {
    return "";
  }
  const content = (e: any) => e?.message?.content;
  // A prompt the user typed, not a tool's result coming back.
  const asked = (e: any) =>
    e.type === "user" && !e.isMeta && (typeof content(e) === "string" || (Array.isArray(content(e)) && !content(e).some((b: any) => b.type === "tool_result")));
  const starts = entries.flatMap((e, i) => (asked(e) ? [i] : []));
  const from = starts[Math.max(0, starts.length - n)] ?? 0;
  const lines: string[] = [];
  let said = "";
  for (const e of entries.slice(from)) {
    const c = content(e);
    if (asked(e)) lines.push(`Asked: ${(typeof c === "string" ? c : c.map((b: any) => b.text ?? "").join(" ")).slice(0, 400)}`);
    if (e.type !== "assistant" || !Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === "text") said = b.text;
      if (b.type !== "tool_use") continue;
      const i = b.input ?? {};
      if (i.file_path) lines.push(`${b.name} ${i.file_path}`);
      else if (b.name === "Bash" && i.command) lines.push(`Ran: ${String(i.command).slice(0, 160)}`);
    }
  }
  const head = [...new Set(lines)].join("\n").slice(0, 2500);
  return `${head}\nIt said, last:\n${said.slice(-2500)}`;
}

/** The section a correction names: by id, by title, or by the end of a "A › B" trail. */
function named(map: MapFile, name: string): Placed | null {
  const all = walk(map.AUTHORED);
  const want = name.trim().toLowerCase();
  const last = want.split("›").pop()!.trim();
  return (
    all.find((p) => p.node.id.toLowerCase() === want) ??
    all.find((p) => p.path.map((n) => n.title.toLowerCase()).join(" › ") === want) ??
    all.find((p) => p.node.title.toLowerCase() === want) ??
    all.find((p) => p.node.title.toLowerCase() === last) ??
    null
  );
}

/* ── 4. redoing one ──────────────────────────────────────────── */

function brief(t: Placed, root: Root, cut: Cut, inv: Inventory, sums: Record<string, FileSummary>, mine: Change[], reach: string[], told: Told): string {
  const trail = t.path.map((n) => n.title).join(" › ");
  const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (cut at ${n} characters)` : s);
  return [
    `# Repository: ${inv.name} @ ${inv.commit}, with uncommitted changes`,
    `## The whole map's top level — ${cut.about}\n${cut.roots.map((r) => `- ${r.id}: ${r.title} — ${r.sub}`).join("\n")}`,
    `## The section to update\n${trail}\nIt sits in the root "${root.title}"; every id under that root starts with "${root.prefix}-".`,
    told.account ? `## What the coding agent did, in its own words\n${told.account}` : "",
    mine.length ? `## What changed in the code\n${mine.map((c) => "```diff\n" + cap(c.diff, 12000) + "\n```").join("\n\n")}` : "## The code under this section did not change",
    told.notes.length
      ? `## Where the coding agent found this section wrong\nIt read the code and reported:\n${told.notes.map((n) => `- ${n}`).join("\n")}\nCheck each against the code yourself; correct what it is right about.`
      : "",
    `## The section as the map has it now\nLine references are already moved to where that code is now; the ones on changed lines may be off.\n\`\`\`json\n${JSON.stringify(t.node, null, 1)}\n\`\`\``,
    `## Files you can read (${reach.length}) — the changed files, what they import and what imports them, and the files this section cites\n${reach.map((p) => (sums[p] ? (mine.some((c) => c.path === p) ? full(sums[p]) : oneLine(sums[p])) : p)).join("\n")}`,
    `## Task
The code under this section changed, or the coding agent found the section wrong. Update the section so it is true of the code as it is now, and submit it whole, with its full subtree.
- Keep what is still true as it is: the same id for this section ("${t.node.id}"), the same ids, titles and wording for children that still describe real code. Change what the diff makes wrong, add what it adds, remove what it removes.
- Problems (\`issues\`, and \`alarm\`/\`unsure\` where they name one) are part of this: read the code each one points at again. Drop one the change fixed, rewrite one it changed, add one it introduced. Keep only what the code still does wrong.
- Every line reference must point at the code as it is now: read the changed ranges before citing them.
- New ids start with "${root.prefix}-" and must not reuse an id from elsewhere in the map.
- Only the files listed above can be read or searched.
- If the code this section describes is gone altogether, submit \`{ "id": "${t.node.id}", "removed": true }\` instead, and the section is taken out.
Budget: about 15 tool calls before you submit.`,
  ].filter(Boolean).join("\n\n");
}

async function redo(
  t: Placed,
  map: MapFile,
  cut: Cut,
  inv: Inventory,
  sums: Record<string, FileSummary>,
  byPath: Map<string, Change>,
  told: Told,
  model: string,
  say: (s: string) => void,
): Promise<Node | Removed | null> {
  const rootNode = t.path[0];
  const root = cut.roots.find((r) => r.id === rootNode.id);
  if (!root) return null;
  const cited = new Set(walk([t.node]).flatMap((p) => refs(p.node).map((r) => r.file)));
  const mine = [...byPath.values()].filter((c) => cited.has(c.path) || owners(cut, c.path).includes(root.id));
  const reach = new Set<string>();
  for (const c of mine) {
    reach.add(c.path);
    for (const to of inv.imports[c.path] ?? []) reach.add(to);
    for (const [from, tos] of Object.entries(inv.imports)) if (tos.includes(c.path)) reach.add(from);
  }
  for (const f of cited) reach.add(f);
  const known = new Set(inv.files.map((f) => f.path).filter((p) => reach.has(p)));
  const list = [...known].sort();
  // Ids taken outside this section, which a new one may not reuse.
  const mineIds = idsOf(t.node);
  const elsewhere = new Set([...map.AUTHORED.flatMap((r) => [...idsOf(r)])].filter((id) => !mineIds.has(id)));
  let submits = 0;
  const handle = (name: string, input: any): Handled => {
    if (name !== "submit") return { content: runTool({ name, input }, inv, known, list) };
    submits++;
    const node = input?.root;
    if (node?.removed === true) {
      say(`${t.node.id}: submit ${submits} — removed`);
      return { content: "Accepted: the section is taken out. Stop now.", done: { node: { id: t.node.id, removed: true } } };
    }
    if (node && typeof node === "object") node.id = t.node.id;
    // The whole root with this section in it, checked as a full run checks it.
    const problems = submitProblems(node, root.prefix, inv.repo, { isRoot: t.path.length === 1, taken: elsewhere, within: (n) => spliced(rootNode, t, n) });
    say(`${t.node.id}: submit ${submits} — ${problems.length ? `${problems.length} problems` : "clean"}`);
    if (!problems.length) return { content: "Accepted. This section is done; stop now.", done: { node } };
    return { content: `Not accepted. Fix every one of these and submit the whole section again:\n- ${problems.slice(0, 80).join("\n- ")}`, isError: true };
  };
  const r = await converse<{ node: Node | Removed }>({ prompt: brief(t, root, cut, inv, sums, mine, list, told), handle, model, stage: "update", maxTurns: 30 });
  return r.value?.node ?? null;
}

/** What redo is told beyond the code: the agent's account of its turns, and its notes on this section. */
interface Told {
  account: string;
  notes: string[];
}

/** A section whose code is gone. */
interface Removed {
  id: string;
  removed: true;
}
const isRemoved = (n: Node | Removed): n is Removed => "removed" in n && n.removed === true;

/** `root` with the section at `t` replaced by `node`; `root` itself is left alone. */
function spliced(root: Node, t: Placed, node: Node): Node {
  if (t.path.length === 1) return { ...node, col: root.col, row: root.row };
  const copy = structuredClone(root);
  let at: Node = copy;
  for (const step of t.path.slice(1, -1)) at = at.children!.find((c) => c.id === step.id)!;
  at.children = at.children!.map((c) => (c.id === t.node.id ? { ...node, col: c.col, row: c.row } : c));
  return copy;
}

/* ── the run ─────────────────────────────────────────────────── */

export async function update(args: string[]) {
  const { opt, has, repo: dir } = parseArgs(args);
  const repo = resolve(dir!);
  const out = opt("--out") ?? `maps/${opt("--name") ?? repo.split("/").pop()!.toLowerCase()}`;
  const t0 = Date.now();
  const result = (r: Record<string, unknown>) =>
    writeFileSync(`${out}/update.json`, JSON.stringify({ finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), ...r }, null, 1) + "\n");

  if (!existsSync(`${out}/map.json`) || !existsSync(`${out}/.cache/cut.json`)) {
    result({ ok: false, error: "This map has no cut to update from; regenerate it." });
    process.exitCode = 1;
    return;
  }
  const map: MapFile = JSON.parse(readFileSync(`${out}/map.json`, "utf8"));
  const cut: Cut = JSON.parse(readFileSync(`${out}/.cache/cut.json`, "utf8"));
  const base: Base = existsSync(`${out}/base.json`) ? JSON.parse(readFileSync(`${out}/base.json`, "utf8")) : {};
  cacheIn(`${out}/.cache`);
  const model = MODELS[(process.env.SLOP_UPDATE ?? process.env.SLOP_AUTHOR ?? "opus") as keyof typeof MODELS] ?? MODELS.opus;

  // The turns that asked for this, taken so a run after this one gets only newer ones.
  let turns: Turn[] = [];
  if (existsSync(`${out}/turns.json`)) {
    // A dry run only looks.
    const taken = has("--dry-run") ? `${out}/turns.json` : `${out}/turns.taken.json`;
    if (taken !== `${out}/turns.json`) renameSync(`${out}/turns.json`, taken);
    turns = JSON.parse(readFileSync(taken, "utf8"));
    if (taken !== `${out}/turns.json`) rmSync(taken);
  }
  const sessions = new Map<string, number>();
  for (const t of turns) if (t.transcript) sessions.set(t.transcript, (sessions.get(t.transcript) ?? 0) + 1);
  const said = [...sessions].map(([f, n]) => account(f, n)).filter(Boolean).join("\n\n").slice(-6000);
  const corrections = turns.flatMap((t) => t.corrections ?? []);
  const wrong = new Map<Placed, string[]>();
  const unmatched: string[] = [];
  for (const c of corrections) {
    const p = named(map, c.section);
    if (!p) unmatched.push(c.section);
    else wrong.set(p, [...(wrong.get(p) ?? []), c.note]);
  }
  if (corrections.length) console.log(`${corrections.length} corrections from the agent${unmatched.length ? `; no section named ${unmatched.join(", ")}` : ""}`);

  const inv = inventory(repo, { untracked: true });
  const isCode = new Map(inv.files.map((f) => [f.path, isSource(f)]));
  const citedAnywhere = new Set(walk(map.AUTHORED).flatMap((p) => refs(p.node).map((r) => r.file)));
  // Only code the map covers or could, and docs it cites: a lockfile or a test changing moves nothing.
  const found = changes(repo, map.RUN.commit, base).filter((c) => (c.after === null ? citedAnywhere.has(c.path) : isCode.get(c.path) || citedAnywhere.has(c.path)));
  console.log(`${found.length} changed code files${found.length ? `: ${found.map((c) => c.path).join(", ")}` : ""}`);
  if (!found.length && !wrong.size) {
    result({ ok: true, changed: [], sections: [], unmatched });
    return;
  }
  const byPath = new Map(found.map((c) => [c.path, c]));

  // Which sections, read off the references as they were; then every
  // reference moves to where its code is now.
  const { picked, homeless } = targets(map, cut, byPath, [...wrong.keys()], (p) => Boolean(isCode.get(p)));
  for (const p of walk(map.AUTHORED)) refs(p.node, (f, line) => (byPath.has(f) ? moved(byPath.get(f)!, line) : line));
  console.log(`${picked.length} sections to redo: ${picked.map((p) => p.node.id).join(", ")}`);
  // A section redone takes the notes on it and on anything inside it.
  const notesFor = (t: Placed) => [...wrong].filter(([p]) => p.path.includes(t.node)).flatMap(([p, n]) => n.map((x) => (p === t ? x : `${p.node.title}: ${x}`)));
  if (has("--dry-run")) {
    for (const p of picked) console.log(`  ${p.path.map((n) => n.id).join(" › ")}${notesFor(p).length ? ` — notes: ${notesFor(p).join(" | ")}` : ""}`);
    if (said) console.log(`the agent's account:\n${said}`);
    if (homeless.length) console.log(`  no section can take: ${homeless.join(", ")}`);
    const after = check(map, repo, { generated: true }).problems;
    console.log(`references moved: ${after.length} check problems`);
    after.slice(0, 10).forEach((p) => console.log(`  ${p}`));
    return;
  }

  const sums = await summarize(inv, () => {});
  const say = (s: string) => console.log(`  ${s}`);
  const failed: string[] = [];
  const removed: string[] = [];
  // Each section goes into the map the moment it is redone, and the map is
  // written then, so the open page shows it while the others are still being
  // worked on (components/map-context.tsx). The sections are redone
  // concurrently, but each one is spliced in without an await in between, so
  // no write ever sees half of one.
  const done: { t: Placed; node: Awaited<ReturnType<typeof redo>> }[] = new Array(picked.length);
  const land = (t: Placed, node: Awaited<ReturnType<typeof redo>>) => {
    done[picked.indexOf(t)] = { t, node };
    const at = t.path.length === 1 ? null : t.path[t.path.length - 2];
    const siblings = at ? at.children! : map.AUTHORED;
    const i = siblings.findIndex((c) => c.id === t.node.id);
    if (node && isRemoved(node)) {
      siblings.splice(i, 1);
      removed.push(t.node.id);
      // A root goes with the lines drawn to it.
      if (!at) {
        const pic = map.OVERVIEW?.anatomy?.find((b) => b.kind === "diagram");
        if (pic?.kind === "diagram") {
          const gone = new Set(pic.boxes.filter((x) => x.opens === t.node.id).map((x) => x.id));
          pic.boxes = pic.boxes.filter((x) => !gone.has(x.id));
          pic.arrows = pic.arrows.filter((x) => !gone.has(x.from) && !gone.has(x.to));
        }
        map.LINKS = map.LINKS.filter((l) => !l.from.startsWith(`${t.node.id}:`) && !l.to.startsWith(`${t.node.id}:`));
      }
      say(`${t.node.id}: removed`);
    } else if (node) {
      siblings[i] = { ...node, col: t.node.col, row: t.node.row };
      say(`${t.node.id}: updated`);
    } else {
      failed.push(t.node.id);
      siblings[i] = { ...t.node, state: "partial", unsure: "This section was due an update — its code changed, or it was found wrong — and the update failed; parts of it may be out of date." };
      say(`${t.node.id}: FAILED, kept as it was`);
    }
    atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  };
  await Promise.all(
    picked.map(async (t) => {
      const node = await redo(t, map, cut, inv, sums, byPath, { account: said, notes: notesFor(t) }, model, say);
      if (node && !isRemoved(node)) await verifyTree(node, inv, model);
      land(t, node);
    }),
  );

  const final = check(map, repo, { generated: true });
  atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  // The map now describes these files as they are: the next update starts here.
  for (const c of found) base[c.path] = c.after;
  writeFileSync(`${out}/base.json`, JSON.stringify(base) + "\n");

  const usd = Math.round(Object.values(bill).reduce((a, b) => a + b.usd, 0) * 100) / 100;
  const sections = done.map(({ t, node }) => ({ id: t.node.id, title: node && !isRemoved(node) ? node.title : t.node.title, ok: Boolean(node), removed: removed.includes(t.node.id) }));
  result({ ok: !failed.length, changed: found.map((c) => c.path), sections, homeless, unmatched, corrected: [...wrong.keys()].map((p) => p.node.id), usd, problems: final.problems.slice(0, 20), ...(failed.length ? { error: `Could not update ${failed.join(", ")}` } : {}) });
  if (existsSync(`${out}/report.json`)) {
    const report = JSON.parse(readFileSync(`${out}/report.json`, "utf8"));
    report.updates = [...(report.updates ?? []), { at: new Date().toISOString(), changed: found.map((c) => c.path), sections: sections.map((s) => s.id), failed, seconds: Math.round((Date.now() - t0) / 1000), usd }];
    writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1) + "\n");
  }
  console.log(`\n${out}/map.json — ${sections.length - failed.length}/${sections.length} sections updated, ${final.problems.length} check problems, $${usd}`);
  await ccClose();
}
