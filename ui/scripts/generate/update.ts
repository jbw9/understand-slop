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
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { converse, runTool } from "./author";
import { bill, cacheIn, MODELS } from "./bedrock";
import { ccClose, type Handled } from "./claude-code";
import { check } from "./check";
import { owners, type Cut, type Root } from "./cut";
import { inventory, type Inventory } from "./inventory";
import { shapeProblems } from "./schema";
import { full, oneLine, summarize, type FileSummary } from "./summarize";
import { verifyTree } from "./verify";

/** A run of changed lines: `ol` old lines from `os` became `nl` new ones from `ns`. With `ol` 0, lines were inserted after `os`. */
interface Hunk {
  os: number;
  ol: number;
  ns: number;
  nl: number;
}

interface Change {
  path: string;
  before: string | null;
  after: string | null;
  hunks: Hunk[];
  /** For the agent: a unified diff with a little context. */
  diff: string;
}

const git = (repo: string, ...args: string[]) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/* ── 1. what changed ─────────────────────────────────────────── */

/** The text the map was made from, per path: null where the file did not exist. */
type Base = Record<string, string | null>;

function readText(path: string): string | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return buf.includes(0) ? null : buf.toString("utf8");
}

/** `git diff --no-index` between two texts, as hunks and as a readable diff. */
function diffOf(path: string, before: string | null, after: string | null): Pick<Change, "hunks" | "diff"> {
  const dir = mkdtempSync(join(tmpdir(), "slop-diff-"));
  try {
    const a = join(dir, "a");
    const b = join(dir, "b");
    writeFileSync(a, before ?? "");
    writeFileSync(b, after ?? "");
    const run = (u: number) => {
      try {
        return execFileSync("git", ["diff", "--no-index", "--no-color", `-U${u}`, a, b], { encoding: "utf8", maxBuffer: 64 << 20 });
      } catch (e: any) {
        // 1 means "they differ", which is the point.
        return String(e.stdout ?? "");
      }
    };
    const hunks = [...run(0).matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => ({
      os: Number(m[1]),
      ol: m[2] === undefined ? 1 : Number(m[2]),
      ns: Number(m[3]),
      nl: m[4] === undefined ? 1 : Number(m[4]),
    }));
    const body = run(3).split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
    return { hunks, diff: [`--- ${before === null ? "/dev/null" : `a/${path}`}`, `+++ ${after === null ? "/dev/null" : `b/${path}`}`, ...body].join("\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every file whose text differs from what the map last saw. */
function changes(repo: string, commit: string, base: Base): Change[] {
  const paths = new Set([
    ...git(repo, "diff", "--name-only", commit).split("\n"),
    ...git(repo, "ls-files", "--others", "--exclude-standard").split("\n"),
    ...Object.keys(base),
  ]);
  paths.delete("");
  const out: Change[] = [];
  for (const path of [...paths].sort()) {
    const before = path in base ? base[path] : hasAt(repo, commit, path) ? git(repo, "show", `${commit}:${path}`) : null;
    const after = readText(join(repo, path));
    if (before === after) continue;
    out.push({ path, before, after, ...diffOf(path, before, after) });
  }
  return out;
}

const hasAt = (repo: string, commit: string, path: string) => {
  try {
    execFileSync("git", ["-C", repo, "cat-file", "-e", `${commit}:${path}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/* ── 2. references ───────────────────────────────────────────── */

/** `path/to/file.ts:12` or `:12-30`, as issues, arrows and evidence cite code. */
const CITE = /([\w@.()[\]/+-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;

interface Span {
  file: string;
  s: number;
  e: number;
}

/**
 * A node's own references, not its children's: `{file, start, end}` code
 * refs, `{file, start, code}` quoted source, and `file:line` in any text.
 * With `move`, each is rewritten through it.
 */
function refs(n: Node, move?: (file: string, line: number) => number): Span[] {
  const out: Span[] = [];
  const visit = (v: any, parent?: any, key?: string | number) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, v, i));
    if (typeof v === "string" && parent !== undefined) {
      for (const m of v.matchAll(CITE)) out.push({ file: m[1], s: Number(m[2]), e: Number(m[3] ?? m[2]) });
      if (move)
        parent[key!] = v.replace(CITE, (_all, f: string, a: string, b?: string) =>
          b === undefined ? `${f}:${move(f, Number(a))}` : `${f}:${move(f, Number(a))}-${move(f, Number(b))}`,
        );
      return;
    }
    if (!v || typeof v !== "object") return;
    if (typeof v.file === "string" && Number.isInteger(v.start)) {
      const e = Number.isInteger(v.end) ? v.end : typeof v.code === "string" ? v.start + v.code.split("\n").length - 1 : v.start;
      out.push({ file: v.file, s: v.start, e });
      if (move) {
        if (Number.isInteger(v.end)) v.end = move(v.file, v.end);
        v.start = move(v.file, v.start);
      }
    }
    // Quoted source stays verbatim, whatever it happens to contain.
    for (const [k, x] of Object.entries(v)) if (k !== "children" && k !== "file" && !(k === "code" && typeof x === "string")) visit(x, v, k);
  };
  visit(n);
  return out;
}

/** Whether lines s..e (old numbering) saw a change. */
function touches(c: Change, s: number, e: number): boolean {
  if (c.after === null) return true;
  return c.hunks.some((h) => (h.ol > 0 ? h.os <= e && h.os + h.ol - 1 >= s : s <= h.os && h.os < e));
}

/** Where an old line is now, for a line no change landed on. */
function moved(c: Change, line: number): number {
  let d = 0;
  for (const h of c.hunks) if ((h.ol > 0 ? h.os + h.ol - 1 : h.os) < line) d += h.nl - h.ol;
  return Math.max(1, line + d);
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
function targets(map: MapFile, cut: Cut, byPath: Map<string, Change>, also: Placed[]): { picked: Placed[]; homeless: string[] } {
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
    if (covered.has(c.path) || c.after === null) continue;
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

function ids(n: Node, out = new Set<string>()): Set<string> {
  out.add(n.id);
  (n.children ?? []).forEach((c) => ids(c, out));
  return out;
}

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
  const mineIds = ids(t.node);
  const elsewhere = new Set([...map.AUTHORED.flatMap((r) => [...ids(r)])].filter((id) => !mineIds.has(id)));
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
    const problems = shapeProblems(node, root.prefix, t.path.length === 1);
    if (!problems.length) {
      const clash = [...ids(node)].filter((id) => elsewhere.has(id));
      if (clash.length) problems.push(...clash.map((id) => `${id}: already used elsewhere in the map`));
      else {
        // The whole root with this section in it, checked as a full run checks it.
        const whole = spliced(rootNode, t, node);
        const theirs = ids(node);
        problems.push(...check({ AUTHORED: [whole], E0: [], LINKS: [] }, inv.repo, { generated: true }).problems.filter((p) => [...theirs].some((id) => p.includes(id)) || p.startsWith("DUP")));
      }
    }
    say(`${t.node.id}: submit ${submits} — ${problems.length ? `${problems.length} problems` : "clean"}`);
    if (!problems.length) return { content: "Accepted. This section is done; stop now.", done: { node } };
    return { content: `Not accepted. Fix every one of these and submit the whole section again:\n- ${problems.slice(0, 80).join("\n- ")}`, isError: true };
  };
  const r = await converse<{ node: Node | Removed }>(brief(t, root, cut, inv, sums, mine, list, told), handle, model, "update", 30);
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
  const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
  const repo = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))!);
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
    const taken = args.includes("--dry-run") ? `${out}/turns.json` : `${out}/turns.taken.json`;
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
  const isCode = new Map(inv.files.map((f) => [f.path, f.code && !f.test]));
  const citedAnywhere = new Set(walk(map.AUTHORED).flatMap((p) => refs(p.node).map((r) => r.file)));
  // Only code the map covers or could: a lockfile or a test changing moves nothing.
  const found = changes(repo, map.RUN.commit, base).filter((c) => (c.after === null ? citedAnywhere.has(c.path) : isCode.get(c.path)));
  console.log(`${found.length} changed code files${found.length ? `: ${found.map((c) => c.path).join(", ")}` : ""}`);
  if (!found.length && !wrong.size) {
    result({ ok: true, changed: [], sections: [], unmatched });
    return;
  }
  const byPath = new Map(found.map((c) => [c.path, c]));

  // Which sections, read off the references as they were; then every
  // reference moves to where its code is now.
  const { picked, homeless } = targets(map, cut, byPath, [...wrong.keys()]);
  for (const p of walk(map.AUTHORED)) refs(p.node, (f, line) => (byPath.has(f) ? moved(byPath.get(f)!, line) : line));
  console.log(`${picked.length} sections to redo: ${picked.map((p) => p.node.id).join(", ")}`);
  // A section redone takes the notes on it and on anything inside it.
  const notesFor = (t: Placed) => [...wrong].filter(([p]) => p.path.includes(t.node)).flatMap(([p, n]) => n.map((x) => (p === t ? x : `${p.node.title}: ${x}`)));
  if (args.includes("--dry-run")) {
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
  const done = await Promise.all(picked.map(async (t) => ({ t, node: await redo(t, map, cut, inv, sums, byPath, { account: said, notes: notesFor(t) }, model, say) })));
  const failed: string[] = [];
  const removed: string[] = [];
  for (const { t, node } of done) {
    const at = t.path.length === 1 ? null : t.path[t.path.length - 2];
    const siblings = at ? at.children! : map.AUTHORED;
    const i = siblings.findIndex((c) => c.id === t.node.id);
    if (node && isRemoved(node)) {
      siblings.splice(i, 1);
      removed.push(t.node.id);
      // A root goes with the lines drawn to it.
      if (!at) {
        map.E0 = map.E0.filter((e) => e.from !== t.node.id && e.to !== t.node.id);
        map.LINKS = map.LINKS.filter((l) => !l.from.startsWith(`${t.node.id}:`) && !l.to.startsWith(`${t.node.id}:`));
      }
      say(`${t.node.id}: removed`);
    } else if (node) {
      await verifyTree(node, inv, model);
      siblings[i] = { ...node, col: t.node.col, row: t.node.row };
      say(`${t.node.id}: updated`);
    } else {
      failed.push(t.node.id);
      siblings[i] = { ...t.node, state: "partial", unsure: "This section was due an update — its code changed, or it was found wrong — and the update failed; parts of it may be out of date." };
      say(`${t.node.id}: FAILED, kept as it was`);
    }
  }

  const final = check(map, repo, { generated: true });
  writeFileSync(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
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
