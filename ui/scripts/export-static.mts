// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/export-static.mts <map> --base-path /repo/map --source-url https://github.com/o/r/blob/<sha>
//   builds one map as a static site in out/<map>/, ready for GitHub Pages. The files the map
//   cites are baked into source.json, so the drawer reads code with no server; each code card
//   links to --source-url instead of offering an edit.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Node } from "@/lib/data";
import { loadMap, rootOf } from "@/lib/maps";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
const name = args[0];
const { name: found, file } = loadMap(name);
if (found !== name) throw new Error(`no map named ${name}`);

const root = rootOf(file.RUN);
const cited = new Set<string>();
const walk = (n: Node) => {
  for (const c of n.code ?? []) cited.add(c.file);
  (n.children ?? []).forEach(walk);
};
file.AUTHORED.forEach(walk);
const source = Object.fromEntries([...cited].sort().map((f) => [f, readFileSync(join(root, f), "utf8")]));

const out = resolve("out", name);
rmSync(out, { recursive: true, force: true });
// A static export cannot hold the route that reads and writes the checkout, so it sits out the build.
renameSync("app/api", ".api-aside");
try {
  const r = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_MAP: name,
      NEXT_PUBLIC_BASE_PATH: opt("--base-path") ?? "",
      NEXT_PUBLIC_SOURCE_URL: opt("--source-url") ?? "",
      SLOP_EXPORT_DIR: `out/${name}`,
    },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
} finally {
  renameSync(".api-aside", "app/api");
}
writeFileSync(join(out, "source.json"), JSON.stringify(source));
// Pages runs Jekyll by default, which drops `_next/`.
writeFileSync(join(out, ".nojekyll"), "");
console.log(`${out}: ${cited.size} cited files baked in${existsSync(join(out, "index.html")) ? "" : " — but no index.html!"}`);
