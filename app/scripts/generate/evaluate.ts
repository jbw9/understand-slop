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
import { check, LEAF } from "./check";
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
  // How far each leaf is from being one piece of code (LEAF in check.ts).
  const leaves = nodes.filter((n) => !n.children?.length);
  const span = (n: Node) => (n.code ?? []).reduce((a, c) => a + c.end - c.start + 1, 0);
  const fat = leaves.filter((n) => (n.code?.length ?? 0) > LEAF.refs || new Set((n.code ?? []).map((c) => c.file)).size > LEAF.files || span(n) > LEAF.lines);
  const spans = leaves.map(span).sort((a, b) => a - b);
  const parentBoxes = parents.flatMap((n) => (n.anatomy ?? []).flatMap((b: any) => (b.kind === "diagram" ? b.boxes : [])));
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)] : 0);
  // How much of a leaf's explanation leads to its code, and how much of the map a newcomer can read.
  const steps = leaves.flatMap((n) => (n.anatomy ?? []).flatMap((b: any) => (b.kind === "flow" || b.kind === "sequence" ? b.rows : [])));
  const explained = nodes.filter((n) => n.explain?.body);
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
    "parts w/o box %": Math.round((100 * linked.reduce((a, x) => a + (1 - x), 0)) / Math.max(1, linked.length)),
    "inert boxes %": Math.round((100 * parentBoxes.filter((x: any) => !x.opens).length) / Math.max(1, parentBoxes.length)),
    "fat leaves %": Math.round((100 * fat.length) / Math.max(1, leaves.length)),
    "leaf refs": +(leaves.reduce((a, n) => a + (n.code?.length ?? 0), 0) / Math.max(1, leaves.length)).toFixed(1),
    "leaf lines med": median(spans),
    "leaf lines max": spans[spans.length - 1] ?? 0,
    "leaf blocks": +(leaves.reduce((a, n) => a + (n.anatomy?.length ?? 0), 0) / Math.max(1, leaves.length)).toFixed(1),
    "leaf diagrams %": Math.round((100 * leaves.filter((n) => n.anatomy?.some((b) => b.kind === "diagram")).length) / Math.max(1, leaves.length)),
    "steps cited %": Math.round((100 * steps.filter((r: any) => r.at).length) / Math.max(1, steps.length)),
    "explain %": Math.round((100 * explained.length) / nodes.length),
    "explain words": median(explained.map((n) => n.explain!.body.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)),
    "explain pics %": Math.round((100 * explained.filter((n) => n.explain!.blocks?.length).length) / Math.max(1, explained.length)),
    "explain kinds": [...new Set(explained.flatMap((n) => (n.explain!.blocks ?? []).map((b) => b.kind)))].join(","),
    glossary: map.OVERVIEW?.glossary?.length ?? 0,
    walk: map.OVERVIEW?.walkthrough?.steps.length ?? 0,
    "detail words": median(nodes.map((n) => (n.detail ?? "").split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)),
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
