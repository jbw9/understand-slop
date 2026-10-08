#!/usr/bin/env node
// slop — understand a codebase as a map of cards, and edit it from there.
//
//   slop [dir]            index dir (default .), serve its map, open the browser
//   slop index [dir]      write dir/.slop/index.json: every function, class, method
//   slop symbols [dir] [text]
//                         list the index, one unit per line (filtered by text)
//   slop check [dir]      validate dir/.slop/story.json against the code
//   slop schema           print the JSON Schema a story is written against
//   slop demo             serve the bundled demo maps (read-only)
//   slop install-skill    copy the /slop-map skill to ~/.claude/skills
//
// Options: --port N, --no-open, --dev (run `next dev`, for working on slop).
//
// The map's story (.slop/story.json) is written by the /slop-map skill in
// Claude Code; everything else here is machine work. See README.md.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI = path.join(ROOT, "ui");
const require = createRequire(path.join(UI, "package.json"));
if (!existsSync(path.join(UI, "node_modules", "next"))) {
  console.error(`slop: the app isn't installed yet. Run \`npm install\` in ${ROOT}.`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const [, v] = argv.splice(i, 2);
  return v;
};
const dev = flag("--dev");
const noOpen = flag("--no-open");
const port = option("--port");
const COMMANDS = new Set(["index", "symbols", "check", "schema", "demo", "install-skill", "open", "help"]);
const cmd = COMMANDS.has(argv[0]) ? argv.shift() : "open";
const dirArg = argv[0] ?? ".";

/** The app's TypeScript modules, loaded with the app's own `@/` alias. One
 *  loader for all of them, so they share module instances (and `instanceof`). */
let jiti;
function app(module) {
  jiti ??= require("jiti").createJiti(import.meta.url, { alias: { "@": UI } });
  return jiti(path.join(UI, module));
}

function repoDir(arg = dirArg) {
  const dir = path.resolve(arg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`${arg}: not a directory`);
  return dir;
}

function die(msg) {
  console.error(`slop: ${msg}`);
  process.exit(1);
}

/** Index a repo and write .slop/index.json (kept out of git by .slop/.gitignore). */
function index(dir) {
  const { indexRepo } = app("lib/server/indexer.ts");
  const { writeIndex } = app("lib/server/repo.ts");
  const t = Date.now();
  const symbols = indexRepo(dir);
  writeIndex(dir, symbols);
  const ignore = path.join(dir, ".slop", ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# rebuilt from the code by `slop index`\nindex.json\n");
  const files = new Set(Object.values(symbols).map((s) => s.file)).size;
  console.log(`indexed ${Object.keys(symbols).length} units in ${files} files (${Date.now() - t}ms) → .slop/index.json`);
  return symbols;
}

/**
 * Validate the story against the code. Errors (a broken file) exit 1;
 * warnings (code the story names that is gone) are listed and exit 0.
 */
function check(dir, quiet = false, symbols = undefined) {
  const { repoMap, StoryError } = app("lib/server/repo.ts");
  const { parseMap, MapError } = app("lib/load.ts");
  try {
    const map = parseMap(repoMap(dir, undefined, symbols));
    const cards = map.allNodes().length;
    if (!quiet || map.warnings.length) {
      const rel = path.relative(process.cwd(), path.join(dir, ".slop", "story.json"));
      console.log(`${rel.startsWith("..") ? path.join(dir, ".slop", "story.json") : rel}: ${cards} cards, ${map.warnings.length} warning${map.warnings.length === 1 ? "" : "s"}`);
    }
    for (const w of map.warnings) console.log(`  warning  ${w}`);
    return true;
  } catch (e) {
    if (e instanceof StoryError || e instanceof MapError) {
      for (const p of e.problems) console.log(`  error  ${p}`);
      return false;
    }
    throw e;
  }
}

/** Is the production build older than the app's source? */
function buildStale() {
  const id = path.join(UI, ".next", "BUILD_ID");
  if (!existsSync(id)) return true;
  const built = statSync(id).mtimeMs;
  const newest = (p) => {
    const s = statSync(p);
    if (!s.isDirectory()) return s.mtimeMs;
    return Math.max(0, ...readdirSync(p).map((f) => newest(path.join(p, f))));
  };
  return ["app", "components", "lib", "public", "next.config.ts", "package.json"].some(
    (p) => existsSync(path.join(UI, p)) && newest(path.join(UI, p)) > built,
  );
}

function freePort(from) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(freePort(from + 1)));
    s.listen(from, "127.0.0.1", () => s.close(() => resolve(from)));
  });
}

function openBrowser(url) {
  const [bin, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  spawn(bin, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

/** Run the app on 127.0.0.1 — on a repo when `dir` is given, else the demos. */
async function serve(dir) {
  const next = path.join(UI, "node_modules", "next", "dist", "bin", "next");
  if (!dev && buildStale()) {
    console.log("building the app (first run, or slop was updated)…");
    const b = spawnSync(process.execPath, [next, "build"], { cwd: UI, stdio: ["ignore", "ignore", "inherit"] });
    if (b.status !== 0) die("the build failed; run `npm run build` in ui/ to see why");
  }
  const at = port ? Number(port) : await freePort(4747);
  const env = { ...process.env, ...(dir ? { SLOP_REPO: dir } : {}) };
  if (!dir) delete env.SLOP_REPO;
  const child = spawn(process.execPath, [next, dev ? "dev" : "start", "-H", "127.0.0.1", "-p", String(at)], {
    cwd: UI,
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));

  const url = `http://127.0.0.1:${at}/`;
  for (let i = 0; i < 600; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`${dir ? path.basename(dir) : "demo maps"} → ${url}   (ctrl+c to stop)`);
  if (!noOpen) openBrowser(url);
}

switch (cmd) {
  case "index":
    index(repoDir());
    break;

  case "symbols": {
    const dir = repoDir();
    const file = path.join(dir, ".slop", "index.json");
    const symbols = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).symbols : index(dir);
    const filter = argv[1]?.toLowerCase();
    for (const [id, s] of Object.entries(symbols)) {
      const line = `${id}  ${s.kind}  ${s.start}-${s.end}  ${s.signature}`;
      if (!filter || line.toLowerCase().includes(filter)) console.log(line);
    }
    break;
  }

  case "check":
    process.exit(check(repoDir()) ? 0 : 1);
    break;

  case "schema":
    process.stdout.write(readFileSync(path.join(UI, "public", "maps", "story.schema.json"), "utf8"));
    break;

  case "demo":
    await serve(null);
    break;

  case "install-skill": {
    const to = path.join(os.homedir(), ".claude", "skills", "slop-map");
    mkdirSync(to, { recursive: true });
    cpSync(path.join(ROOT, "skills", "slop-map"), to, { recursive: true });
    console.log(`installed /slop-map → ${to}`);
    break;
  }

  case "help":
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 17).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    break;

  default: {
    const dir = repoDir();
    if (!existsSync(path.join(dir, ".slop", "story.json"))) {
      die(`${dir} has no map yet.\n  In Claude Code, in that directory, run /slop-map (install it once with \`slop install-skill\`).`);
    }
    const symbols = index(dir);
    if (!check(dir, true, symbols)) die("the story has errors (above); fix them or re-run /slop-map");
    await serve(dir);
  }
}
