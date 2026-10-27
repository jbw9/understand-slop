// usage (from app/): npx -y tsx --tsconfig tsconfig.json scripts/check-map.mts <map name> <repo dir> [--roots a,b,c] [--generated]
//   e.g. scripts/check-map.mts explorify ~/Desktop/Code/explorify --roots signup,launch
// The rules live in scripts/generate/check.ts.
import { readFileSync } from "node:fs";
import { check } from "./generate/check";

const args = process.argv.slice(2);
const flag = args.indexOf("--roots");
const only = flag === -1 ? undefined : new Set(args[flag + 1].split(","));
const generated = args.includes("--generated");
const [name, repo] = args.filter((a, i) => !a.startsWith("--") && (flag === -1 || i !== flag + 1));
const map = JSON.parse(readFileSync(`maps/${name}/map.json`, "utf8"));
const r = check(map, repo, { only, generated });
for (const x of r.roots) console.log(`root ${x.id.padEnd(14)} depth ${x.depth}  nodes ${x.nodes}`);
console.log(`sources verbatim ${r.sources.ok}/${r.sources.ok + r.sources.bad}; code refs ${r.refs}; problems ${r.problems.length}`);
r.problems.slice(0, Number(process.env.SHOW ?? 60)).forEach((p) => console.log(p));
process.exit(r.problems.length ? 1 : 0);
