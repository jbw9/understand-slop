// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/export-map.mts <fixture module> <name>
//   e.g. scripts/export-map.mts @/lib/explorify explorify  →  maps/explorify/map.json
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const [mod, name] = process.argv.slice(2);
const base = mod.replace("@/", process.cwd() + "/");
const f = await import(existsSync(`${base}/index.ts`) ? `${base}/index.ts` : `${base}.ts`);
mkdirSync(`maps/${name}`, { recursive: true });
writeFileSync(`maps/${name}/map.json`, JSON.stringify({ RUN: f.RUN, AUTHORED: f.AUTHORED, E0: f.E0, LINKS: f.LINKS }, null, 1) + "\n");
console.log(`maps/${name}/map.json`);
