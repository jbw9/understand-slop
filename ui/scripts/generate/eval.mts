// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/generate/eval.mts [--stability <name> <fresh cut.json>]
//   One row per map under maps/: shape of the tree against the explorify benchmark, check problems,
//   verify pass rate, cost and time. --stability compares a map's cut with a second, fresh cut.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { evaluate, stability } from "./evaluate";

const args = process.argv.slice(2);
if (args[0] === "--stability") {
  console.log(stability(args[1], args[2]));
  process.exit(0);
}
const names = readdirSync("maps").filter((d) => existsSync(`maps/${d}/map.json`)).sort();
const rows = names.map((n) => evaluate(n, JSON.parse(readFileSync(`maps/${n}/map.json`, "utf8"))));
console.table(rows);
