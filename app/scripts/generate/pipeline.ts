/**
 * The whole generator, stage by stage. Lives in a .ts module rather than the
 * .mts entry point so every stage shares one instance of bedrock.ts: tsx loads
 * .mts as ESM and .ts as CommonJS, and two instances meant the cache and the
 * bill were set in one and read from the other.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Node, Run } from "@/lib/data";
import type { MapFile, Overview } from "@/lib/map";
import { parseArgs } from "./args";
import { auditMarkdown } from "./audit";
import { authorRoot, type Authored } from "./author";
import { BACKEND, bill, MODELS, cacheIn, throttle } from "./bedrock";
import { ccClose } from "./claude-code";
import { check, OVERVIEW_ID } from "./check";
import { cutRepo, type Cut } from "./cut";
import { inventory, isSource } from "./inventory";
import { overviewOf, toOverview, type Overviewed } from "./overview";
import { summarize } from "./summarize";
import { verifyTree, type Verdict } from "./verify";

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
  const drawn = await overviewOf(map.AUTHORED, cut, inv, model, (n, problems) => console.log(`  overview: submit ${n} — ${problems ? `${problems} problems` : "clean"}`));
  if (drawn.overview) {
    const node = { ...drawn.overview, id: OVERVIEW_ID, title: "Overview", sub: drawn.overview.sub ?? "", col: 0, row: 0 };
    await verifyTree(node, inv, model);
    map.OVERVIEW = toOverview(node);
    atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  }
  console.log(`${out}/map.json — overview ${drawn.overview ? "redrawn" : `not accepted: ${drawn.problems.slice(0, 5).join("; ")}`}, $${Object.values(bill).reduce((a, b) => a + b.usd, 0).toFixed(2)}`);
  await ccClose();
}

export type RootStatus = "queued" | "drafting" | "done" | "failed";
export interface Progress {
  startedAt: string;
  stage: string;
  roots: { id: string; title: string; status: RootStatus; detail?: string }[];
}

export async function main(args: string[]) {
  const { opt, has, repo: dir } = parseArgs(args);

  const repo = resolve(dir!);
  const inv = inventory(repo);
  const name = opt("--name") ?? inv.name.toLowerCase();
  // --scope maps part of a large repo; the rest stays readable to the authors.
  const scope = opt("--scope")?.split(",");
  if (scope) {
    inv.scope = { paths: scope, focus: opt("--focus") ?? "" };
    for (const f of inv.files) if (!scope.some((p) => f.path === p || f.path.startsWith(p.replace(/\/?$/, "/")))) Object.assign(f, { code: false, outside: true });
  }
  const only = opt("--roots")?.split(",");
  const stopAfter = opt("--stop-after");
  const pick = (env: string | undefined) => MODELS[(env ?? "opus") as keyof typeof MODELS] ?? MODELS.opus;
  const models = { summarize: MODELS.haiku, cut: pick(process.env.SLOP_CUT), author: pick(process.env.SLOP_AUTHOR), verify: MODELS.haiku };

  // --out puts the map elsewhere: the app's project vault (lib/vault.ts), so an
  // imported project's map never lands in this repo's committed examples.
  const out = opt("--out") ?? `maps/${name}`;
  mkdirSync(out, { recursive: true });
  cacheIn(`${out}/.cache`, { fresh: has("--fresh") });
  // --overview redraws only the top level of the map that is there (D60).
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
  const progress: Progress = { startedAt: new Date(t0).toISOString(), stage: "summarize", roots: [] };
  const flush = () => atomic(`${out}/progress.json`, JSON.stringify(progress, null, 1) + "\n");
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
  const submitted = (id: string) => (n: number, problems: number) => {
    say(`${id}: submit ${n} — ${problems ? `${problems} problems` : "clean"}`);
    if (problems) mark(id, "drafting", `revising — ${problems} problem${problems === 1 ? "" : "s"}`);
  };

  const code = inv.files.filter(isSource);
  console.log(`${inv.name} @ ${inv.commit}: ${inv.files.length} files, ${code.length} to summarise, marks [${inv.marks.join(", ")}]`);

  const sums = await lap("summarize", () =>
    summarize(inv, (n, of) => { if (n % 25 === 0 || n === of) say(`summarised ${n}/${of}`); }),
  );
  writeFileSync(`${out}/.cache/summaries.json`, JSON.stringify(sums, null, 1));
  if (stopAfter === "summarize") return;
  progress.stage = "cut";
  flush();

  // A re-run keeps the cut of the map that is there unless asked for a fresh
  // one: a new cut could rename every root. Edges of a cut made before D60
  // are dropped; the overview draws how roots connect now.
  const cutReused = Boolean(!has("--fresh") && existsSync(`${out}/.cache/cut.json`));
  const { cut, leftover, rejected } =
    cutReused
      ? { cut: withoutEdges(JSON.parse(readFileSync(`${out}/.cache/cut.json`, "utf8"))), leftover: [] as string[], rejected: [] as string[][] }
      : await lap("cut", () => cutRepo(inv, sums, models.cut));
  writeFileSync(`${out}/.cache/cut.json`, JSON.stringify(cut, null, 1));
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
      return n ? [{ ...n, col: 0, row: i }] : [];
    });
    return { RUN: run, ...(overview ? { OVERVIEW: overview } : {}), AUTHORED, LINKS: [] };
  };

  progress.stage = "author";
  progress.roots = cut.roots.map((r) => ({ id: r.id, title: r.title, status: "queued" as RootStatus, detail: "queued" }));
  flush();

  // The RUN of a map still being made: the same facts as the final one, with
  // the time so far in place of the total the run does not have yet.
  const runNow = (): Run => ({
    command: `understand-slop map ${inv.name}`,
    // A scoped map is named for its part and counts only the files it covers.
    repo: inv.scope ? name : inv.name,
    commit: inv.commit,
    files: inv.scope ? code.length : inv.files.length,
    elapsed: `${Math.round((Date.now() - t0) / 60000)} min`,
    root: repo,
    models,
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
        authored[r.id] = await authorRoot(r, cut, inv, sums, models.author, submitted(r.id));
        say(`${r.id}: ${authored[r.id].root ? "accepted" : "FAILED"} after ${authored[r.id].turns + 1} turns, ${authored[r.id].reads} reads`);
        // Accepted means it already passed, inside authorRoot's submit, the
        // same check() the finished map passes — so showing it now shows
        // nothing a finished root would not.
        if (authored[r.id].root) {
          mark(r.id, "done", "explorable now");
          await partial();
        } else mark(r.id, "failed", `${authored[r.id].problems.length} problems unresolved`);
      }),
    ),
  );
  await writing;

  // The top level is drawn last, from the roots as accepted (D60). A repair
  // that leaves the same roots standing keeps the overview it had.
  const accepted = cut.roots.flatMap((r) => (authored[r.id].root ? [authored[r.id].root!] : []));
  const same = (o: MapFile | null) => o?.OVERVIEW && o.AUTHORED.map((n) => n.id).join() === accepted.map((n) => n.id).join();
  let drawn: Overviewed | null = null;
  if (same(prev)) overview = prev!.OVERVIEW;
  else if (accepted.length) {
    progress.stage = "overview";
    flush();
    drawn = await lap("overview", () => overviewOf(accepted, cut, inv, models.author, (n, problems) => say(`overview: submit ${n} — ${problems ? `${problems} problems` : "clean"}`)));
    overview = drawn.overview ?? undefined;
    say(`overview: ${overview ? "accepted" : "FAILED"} after ${drawn.turns + 1} turns`);
    await partial();
  }
  progress.stage = "verify";
  flush();

  const verdicts: Record<string, Verdict[]> = {};
  await lap("verify", () =>
    Promise.all([
      ...cut.roots.map(async (r) => {
        const root = authored[r.id].root;
        if (root && !(only && !only.includes(r.id))) verdicts[r.id] = await verifyTree(root, inv, models.author);
      }),
      // The overview's claims are read against its lines like any level's;
      // what the reviewer corrects lands back on it.
      (async () => {
        if (!drawn?.overview) return;
        const node = { ...drawn.overview, id: OVERVIEW_ID, title: "Overview", sub: drawn.overview.sub ?? "", col: 0, row: 0 };
        verdicts[OVERVIEW_ID] = await verifyTree(node, inv, models.author);
        overview = toOverview(node);
      })(),
    ]),
  );

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
  atomic(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");
  progress.stage = "done";
  flush();

  const allVerdicts = Object.values(verdicts).flat();
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
    overview: drawn ? { accepted: Boolean(drawn.overview), turns: drawn.turns + 1, submits: drawn.submits, lastProblems: drawn.overview ? [] : drawn.problems.slice(0, 20) } : (overview ? "kept" : null),
    roots: cut.roots.map((r) => ({
      id: r.id,
      title: r.title,
      accepted: Boolean(authored[r.id].root),
      turns: authored[r.id].turns + 1,
      reads: authored[r.id].reads,
      submits: authored[r.id].submits,
      lastProblems: authored[r.id].root ? [] : authored[r.id].problems.slice(0, 20),
      verify: verdicts[r.id] ? { nodes: verdicts[r.id].length, ok: verdicts[r.id].filter((v) => v.ok).length, flagged: verdicts[r.id].filter((v) => v.flagged).length, rewritten: verdicts[r.id].filter((v) => v.rewritten).map((v) => ({ id: v.id, claims: v.claims })), downgraded: verdicts[r.id].filter((v) => v.downgraded).map((v) => v.id) } : (last?.roots?.find((x: { id: string }) => x.id === r.id)?.verify ?? null),
    })),
    check: { problems: final.problems, depth: final.roots },
    verifyPassRate: only && last?.verifyPassRate != null ? null : allVerdicts.length ? Math.round((100 * allVerdicts.filter((v) => v.ok).length) / allVerdicts.length) : null,
  };
  // A repair verified only the roots it redid; the rate is over every root.
  if (report.verifyPassRate === null) {
    const v = report.roots.map((r) => r.verify).filter(Boolean) as { nodes: number; ok?: number; downgraded: string[] }[];
    const nodes = v.reduce((a, x) => a + x.nodes, 0);
    if (nodes) report.verifyPassRate = Math.round((100 * v.reduce((a, x) => a + (x.ok ?? x.nodes - x.downgraded.length), 0)) / nodes);
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1) + "\n");
  writeFileSync(
    `${out}/audit.md`,
    auditMarkdown({ inv, cut, rejected, leftover, cutReused, authored, drawn, overview, verdicts, only, backend: BACKEND, models, seconds: total, checkProblems: final.problems }),
  );
  console.log(`\n${out}/map.json — ${AUTHORED.length}/${cut.roots.length} roots, ${final.problems.length} check problems, verify ${report.verifyPassRate}% , $${report.usd} spent ($${report.fullUsd} uncached), ${report.elapsed.total}s`);
  final.problems.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  await ccClose();
}
