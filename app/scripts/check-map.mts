// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/check-map.mts <map name | fixture module> <repo dir> [--roots a,b,c] [--generated]
//   e.g. scripts/check-map.mts explorify ~/Desktop/Code/explorify --roots signup,launch
//        scripts/check-map.mts @/lib/explorify ~/Desktop/Code/explorify
// The rules live in scripts/generate/check.ts.
import { existsSync, readFileSync } from "node:fs";
import { check } from "./generate/check";

const args = process.argv.slice(2);
const flag = args.indexOf("--roots");
const only = flag === -1 ? undefined : new Set(args[flag + 1].split(","));
const generated = args.includes("--generated");
const [mod, repo] = args.filter((a, i) => !a.startsWith("--") && (flag === -1 || i !== flag + 1));
let map;
if (mod.startsWith("@/")) {
  const base = mod.replace("@/", process.cwd() + "/");
  map = await import(existsSync(`${base}/index.ts`) ? `${base}/index.ts` : `${base}.ts`);
} else {
  map = JSON.parse(readFileSync(`maps/${mod}/map.json`, "utf8"));
}
const r = check(map, repo, { only, generated });
for (const x of r.roots) console.log(`root ${x.id.padEnd(14)} depth ${x.depth}  nodes ${x.nodes}`);
console.log(`sources verbatim ${r.sources.ok}/${r.sources.ok + r.sources.bad}; code refs ${r.refs}; problems ${r.problems.length}`);
r.problems.slice(0, Number(process.env.SHOW ?? 60)).forEach((p) => console.log(p));
process.exit(r.problems.length ? 1 : 0);
