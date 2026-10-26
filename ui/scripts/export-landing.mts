// usage (from ui/): npx -y tsx --tsconfig tsconfig.json scripts/export-landing.mts --base-path /repo
//   builds the landing page as a static site in out/landing/, for the root of GitHub Pages.
//   Its demo frames each map's own export at <base-path>/<map>/, so publish those beside it
//   (export-static.mts, publish-pages.sh).
import { spawnSync } from "node:child_process";
import { readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };

const out = resolve("out", "landing");
rmSync(out, { recursive: true, force: true });
renameSync("app/api", ".api-aside");
let status: number | null;
try {
  status = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Any map will do: it only makes `/` static so the export builds. Only the landing page is kept.
      NEXT_PUBLIC_STATIC_MAP: "understand-slop",
      NEXT_PUBLIC_BASE_PATH: opt("--base-path") ?? "",
      SLOP_EXPORT_DIR: "out/landing",
    },
  }).status;
} finally {
  renameSync(".api-aside", "app/api");
}
if (status !== 0) process.exit(status ?? 1);
// The landing page becomes the site's index; everything but it and its assets goes.
renameSync(join(out, "landing.html"), join(out, "index.html.landing"));
for (const f of readdirSync(out)) if (f !== "_next" && f !== "index.html.landing") rmSync(join(out, f), { recursive: true });
renameSync(join(out, "index.html.landing"), join(out, "index.html"));
writeFileSync(join(out, ".nojekyll"), "");
console.log(`${out}: landing page and its assets`);
