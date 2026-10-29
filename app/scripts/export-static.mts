// usage (from app/): npx -y tsx --tsconfig tsconfig.json scripts/export-static.mts <map> --base-path /repo/map --source-url https://github.com/o/r/blob/<sha> [--root <checkout>]
//   builds one map as a static site in out/<map>/, ready for GitHub Pages. The files the map
//   cites are baked into source.json, so the drawer reads code with no server; each code card
//   links to --source-url instead of offering an edit.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Node } from "@/lib/data";
import { demoSource, loadDemo, loadMap, rootOf } from "@/lib/maps";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
const name = args[0];
// One of the landing's demos (landing/demo, D63), or one of this machine's projects.
const open = loadDemo(name) ?? loadMap(name);
if (!open || open.name !== name) throw new Error(`no demo or project named ${name}`);
const { file } = open;
const baked = demoSource(name);

// --root: the checkout to read, when it is not where the map was made.
const root = opt("--root") ?? rootOf(file.RUN);
const cited = new Set<string>();
const walk = (n: Node) => {
  for (const c of n.code ?? []) cited.add(c.file);
  // A step's own lines open from the step, and may sit in a file the node does not cite.
  for (const b of n.anatomy ?? [])
    if (b.kind === "flow" || b.kind === "sequence") for (const r of b.rows) if (r.at) cited.add(r.at.replace(/:[\d-]+$/, ""));
  (n.children ?? []).forEach(walk);
};
file.AUTHORED.forEach(walk);
// A demo carries its cited files; a project's are read from its checkout.
const source = Object.fromEntries([...cited].sort().map((f) => [f, baked?.[f] ?? readFileSync(join(root, f), "utf8")]));

const out = resolve("out", name);
rmSync(out, { recursive: true, force: true });
// A static export cannot hold the route that reads and writes the checkout, so it sits out the build.
renameSync("app/api", ".api-aside");
let status: number | null;
try {
  status = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_MAP: name,
      NEXT_PUBLIC_BASE_PATH: opt("--base-path") ?? "",
      NEXT_PUBLIC_SOURCE_URL: opt("--source-url") ?? "",
      SLOP_EXPORT_DIR: `out/${name}`,
    },
  }).status;
} finally {
  renameSync(".api-aside", "app/api");
}
// After the finally: exiting inside the try would leave app/api renamed.
if (status !== 0) process.exit(status ?? 1);
writeFileSync(join(out, "source.json"), JSON.stringify(source));
// public/shots holds other apps' screens; a map that shows none must not publish them.
if (!JSON.stringify(file.AUTHORED).includes('"shot"')) rmSync(join(out, "shots"), { recursive: true, force: true });
// Pages runs Jekyll by default, which drops `_next/`.
writeFileSync(join(out, ".nojekyll"), "");
console.log(`${out}: ${cited.size} cited files baked in${existsSync(join(out, "index.html")) ? "" : " — but no index.html!"}`);
