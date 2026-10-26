/**
 * Numbers for comparing maps, the explorify benchmark included. A map that
 * matches these is not proven good — that takes a walk through it in the
 * browser — but one that misses them is reliably worse.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- map and report JSON */
import { existsSync, readFileSync } from "node:fs";
import type { Node } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { rootOf } from "@/lib/maps";
import { check } from "./check";
import { owners, type Cut } from "./cut";

export function evaluate(name: string, map: MapFile) {
  const nodes: Node[] = [];
  const walk = (n: Node) => { nodes.push(n); (n.children ?? []).forEach(walk); };
  map.AUTHORED.forEach(walk);
  const blocks = nodes.flatMap((n) => n.anatomy ?? []);
  const diagrams = blocks.filter((b) => b.kind === "diagram") as any[];
  const parents = nodes.filter((n) => n.children?.length);
  // D40: how much of the way down is through the picture.
  const linked = parents.map((n) => {
    const kids = new Set(n.children!.map((c) => c.id));
    const opened = new Set((n.anatomy ?? []).flatMap((b: any) => (b.kind === "diagram" ? b.boxes.map((x: any) => x.opens) : [])).filter((id: string) => kids.has(id)));
    return opened.size / kids.size;
  });
  const report = existsSync(`maps/${name}/report.json`) ? JSON.parse(readFileSync(`maps/${name}/report.json`, "utf8")) : null;
  const root = rootOf(map.RUN);
  const generated = Boolean(map.RUN.models);
  const problems = existsSync(root) ? check(map, root, { generated }).problems.length : "no checkout";
  const depth = (n: Node): number => 1 + Math.max(0, ...(n.children ?? []).map(depth));
  return {
    map: name,
    roots: map.AUTHORED.length,
    nodes: nodes.length,
    depth: map.AUTHORED.map(depth).join(""),
    "kids/parent": +(parents.reduce((a, n) => a + n.children!.length, 0) / Math.max(1, parents.length)).toFixed(1),
    "refs/node": +(nodes.reduce((a, n) => a + (n.code?.length ?? 0), 0) / nodes.length).toFixed(1),
    "diagram %": Math.round((100 * nodes.filter((n) => n.anatomy?.some((b) => b.kind === "diagram")).length) / nodes.length),
    "boxes/diagram": +(diagrams.reduce((a, d) => a + d.boxes.length, 0) / Math.max(1, diagrams.length)).toFixed(1),
    "opens %": Math.round((100 * linked.reduce((a, x) => a + x, 0)) / Math.max(1, linked.length)),
    "blocks/node": +(blocks.length / nodes.length).toFixed(1),
    issues: nodes.reduce((a, n) => a + (n.issues?.length ?? 0), 0),
    "not certain %": Math.round((100 * nodes.filter((n) => n.state !== "derived").length) / nodes.length),
    problems,
    "verify %": report?.verifyPassRate ?? "",
    usd: report?.fullUsd ?? "",
    // Tokens sent and received over the whole run, cached prompt reads included (in thousands).
    "k tokens": report ? Math.round(Object.values(report.bill as Record<string, { input: number; output: number; cacheRead: number }>).reduce((a, b) => a + b.input + b.output + b.cacheRead, 0) / 1000) : "",
    min: report ? Math.round(report.elapsed.total / 60) : "",
  };
}

/**
 * How far a fresh cut drifts from the map's own: for each source file, do the
 * two cuts put it with the same neighbours? Root ids and titles differ between
 * samples, so files are compared pairwise — two files together in one cut and
 * apart in the other is a disagreement.
 */
export function stability(name: string, otherCutFile: string): string {
  const a: Cut = JSON.parse(readFileSync(`maps/${name}/.cache/cut.json`, "utf8"));
  const b: Cut = JSON.parse(readFileSync(otherCutFile, "utf8"));
  const sums = Object.keys(JSON.parse(readFileSync(`maps/${name}/.cache/summaries.json`, "utf8")));
  const key = (c: Cut, p: string) => owners(c, p).sort().join(",") || "(excluded)";
  let agree = 0, total = 0;
  for (let i = 0; i < sums.length; i++)
    for (let j = i + 1; j < sums.length; j++) {
      const sa = key(a, sums[i]) === key(a, sums[j]);
      const sb = key(b, sums[i]) === key(b, sums[j]);
      total++;
      if (sa === sb) agree++;
    }
  return `${name}: ${a.roots.length} vs ${b.roots.length} roots; pairwise file-grouping agreement ${((100 * agree) / total).toFixed(1)}% over ${sums.length} files\n  A: ${a.roots.map((r) => r.title).join(" · ")}\n  B: ${b.roots.map((r) => r.title).join(" · ")}`;
}
