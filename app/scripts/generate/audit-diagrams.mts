// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/generate/audit-diagrams.mts [map…]
//   Lays out every diagram in every map (or the named ones) exactly as the page does and reports
//   text drawn over text or over a box, lines drawn through a box they do not connect, and pictures
//   too wide to read. A label across another line is counted, not failed: it is drawn with a halo.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Anatomy, Node } from "@/lib/data";
import { layoutProblems } from "./check";

const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("maps").filter((d) => existsSync(`maps/${d}/map.json`)).sort();

let total = 0;
for (const name of names) {
  const map = JSON.parse(readFileSync(`maps/${name}/map.json`, "utf8"));
  const problems: string[] = [];
  let count = 0, crossings = 0;
  const walk = (n: Node) => {
    for (const block of n.anatomy ?? []) {
      if (block.kind !== "diagram") continue;
      count++;
      const r = layoutProblems(block as Extract<Anatomy, { kind: "diagram" }>);
      crossings += r.crossings;
      problems.push(...r.problems.map((p) => `${n.id}: ${p}`));
    }
    (n.children ?? []).forEach(walk);
  };
  map.AUTHORED.forEach(walk);
  total += problems.length;
  console.log(`${name}: ${count} diagrams, ${problems.length} problems, ${crossings} labels across a line (haloed)`);
  for (const p of problems) console.log(`  ${p}`);
}
process.exit(total ? 1 : 0);
