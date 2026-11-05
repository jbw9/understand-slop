// usage (from app/): npx -y tsx --tsconfig tsconfig.json scripts/generate/graph.mts <repo dir> [--out graph.json] [--ask "<tool> <arg>"]
//   Builds the repository's fact graph (graph.ts) and prints its size: definitions, edges by kind and
//   how sure, and how many calls it resolved. --out writes it; --ask runs one graph tool, as an agent would.
import { writeFileSync } from "node:fs";
import { parseArgs } from "./args";
import { buildGraph } from "./graph";
import { graphTool } from "./graph-tools";
import { inventory } from "./inventory";

const { repo, opt } = parseArgs(process.argv.slice(2));
const inv = inventory(repo ?? ".");
const g = await buildGraph(inv);
const count = (k: string, h: string) => g.edges.filter((e) => e.kind === k && e.how === h).length;
console.log(`${inv.name} @ ${g.commit}: ${g.stats.parsed}/${g.stats.files} code files parsed in ${g.stats.ms} ms`);
console.log(`  ${g.defs.length} definitions`);
for (const k of ["calls", "inherits", "imports"]) console.log(`  ${k}: ${count(k, "extracted")} extracted, ${count(k, "inferred")} inferred`);
console.log(`  calls: ${g.stats.resolved} of ${g.stats.calls} call sites resolved, ${g.stats.ambiguous} left out as ambiguous`);
if (opt("--out")) writeFileSync(opt("--out")!, JSON.stringify(g) + "\n");
const q = opt("--ask");
if (q) {
  const [name, ...rest] = q.split(" ");
  const arg = rest.join(" ");
  console.log("\n" + graphTool(g, { name: `graph_${name}`, input: name === "path" ? { from: arg.split(" ")[0], to: arg.split(" ")[1] } : name === "file" ? { path: arg } : name === "entrypoints" ? {} : { name: arg } }));
}
