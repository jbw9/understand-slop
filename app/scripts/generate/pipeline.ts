/**
 * The whole generator, stage by stage. Lives in a .ts module rather than the
 * .mts entry point so every stage shares one instance of bedrock.ts: tsx loads
 * .mts as ESM and .ts as CommonJS, and two instances meant the cache and the
 * bill were set in one and read from the other.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Node, Run } from "@/lib/data";
import type { MapFile, Overview } from "@/lib/map";
import type { Progress } from "@/lib/vault";
import { parseArgs } from "./args";
import { auditMarkdown } from "./audit";
import { coverage } from "@/lib/coverage";
import { authorRoot, authorSplit, inParts, submitLine, tooBig, type Authored, type OnSubmit } from "./author";
import { catalogOf } from "./catalog";
import { BACKEND, bill, MODELS, cacheIn, sweepCache, throttle } from "./bedrock";
import { ccClose, type Turn } from "./claude-code";
import { deepOverview, deepRoot } from "./deep";
import { fastMap } from "./fast";
import { arrowStats, check, dedupeIssues, EXPLAIN_LEVEL, OVERVIEW_ID } from "./check";
import { cutRepo, place, unclaimed, type Cut } from "./cut";
import { activeGraph, buildGraph, setGraph, withSummaries } from "./graph";
import { inventory, isSource, scopeTo, type Inventory } from "./inventory";
import { overviewOf, toOverview, type Overviewed } from "./overview";
import { shapeProblems } from "./schema";
import { summarize, type FileSummary } from "./summarize";

/** Written whole and renamed into place, so the app never parses half a file. */
function atomic(path: string, body: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

/** A cut as cached before D60 carried edges between roots; the overview draws those now. */
function withoutEdges(cut: Cut & { edges?: unknown }): Cut {
  delete cut.edges;
  return cut;
}

/**
 * The overview of a finished map, drawn again from the code: for a map made
 * before D60, whose top level was the cut's uncited path, or one whose roots
 * moved. The cut is the cached one when there is one; otherwise each root owns
 * the files its own levels cite, which is all the overview reads it for.
 */
async function redraw(out: string, inv: ReturnType<typeof inventory>, model: string) {
  const map: MapFile = JSON.parse(readFileSync(`${out}/map.json`, "utf8"));
  const cited = (n: Node): string[] => [...(n.code ?? []).map((c) => c.file), ...(n.children ?? []).flatMap(cited)];
  const cut: Cut = existsSync(`${out}/.cache/cut.json`)
    ? withoutEdges(JSON.parse(readFileSync(`${out}/.cache/cut.json`, "utf8")))
    : { about: "", excluded: [], roots: map.AUTHORED.map((r) => ({ id: r.id, prefix: "", title: r.title, sub: r.sub, why: "", files: [...new Set(cited(r))] })) };
  const problems = await redrawOverview(map, cut, inv, model);
  if (!problems) atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  console.log(`${out}/map.json — overview ${problems ? `not accepted: ${problems.slice(0, 5).join("; ")}` : "redrawn"}, $${Object.values(bill).reduce((a, b) => a + b.usd, 0).toFixed(2)}`);
  await ccClose();
}

/** Draws `map`'s top level again from its roots as they are, in place; the checker's last word if it was not accepted. */
export async function redrawOverview(map: MapFile, cut: Cut, inv: Inventory, model: string, sums: Record<string, FileSummary> = {}): Promise<string[] | null> {
  const drawn = await overviewOf(map.AUTHORED, cut, inv, model, (n, problems) => console.log(`  overview: submit ${n} — ${problems ? `${problems} problems` : "clean"}`), sums);
  if (!drawn.overview) return drawn.problems;
  const node = { ...drawn.overview, id: OVERVIEW_ID, title: "Overview", sub: drawn.overview.sub ?? "", col: 0, row: 0 };
  const top = toOverview(node);
  if (EXPLAIN_LEVEL === "none") for (const k of ["explain", "glossary"] as const) delete top[k];
  map.OVERVIEW = top;
  return null;
}

export type RootStatus = Progress["roots"][number]["status"];

/**
 * A map asked to explain nothing (D70) keeps nothing explained: the types the
 * authors read describe `explain`, and measured, they wrote it on half the
 * levels unasked.
 */
export function plain(n: Node): Node {
  if (EXPLAIN_LEVEL !== "none") return n;
  const out = { ...n, ...(n.children ? { children: n.children.map(plain) } : {}) };
  delete out.explain;
  return out;
}

/** Seconds, to one decimal. */
const tenths = (x: number) => Math.round(x * 10) / 10;

/**
 * Where one agent's time went, from its timed replies: waiting (tool calls,
 * Claude Code's overhead, reading context), thinking, writing; and how much
 * of it came before its first whole submit and after, in repairs.
 */
function spanOf(log: Turn[]) {
  const sum = (f: (t: Turn) => number, ts = log) => tenths(ts.reduce((a, t) => a + f(t), 0));
  const all = (t: Turn) => t.wait + t.think + t.write;
  const first = log.findIndex((t) => t.did.includes("submit"));
  return {
    turns: log.length,
    seconds: sum(all),
    wait: sum((t) => t.wait),
    think: sum((t) => t.think),
    write: sum((t) => t.write),
    out: sum((t) => t.out),
    thinking: sum((t) => t.thinking),
    toFirstSubmit: first < 0 ? null : sum(all, log.slice(0, first + 1)),
    repairTurns: first < 0 ? 0 : log.length - first - 1,
  };
}

/** A root's timing: one agent's span, or a split root's cut into parts, the parts (run side by side), and its join. */
function timingOf(log: Turn[]) {
  if (!log.some((t) => t.part)) return spanOf(log);
  const parts: Record<string, Turn[]> = {};
  for (const t of log) (parts[t.part!] ??= []).push(t);
  const spans = Object.fromEntries(Object.entries(parts).map(([k, ts]) => [k, spanOf(ts)]));
  // The cut, then the parts side by side, then the join: one after another.
  const { join, cut, ...rest } = spans;
  const wall = tenths((cut?.seconds ?? 0) + Math.max(0, ...Object.values(rest).map((x) => x.seconds)) + (join?.seconds ?? 0));
  return { ...spanOf(log), wall, parts: spans };
}

export async function main(args: string[]) {
  const { opt, has, repo: dir } = parseArgs(args);

  const repo = resolve(dir!);
  const inv = inventory(repo);
  const name = opt("--name") ?? inv.name.toLowerCase();
  // --scope maps part of a large repo; the rest stays readable to the authors.
  const scope = opt("--scope")?.split(",");
  if (scope) scopeTo(inv, { paths: scope, focus: opt("--focus") ?? "" });
  const only = opt("--roots")?.split(",");
  const stopAfter = opt("--stop-after");
  const pick = (env: string | undefined, fallback: keyof typeof MODELS = "opus") => MODELS[(env ?? fallback) as keyof typeof MODELS] ?? MODELS[fallback];
  // The parts of a split root draw a bounded piece against a set brief; Sonnet does that at a fraction of Opus.
  const models = {
    summarize: MODELS.haiku,
    cut: pick(process.env.SLOP_CUT),
    author: pick(process.env.SLOP_AUTHOR),
    part: pick(process.env.SLOP_PART, "sonnet"),
    // A leaf's words in a deepened --fast map (deep.ts): its source is in front of it, nothing to find.
    words: pick(process.env.SLOP_WORDS, "sonnet"),
  };

  // --out puts the map elsewhere: the app's project vault (lib/vault.ts), so an
  // imported project's map never lands in this repo's committed examples.
  const out = opt("--out") ?? `maps/${name}`;
  mkdirSync(out, { recursive: true });
  cacheIn(`${out}/.cache`, { fresh: has("--fresh") });
  // --overview redraws only the top level of the map that is there (D60).
  // The graph is what every author draws from and what the checker proves arrows against.
  setGraph(await buildGraph(inv));
  if (has("--overview")) return redraw(out, inv, models.author);
  const t0 = Date.now();
  const elapsed: Record<string, number> = {};
  const lap = async <T,>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const r = await fn();
    elapsed[stage] = Math.round((Date.now() - t) / 1000);
    console.log(`· ${stage} done in ${elapsed[stage]}s — $${(bill[stage]?.usd ?? 0).toFixed(2)}`);
    return r;
  };
  // What the app shows while the run is on: the stage, and once the cut is in,
  // a line per root. A stale file from a previous run would be read as this
  // one's, so the first write happens before any work.
  const progress: Progress = { startedAt: new Date(t0).toISOString(), stage: "summarize", roots: [], ...(has("--fast") ? { fast: true } : {}) };
  // When the stage last changed: the app's time-left guess needs it for the
  // stages that report nothing until they end.
  let stageNow = progress.stage;
  const flush = () => {
    if (progress.stage !== stageNow || !progress.stageAt) [stageNow, progress.stageAt] = [progress.stage, new Date().toISOString()];
    atomic(`${out}/progress.json`, JSON.stringify(progress, null, 1) + "\n");
  };
  // A root's latest submit while it is still being checked, which the app
  // shows dimmed (D69). Its own file, beside the map: it is not the map.
  const drafts: Record<string, Node> = {};
  let drafting = Promise.resolve();
  const writeDrafts = () => (drafting = drafting.then(() => atomic(`${out}/drafts.json`, JSON.stringify(drafts) + "\n")));
  const mark = (id: string, status: RootStatus, detail?: string) => {
    const r = progress.roots.find((x) => x.id === id);
    if (!r) return;
    r.status = status;
    r.detail = detail;
    flush();
  };
  flush();

  const say = (s: string) => console.log(`  ${s}`);
  // Each submit's verdict is the one in-flight fact an author reports, so
  // "revising" is all the app can say of a root being drafted.
  const submitted = (id: string, prefix: string): OnSubmit => (n, list, draft, fixed) => {
    const problems = list.length;
    say(submitLine(id, n, list, fixed));
    if (problems) mark(id, "drafting", `revising — ${problems} problem${problems === 1 ? "" : "s"}`);
    // Only a tree the page can draw: one whose shape holds, whatever its claims.
    if (problems && draft && !shapeProblems(structuredClone(draft), prefix).length) {
      drafts[id] = draft as Node;
      void writeDrafts();
    }
  };

  const code = inv.files.filter(isSource);
  console.log(`${inv.name} @ ${inv.commit}: ${inv.files.length} files, ${code.length} to summarise, marks [${inv.marks.join(", ")}]`);

  // The reading, file by file, for the app to show while it waits (D69).
  // Written at most four times a second: a cached run reads hundreds at once.
  const reading = { files: code.map((f) => f.path), read: [] as string[], recent: [] as { path: string; purpose: string }[] };
  progress.reading = reading;
  flush();
  let flushed = 0;
  const sums = await lap("summarize", () =>
    summarize(inv, (n, of, path, purpose) => {
      if (n % 25 === 0 || n === of) say(`summarised ${n}/${of}`);
      reading.read.push(path);
      if (purpose) reading.recent = [{ path, purpose }, ...reading.recent].slice(0, 8);
      if (n === of || Date.now() - flushed > 250) {
        flushed = Date.now();
        flush();
      }
    }),
  );
  writeFileSync(`${out}/.cache/summaries.json`, JSON.stringify(sums, null, 1));
  // The one model reading of the code, laid onto the graph: what each file is for and each function does.
  withSummaries(activeGraph()!, sums);
  writeFileSync(`${out}/graph.json`, JSON.stringify(activeGraph()) + "\n");
  if (stopAfter === "summarize") return;
  // --fast: the four-phase map (fast.ts) in place of the cut, the authors and
  // the overview; then, unless --no-deepen, each of its sections written in
  // full by the authors, in reading order, a section the reader has open first.
  if (has("--fast")) {
    progress.stage = "author";
    flush();
    const deepen = !has("--no-deepen");
    const agentDeepen = has("--deepen-agent");
    const run: Run = { command: `bluprint map ${inv.name} --fast`, repo: inv.scope ? name : inv.name, commit: inv.commit, files: code.length, elapsed: "", root: repo, explain: deepen ? EXPLAIN_LEVEL : "none", models };
    const r = await lap("fast", () => fastMap(inv, sums, activeGraph()!, models.author, run, say));
    const quick = Math.round((Date.now() - t0) / 1000);
    r.map.RUN.elapsed = `${Math.max(1, Math.round(quick / 60))} min`;
    atomic(`${out}/map.json`, JSON.stringify(r.map, null, 1) + "\n");
    writeFileSync(`${out}/arch.json`, JSON.stringify(r.arch, null, 1) + "\n");
    console.log(`\n${out}/map.json — ${r.map.AUTHORED.length} components, ${r.checkProblems.length} check problems, ${r.discrepancies.length} discrepancies, ${quick}s`);
    for (const d of r.discrepancies) console.log(`  discrepancy: ${d}`);
    for (const p of r.checkProblems.slice(0, 30)) console.log(`  check: ${p}`);

    // The components as a cut, so the authors (and later updates, update.ts) read them as roots.
    const fastCut: Cut = {
      about: r.map.OVERVIEW?.detail ?? "",
      roots: r.map.AUTHORED.map((n) => {
        const c = r.arch.components.find((x) => x.id === n.id)!;
        return { id: n.id, prefix: c.prefix, title: n.title, sub: n.sub, why: n.detail ?? "", files: c.files };
      }),
      excluded: [],
    };
    writeFileSync(`${out}/.cache/cut.json`, JSON.stringify(fastCut, null, 1));
    atomic(`${out}/index.json`, JSON.stringify(catalogOf(inv, sums, fastCut)) + "\n");

    const deep: Record<string, Authored> = {};
    if (deepen) {
      progress.stage = "deepen";
      progress.roots = fastCut.roots.map((x) => ({ id: x.id, title: x.title, sub: x.sub, status: "queued" as RootStatus, detail: "quick version" }));
      flush();
      const map = r.map;
      let writing = Promise.resolve();
      const save = () => {
        const body = JSON.stringify(map, null, 1) + "\n";
        writing = writing.then(() => atomic(`${out}/map.json`, body));
        return writing;
      };
      // The reader's open section, which the app writes when they open a quick one (lib/vault.ts, focus).
      const focused = () => {
        try {
          return (JSON.parse(readFileSync(`${out}/focus.json`, "utf8")) as { id?: string }).id;
        } catch {
          return undefined;
        }
      };
      const queue = fastCut.roots.map((x) => x.id);
      const next = () => {
        const f = focused();
        const i = f ? queue.indexOf(f) : -1;
        return queue.splice(i >= 0 ? i : 0, 1)[0];
      };
      const one = async (id: string) => {
        const root = fastCut.roots.find((x) => x.id === id)!;
        mark(id, "drafting", "writing in full");
        let done: Authored;
        // Code builds the section and a model writes its words (deep.ts); --deepen-agent writes it with an author agent, as before.
        if (!agentDeepen)
          // A section whose calls all fail keeps its quick version, as a failed author does.
          done = await deepRoot(root, r.map.AUTHORED.find((n) => n.id === id)!, inv, sums, activeGraph()!, { group: models.author, words: models.words }, say).catch((e: Error) => ({ root: null, turns: 0, reads: 0, submits: 0, problems: [e.message.slice(0, 300)], trail: [] }));
        else if (tooBig(root, fastCut, inv, sums)) {
          const split = await authorSplit(root, fastCut, inv, sums, { cut: models.cut, part: models.part, join: models.author }, null, { submit: submitted(id, root.prefix), part: () => {}, say });
          done = split?.authored ?? (await authorRoot(root, fastCut, inv, sums, models.author, submitted(id, root.prefix)));
        } else done = await authorRoot(root, fastCut, inv, sums, models.author, submitted(id, root.prefix));
        deep[id] = done;
        delete drafts[id];
        void writeDrafts();
        if (done.root) {
          // In the quick one's place: same id and row, so the overview's boxes still open it.
          const i = map.AUTHORED.findIndex((n) => n.id === id);
          map.AUTHORED[i] = { ...plain(done.root), col: 0, row: i };
          dedupeIssues(map.AUTHORED[i]);
          await save();
          mark(id, "done", "written in full");
          say(`${id}: written in full after ${done.turns + 1} ${agentDeepen ? "turns" : "calls"}`);
        } else {
          mark(id, "failed", "kept the quick version");
          say(`${id}: kept the quick version — ${done.problems.length} problems unresolved`);
        }
      };
      // A section in words is a few short calls, so all of them at once; an agent per section, three.
      const AT_ONCE = Number(process.env.SLOP_DEEPEN_AT_ONCE ?? (agentDeepen ? 3 : queue.length));
      await lap("deepen", () =>
        Promise.all(
          Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
            for (let id = next(); id; id = next()) await one(id);
          }),
        ),
      );
      await writing;
      await drafting;
      rmSync(`${out}/drafts.json`, { force: true });
      rmSync(`${out}/focus.json`, { force: true });

      // The top level drawn again over the sections as written in full, as the
      // full pipeline draws it (D60): its explainer, glossary and walkthroughs,
      // which the quick map has none of. If it fails the quick one stays.
      progress.stage = "overview";
      flush();
      const drawn: Overviewed = agentDeepen
        ? await lap("overview", () => overviewOf(map.AUTHORED, fastCut, inv, models.author, (n, problems) => say(`overview: submit ${n} — ${problems ? `${problems} problems` : "clean"}`), sums))
        : await lap("overview", async () => {
            try {
              const o = await deepOverview(map.AUTHORED, map.OVERVIEW!, inv, activeGraph()!, models.author);
              return { overview: o.overview, turns: 0, submits: 1, problems: o.problems };
            } catch (e) {
              return { overview: null, turns: 0, submits: 0, problems: [(e as Error).message.slice(0, 300)] };
            }
          });
      if (drawn.overview) {
        const top = { ...drawn.overview };
        if (EXPLAIN_LEVEL === "none") for (const k of ["explain", "glossary"] as const) delete top[k];
        map.OVERVIEW = top;
        atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
      }
      say(`overview: ${drawn.overview ? "redrawn" : "kept the quick one"} after ${drawn.turns + 1} turns`);
    }

    const total = Math.round((Date.now() - t0) / 1000);
    const final = check(r.map, repo, { generated: true });
    r.map.RUN.elapsed = `${Math.max(1, Math.round(total / 60))} min`;
    atomic(`${out}/map.json`, JSON.stringify(r.map, null, 1) + "\n");
    const usd = Object.values(bill).reduce((a, b) => a + b.usd, 0);
    writeFileSync(
      `${out}/report.json`,
      JSON.stringify(
        {
          repo: inv.name,
          commit: inv.commit,
          backend: BACKEND,
          mode: deepen ? `fast, then deepened${agentDeepen ? " by agents" : " in words"}` : "fast",
          models,
          elapsed: { ...elapsed, ...r.timing, quick, total },
          usd: Math.round(usd * 100) / 100,
          bill,
          components: r.arch.components.map((c) => ({ id: c.id, dir: c.dir, files: c.files.length })),
          discrepancies: r.discrepancies,
          quickCheck: { problems: r.checkProblems },
          check: { problems: final.problems },
          deepened: Object.entries(deep).map(([id, a]) => ({ id, accepted: Boolean(a.root), turns: a.turns + 1, submits: a.submits, lastProblems: a.root ? [] : a.problems.slice(0, 20), ...(a.log?.length ? { timing: timingOf(a.log) } : {}) })),
        },
        null,
        1,
      ) + "\n",
    );
    progress.stage = "done";
    flush();
    if (deepen) console.log(`\ndeepened ${Object.values(deep).filter((a) => a.root).length}/${fastCut.roots.length} sections; ${final.problems.length} check problems; $${usd.toFixed(2)}, quick map at ${quick}s, done at ${total}s`);
    await ccClose();
    return;
  }
  progress.stage = "cut";
  flush();

  // A re-run keeps the cut of the map that is there unless asked for a fresh
  // one: a new cut could rename every root. Code added since that no root
  // claims is placed in it (cut.ts, place) rather than cut again, so only the
  // roots that gain files are redone. Edges of a cut made before D60 are
  // dropped; the overview draws how roots connect now.
  const cached: Cut | null = !has("--fresh") && existsSync(`${out}/.cache/cut.json`) ? withoutEdges(JSON.parse(readFileSync(`${out}/.cache/cut.json`, "utf8"))) : null;
  const cutReused = Boolean(cached);
  let cut: Cut, leftover: string[] = [], rejected: string[][] = [];
  if (cached) {
    const added = unclaimed(cached, inv);
    if (added.length) {
      say(`${added.length} files the cut does not claim (${added.slice(0, 3).join(", ")}${added.length > 3 ? ", …" : ""}); placing them`);
      const placed = await lap("cut", () => place(cached, added, inv, sums, models.cut));
      for (const [id, files] of placed.gained) say(`${id} takes ${files.join(", ")}`);
      for (const r of placed.added) say(`new root ${r.id}: ${r.files.join(", ")}`);
      cut = placed.cut;
    } else cut = cached;
  } else ({ cut, leftover, rejected } = await lap("cut", () => cutRepo(inv, sums, models.cut)));
  writeFileSync(`${out}/.cache/cut.json`, JSON.stringify(cut, null, 1));
  const index = catalogOf(inv, sums, cut);
  atomic(`${out}/index.json`, JSON.stringify(index) + "\n");
  for (const r of cut.roots) say(`${r.id.padEnd(18)} ${r.title} — ${r.files.length} paths`);
  if (leftover.length) say(`${leftover.length} files left unassigned after three rounds`);
  if (stopAfter === "cut") return;

  // A re-run with --roots reuses the roots it is not asked to redo.
  const prev: MapFile | null = only && existsSync(`${out}/map.json`) ? JSON.parse(readFileSync(`${out}/map.json`, "utf8")) : null;
  const authored: Record<string, Authored> = {};
  let overview: Overview | undefined;

  /**
   * The authored roots as a map file. The row is the root's place in the cut,
   * not its place among those done, so a root arriving never moves the ones
   * already on screen. Until the overview is drawn the top level lists them.
   */
  const assemble = (run: Run): MapFile => {
    const AUTHORED = cut.roots.flatMap((r, i) => {
      const n = authored[r.id]?.root;
      return n ? [{ ...plain(n), col: 0, row: i }] : [];
    });
    const top = overview && { ...overview };
    if (top && EXPLAIN_LEVEL === "none") for (const k of ["explain", "glossary"] as const) delete top[k];
    return { RUN: run, ...(top ? { OVERVIEW: top } : {}), AUTHORED };
  };

  // The parts each split root was cut into, kept as the top cut is (see above).
  const subcuts: Record<string, Cut> = !has("--fresh") && existsSync(`${out}/.cache/subcuts.json`) ? JSON.parse(readFileSync(`${out}/.cache/subcuts.json`, "utf8")) : {};

  progress.stage = "author";
  progress.roots = cut.roots.map((r) => ({ id: r.id, title: r.title, sub: r.sub, status: "queued" as RootStatus, detail: "queued" }));
  flush();

  // The RUN of a map still being made: the same facts as the final one, with
  // the time so far in place of the total the run does not have yet.
  const runNow = (): Run => ({
    command: `bluprint map ${inv.name}`,
    // A scoped map is named for its part and counts only the files it covers.
    repo: inv.scope ? name : inv.name,
    commit: inv.commit,
    files: inv.scope ? code.length : inv.files.length,
    elapsed: `${Math.round((Date.now() - t0) / 60000)} min`,
    root: repo,
    explain: EXPLAIN_LEVEL,
    models,
    ...(inv.scope ? { scope: inv.scope } : {}),
  });

  // The roots are authored concurrently, so their partial writes are chained:
  // each waits for the previous rename. Latest-wins would be enough for the
  // file's content, but the chain also keeps progress.json and map.json from
  // disagreeing about which roots exist.
  let writing = Promise.resolve();
  const partial = () => {
    const map = assemble(runNow());
    writing = writing.then(() => atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n"));
    return writing;
  };

  // Nothing re-reads an accepted root: its arrows were proven against the graph when it was submitted.
  const onAccept = (id: string, root: Node) => {
    if (only && !only.includes(id)) return;
    dedupeIssues(root);
  };

  await lap("author", () =>
    Promise.all(
      cut.roots.map(async (r) => {
        const kept = prev?.AUTHORED.find((n) => n.id === r.id);
        if (only && !only.includes(r.id) && kept) {
          authored[r.id] = { root: kept, turns: 0, reads: 0, submits: 0, problems: [], trail: [] };
          mark(r.id, "done", "kept");
          await partial();
          return;
        }
        mark(r.id, "drafting", "drafting");
        // A root too big for one agent is cut as the repository is; one past SLOP_PARALLEL_FILES is outlined quickly, so its parts are written side by side.
        const big = tooBig(r, cut, inv, sums);
        if (big || inParts(r, cut, inv, sums)) {
          mark(r.id, "drafting", "splitting into parts");
          const split = await authorSplit(r, cut, inv, sums, { cut: models.cut, part: models.part, join: models.author }, subcuts[r.id] ?? null, {
            submit: submitted(r.id, r.prefix),
            // The parts as they come back, under a placeholder of the root, shown dimmed until its own level is written.
            part: (draft) => {
              if (shapeProblems(structuredClone(draft), r.prefix).length) return;
              drafts[r.id] = draft;
              void writeDrafts();
              mark(r.id, "drafting", `${draft.children?.length ?? 0} parts written`);
            },
            say,
          }, !big);
          if (split) {
            subcuts[r.id] = split.cut;
            writeFileSync(`${out}/.cache/subcuts.json`, JSON.stringify(subcuts, null, 1));
          }
          authored[r.id] = split?.authored ?? (await authorRoot(r, cut, inv, sums, models.author, submitted(r.id, r.prefix)));
        } else authored[r.id] = await authorRoot(r, cut, inv, sums, models.author, submitted(r.id, r.prefix));
        delete drafts[r.id];
        void writeDrafts();
        const cov = authored[r.id].coverage;
        say(`${r.id}: ${authored[r.id].root ? "accepted" : "FAILED"} after ${authored[r.id].turns + 1} turns, ${authored[r.id].reads} reads${cov ? `, ${cov.symbols - cov.gaps.length}/${cov.symbols} symbols explained` : ""}`);
        // Accepted means it already passed, inside authorRoot's submit, the
        // same check() the finished map passes — so showing it now shows
        // nothing a finished root would not.
        if (authored[r.id].root) {
          mark(r.id, "done", "explorable now");
          await partial();
          onAccept(r.id, authored[r.id].root!);
        } else mark(r.id, "failed", `${authored[r.id].problems.length} problems unresolved`);
      }),
    ),
  );
  await writing;
  await drafting;
  rmSync(`${out}/drafts.json`, { force: true });

  // The top level is drawn last, from the roots as accepted (D60). A repair
  // that leaves the same roots standing keeps the overview it had.
  const accepted = cut.roots.flatMap((r) => (authored[r.id].root ? [authored[r.id].root!] : []));
  const same = (o: MapFile | null) => o?.OVERVIEW && o.AUTHORED.map((n) => n.id).join() === accepted.map((n) => n.id).join();
  let drawn: Overviewed | null = null;
  if (same(prev)) overview = prev!.OVERVIEW;
  else if (accepted.length) {
    progress.stage = "overview";
    flush();
    drawn = await lap("overview", () => overviewOf(accepted, cut, inv, models.author, (n, problems) => say(`overview: submit ${n} — ${problems ? `${problems} problems` : "clean"}`), sums));
    overview = drawn.overview ?? undefined;
    say(`overview: ${overview ? "accepted" : "FAILED"} after ${drawn.turns + 1} turns`);
    await partial();
  }

  // A stage replayed wholly from cache took seconds and cost nothing, not what
  // generating it costs; the last report's time and bill for it stand, so the
  // record stays a plan.
  const last = existsSync(`${out}/report.json`) ? JSON.parse(readFileSync(`${out}/report.json`, "utf8")) : null;
  const before = last?.elapsed ?? {};
  const spent = { ...bill };
  let total = Math.round((Date.now() - t0) / 1000);
  for (const stage of Object.keys(elapsed)) {
    const runs = Object.entries(bill).filter(([k]) => k === stage || k.startsWith(`${stage}-`));
    if (runs.length && runs.every(([, b]) => b.calls === b.cached) && typeof before[stage] === "number") {
      total += before[stage] - elapsed[stage];
      elapsed[stage] = before[stage];
      for (const [k] of runs) if (last.bill?.[k]) spent[k] = last.bill[k];
    }
  }
  const map = assemble({ ...runNow(), elapsed: `${Math.round(total / 60)} min` });
  const { AUTHORED } = map;
  const final = check(map, repo, { generated: true });
  const covered = coverage(index, AUTHORED);
  atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  progress.stage = "done";
  flush();

  const usd = Object.values(spent).reduce((a, b) => a + b.usd, 0);
  const fullUsd = Object.values(spent).reduce((a, b) => a + b.fullUsd, 0);
  const report = {
    repo: inv.name,
    commit: inv.commit,
    // Through Claude Code, `usd` is what the same tokens cost at the API list
    // price; on a Claude plan they come out of the plan's usage instead.
    backend: BACKEND,
    models,
    // A --roots repair is not what the map costs to make: the full run's
    // time and price stand, and the repair is listed beside them.
    ...(only && last
      ? { elapsed: last.elapsed, usd: last.usd, fullUsd: last.fullUsd, bill: last.bill, repairs: [...(last.repairs ?? []), { roots: only, seconds: total, usd: Math.round(Object.values(bill).reduce((a, b) => a + b.usd, 0) * 100) / 100, bill }] }
      : { elapsed: { ...elapsed, total }, usd: Math.round(usd * 100) / 100, fullUsd: Math.round(fullUsd * 100) / 100, bill: spent }),
    throttled: { waits: throttle.waits, seconds: Math.round(throttle.seconds) },
    files: { listed: inv.files.length, summarised: code.length, unassigned: leftover },
    excluded: cut.excluded,
    coverage: { symbols: covered.symbols, explained: covered.explained, gaps: covered.gaps.map((g) => `${g.file}: ${g.symbol.name}`) },
    overview: drawn ? { accepted: Boolean(drawn.overview), turns: drawn.turns + 1, submits: drawn.submits, lastProblems: drawn.overview ? [] : drawn.problems.slice(0, 20) } : (overview ? "kept" : null),
    roots: cut.roots.map((r) => ({
      id: r.id,
      title: r.title,
      accepted: Boolean(authored[r.id].root),
      turns: authored[r.id].turns + 1,
      reads: authored[r.id].reads,
      submits: authored[r.id].submits,
      lastProblems: authored[r.id].root ? [] : authored[r.id].problems.slice(0, 20),
      ...(authored[r.id].coverage ? { coverage: { symbols: authored[r.id].coverage!.symbols, unexplained: authored[r.id].coverage!.gaps.length } } : {}),
      ...(authored[r.id].log?.length ? { timing: timingOf(authored[r.id].log!), log: authored[r.id].log } : {}),
    })),
    check: { problems: final.problems, depth: final.roots },
    graph: { ...activeGraph()!.stats, defs: activeGraph()!.defs.length, edges: activeGraph()!.edges.length },
    arrows: arrowStats(map),
  };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1) + "\n");
  writeFileSync(
    `${out}/audit.md`,
    auditMarkdown({ inv, cut, rejected, leftover, cutReused, authored, drawn, overview, only, backend: BACKEND, models, seconds: total, checkProblems: final.problems }),
  );
  console.log(`\n${out}/map.json — ${AUTHORED.length}/${cut.roots.length} roots, ${final.problems.length} check problems, ${covered.explained}/${covered.symbols} symbols explained, ${report.arrows.inferred}/${report.arrows.total} arrows inferred, $${report.usd} spent ($${report.fullUsd} uncached), ${report.elapsed.total}s`);
  final.problems.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  // Where the writing stage's minutes went, root by root (replayed roots have no log).
  const timed = report.roots.flatMap((r) => (r.timing ? [{ id: r.id, ...r.timing }] : []));
  if (timed.length) {
    console.log(`\nauthor time by root (s): turns · wait / think / write · out tok (thinking) · to first submit · repair turns`);
    for (const t of timed.sort((a, b) => ("wall" in b ? b.wall : b.seconds) - ("wall" in a ? a.wall : a.seconds)))
      console.log(`  ${t.id.padEnd(22)} ${String("wall" in t ? `${t.wall} wall` : t.seconds).padStart(9)} · ${t.turns} turns · ${t.wait} / ${t.think} / ${t.write} · ${t.out} (${t.thinking}) · ${t.toFirstSubmit ?? "never"} · ${t.repairTurns}`);
  }
  // A whole map asked for every reply it still needs; the rest can never replay.
  if (!only) {
    const swept = sweepCache();
    if (swept) console.log(`  swept ${swept} stale cached replies`);
  }
  await ccClose();
}
