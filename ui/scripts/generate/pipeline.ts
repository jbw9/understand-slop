/**
 * The whole generator, stage by stage. Lives in a .ts module rather than the
 * .mts entry point so every stage shares one instance of bedrock.ts: tsx loads
 * .mts as ESM and .ts as CommonJS, and two instances meant the cache and the
 * bill were set in one and read from the other.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Edge, Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { authorRoot, type Authored } from "./author";
import { bill, MODELS, cacheIn, throttle } from "./bedrock";
import { check } from "./check";
import { cutRepo, type Cut } from "./cut";
import { inventory } from "./inventory";
import { summarize } from "./summarize";
import { verifyTree, type Verdict } from "./verify";

export async function main(args: string[]) {
  const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };

  const repo = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))!);
  const inv = inventory(repo);
  const name = opt("--name") ?? inv.name.toLowerCase();
  const only = opt("--roots")?.split(",");
  const stopAfter = opt("--stop-after");
  const pick = (env: string | undefined) => MODELS[(env ?? "opus") as keyof typeof MODELS] ?? MODELS.opus;
  const models = { summarize: MODELS.haiku, cut: pick(process.env.SLOP_CUT), author: pick(process.env.SLOP_AUTHOR), verify: MODELS.haiku };

  const out = `maps/${name}`;
  mkdirSync(out, { recursive: true });
  cacheIn(`${out}/.cache`, { fresh: args.includes("--fresh") });
  const t0 = Date.now();
  const elapsed: Record<string, number> = {};
  const lap = async <T,>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const r = await fn();
    elapsed[stage] = Math.round((Date.now() - t) / 1000);
    console.log(`· ${stage} done in ${elapsed[stage]}s — $${(bill[stage]?.usd ?? 0).toFixed(2)}`);
    return r;
  };
  const say = (s: string) => console.log(`  ${s}`);

  const code = inv.files.filter((f) => f.code && !f.test);
  console.log(`${inv.name} @ ${inv.commit}: ${inv.files.length} files, ${code.length} to summarise, marks [${inv.marks.join(", ")}]`);

  const sums = await lap("summarize", () =>
    summarize(inv, (n, of) => { if (n % 25 === 0 || n === of) say(`summarised ${n}/${of}`); }),
  );
  writeFileSync(`${out}/.cache/summaries.json`, JSON.stringify(sums, null, 1));
  if (stopAfter === "summarize") return;

  // A re-run with --roots redoes some roots of the map that is there, so it
  // keeps that map's cut: a fresh one could rename every root.
  const { cut, leftover } =
    only && existsSync(`${out}/.cache/cut.json`)
      ? { cut: JSON.parse(readFileSync(`${out}/.cache/cut.json`, "utf8")) as Cut, leftover: [] as string[] }
      : await lap("cut", () => cutRepo(inv, sums, models.cut));
  writeFileSync(`${out}/.cache/cut.json`, JSON.stringify(cut, null, 1));
  for (const r of cut.roots) say(`${r.id.padEnd(18)} ${r.title} — ${r.files.length} paths`);
  if (leftover.length) say(`${leftover.length} files left unassigned after three rounds`);
  if (stopAfter === "cut") return;

  // A re-run with --roots reuses the roots it is not asked to redo.
  const prev: MapFile | null = only && existsSync(`${out}/map.json`) ? JSON.parse(readFileSync(`${out}/map.json`, "utf8")) : null;
  const authored: Record<string, Authored> = {};
  await lap("author", () =>
    Promise.all(
      cut.roots.map(async (r) => {
        const kept = prev?.AUTHORED.find((n) => n.id === r.id);
        if (only && !only.includes(r.id) && kept) {
          authored[r.id] = { root: kept, turns: 0, reads: 0, submits: 0, problems: [] };
          return;
        }
        authored[r.id] = await authorRoot(r, cut, inv, sums, models.author, say);
        say(`${r.id}: ${authored[r.id].root ? "accepted" : "FAILED"} after ${authored[r.id].turns + 1} turns, ${authored[r.id].reads} reads`);
      }),
    ),
  );

  const verdicts: Record<string, Verdict[]> = {};
  await lap("verify", () =>
    Promise.all(
      cut.roots.map(async (r) => {
        const root = authored[r.id].root;
        if (root && !(only && !only.includes(r.id))) verdicts[r.id] = await verifyTree(root, inv, models.author);
      }),
    ),
  );

  const AUTHORED: Node[] = cut.roots.flatMap((r, i) => {
    const n = authored[r.id].root;
    return n ? [{ ...n, col: 0, row: i }] : [];
  });
  const present = new Set(AUTHORED.map((n) => n.id));
  const E0: Edge[] = cut.edges.filter((e) => present.has(e.from) && present.has(e.to)).map((e) => ({ ...e, state: "derived" as const }));
  const map: MapFile = {
    RUN: {
      command: `understand-slop map ${inv.name}`,
      repo: inv.name,
      about: cut.about,
      commit: inv.commit,
      files: inv.files.length,
      elapsed: `${Math.round((Date.now() - t0) / 60000)} min`,
      root: repo,
      models,
    },
    AUTHORED,
    E0,
    LINKS: [],
  };
  const final = check(map, repo, { generated: true });
  writeFileSync(`${out}/map.json`, JSON.stringify(map, null, 1) + "\n");

  const allVerdicts = Object.values(verdicts).flat();
  // A stage replayed wholly from cache took seconds, not what generating it
  // costs; the last report's time for it stands, so the record stays a plan.
  const last = existsSync(`${out}/report.json`) ? JSON.parse(readFileSync(`${out}/report.json`, "utf8")) : null;
  const before = last?.elapsed ?? {};
  let total = Math.round((Date.now() - t0) / 1000);
  for (const stage of Object.keys(elapsed)) {
    const runs = Object.entries(bill).filter(([k]) => k === stage || k.startsWith(`${stage}-`));
    if (runs.length && runs.every(([, b]) => b.calls === b.cached) && typeof before[stage] === "number") {
      total += before[stage] - elapsed[stage];
      elapsed[stage] = before[stage];
    }
  }
  const usd = Object.values(bill).reduce((a, b) => a + b.usd, 0);
  const fullUsd = Object.values(bill).reduce((a, b) => a + b.fullUsd, 0);
  const report = {
    repo: inv.name,
    commit: inv.commit,
    models,
    // A --roots repair is not what the map costs to make: the full run's
    // time and price stand, and the repair is listed beside them.
    ...(only && last
      ? { elapsed: last.elapsed, usd: last.usd, fullUsd: last.fullUsd, bill: last.bill, repairs: [...(last.repairs ?? []), { roots: only, seconds: total, usd: Math.round(usd * 100) / 100, bill }] }
      : { elapsed: { ...elapsed, total }, usd: Math.round(usd * 100) / 100, fullUsd: Math.round(fullUsd * 100) / 100, bill }),
    throttled: { waits: throttle.waits, seconds: Math.round(throttle.seconds) },
    files: { listed: inv.files.length, summarised: code.length, unassigned: leftover },
    excluded: cut.excluded,
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
  console.log(`\n${out}/map.json — ${AUTHORED.length}/${cut.roots.length} roots, ${final.problems.length} check problems, verify ${report.verifyPassRate}% , $${report.usd} spent ($${report.fullUsd} uncached), ${report.elapsed.total}s`);
  final.problems.slice(0, 20).forEach((p) => console.log(`  ${p}`));
}
