/**
 * Server-side: the project vault — the reader's own projects, imported from
 * their machine. It lives in the app's data directory, never in this repo, so
 * an imported project and its map stay local: the only maps ever committed are
 * the examples under `ui/maps/`.
 *
 *   <vault>/projects.json             the list below
 *   <vault>/projects/<id>/map.json    the map, as the generator writes it
 *   <vault>/projects/<id>/report.json what generating it took
 *   <vault>/projects/<id>/generate.log the generator's output, for progress and errors
 *   <vault>/projects/<id>/.cache/     model replies, so a regenerate is cheap
 *
 * The directory is the one Tauri names for this app (`app_data_dir`: the OS
 * data directory plus the bundle identifier), so the desktop app and this
 * server agree on it without being told. SLOP_VAULT overrides it.
 */

import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const IDENTIFIER = "dev.understand-slop.app";

function dataDir(): string {
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library", "Application Support");
  if (process.platform === "win32") return process.env.APPDATA ?? join(home, "AppData", "Roaming");
  return process.env.XDG_DATA_HOME || join(home, ".local", "share");
}

export const VAULT = process.env.SLOP_VAULT ?? join(dataDir(), IDENTIFIER);
const INDEX = join(VAULT, "projects.json");
export const projectDir = (id: string) => join(VAULT, "projects", id);

export type MapStatus = "generating" | "ready" | "failed" | "cancelled";

export interface Project {
  /** The `?map=` key: unique across examples and projects, safe as a directory name. */
  id: string;
  /** What the reader called it. */
  name: string;
  /** Absolute path of the checkout. Terminals open here; the map's code is read from here. */
  root: string;
  addedAt: string;
  /** Last time its map was opened, for ordering the list. */
  openedAt?: string;
  /** The checkout's git state when it was imported. */
  git?: { remote?: string; branch?: string };
  map: {
    status: MapStatus;
    startedAt: string;
    finishedAt?: string;
    /** The generator, while it runs. */
    pid?: number;
    /** The commit the map describes; differs from the checkout's HEAD once the code moves on. */
    commit?: string;
    /** Through Claude Code this is the API list price of the same tokens, not a bill. */
    usd?: number;
    seconds?: number;
    /** The last lines of the log, when it failed. */
    error?: string;
  };
}

interface Index {
  version: 1;
  projects: Project[];
}

export function readVault(): Index {
  try {
    const v = JSON.parse(readFileSync(INDEX, "utf8")) as Index;
    if (v.version === 1 && Array.isArray(v.projects)) return v;
  } catch {
    /* none yet, or unreadable: start empty rather than refuse to load */
  }
  return { version: 1, projects: [] };
}

/** Written whole and renamed into place, so a crash never leaves half a list. */
function writeVault(v: Index) {
  mkdirSync(VAULT, { recursive: true });
  const tmp = `${INDEX}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 1) + "\n");
  renameSync(tmp, INDEX);
}

function update(id: string, f: (p: Project) => void) {
  const v = readVault();
  const p = v.projects.find((x) => x.id === id);
  if (!p) return;
  f(p);
  writeVault(v);
}

export function getProject(id: string): Project | undefined {
  return readVault().projects.find((p) => p.id === id);
}

export function markOpened(id: string) {
  try {
    update(id, (p) => (p.openedAt = new Date().toISOString()));
  } catch {
    /* a read-only vault still shows the map */
  }
}

const git = (root: string, ...args: string[]) => {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
};

/** Where the checkout's code is now, to tell a map that has fallen behind. */
export const headOf = (root: string) => git(root, "rev-parse", "--short", "HEAD");

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function logTail(id: string, lines = 12): string {
  try {
    return readFileSync(join(projectDir(id), "generate.log"), "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

/** What a finished run left behind: the map's commit and the report's time and price. */
function finished(p: Project, ok: boolean) {
  const dir = projectDir(p.id);
  p.map.pid = undefined;
  p.map.finishedAt = new Date().toISOString();
  if (ok && existsSync(join(dir, "map.json"))) {
    p.map.status = "ready";
    p.map.error = undefined;
    try {
      const r = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
      p.map.commit = r.commit;
      p.map.usd = r.usd;
      p.map.seconds = r.elapsed?.total;
    } catch {
      /* the map stands without its report */
    }
  } else if (p.map.status !== "cancelled") {
    p.map.status = "failed";
    p.map.error = logTail(p.id) || "The generator stopped without saying why.";
  }
}

/**
 * The list, squared with reality. A generator outlives the server that
 * started it (it runs detached), so one that is gone without being heard from
 * is judged by what it left: a map newer than the run means it finished.
 */
export function listProjects(): Project[] {
  const v = readVault();
  let changed = false;
  for (const p of v.projects) {
    if (p.map.status !== "generating" || (p.map.pid && alive(p.map.pid))) continue;
    const map = join(projectDir(p.id), "map.json");
    const ok = existsSync(map) && statSync(map).mtimeMs > Date.parse(p.map.startedAt);
    finished(p, ok);
    changed = true;
  }
  if (changed) writeVault(v);
  return v.projects;
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";

/** Every id already taken, so an import never shadows an example or another project. */
function freeId(name: string, taken: Set<string>) {
  const base = slug(name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export class ImportError extends Error {}

/** Register a checkout and start mapping it. */
export function importProject(rootIn: string, nameIn: string | undefined, examples: string[], claude?: string): Project {
  const root = resolve(rootIn.replace(/^~(?=$|\/)/, homedir()));
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new ImportError("That is not a directory.");
  const v = readVault();
  const same = v.projects.find((p) => p.root === root);
  if (same) throw new ImportError(`Already imported as "${same.name}".`);
  const name = nameIn?.trim() || basename(root);
  const id = freeId(name, new Set([...examples, ...v.projects.map((p) => p.id)]));
  const now = new Date().toISOString();
  const project: Project = {
    id,
    name,
    root,
    addedAt: now,
    git: { remote: git(root, "remote", "get-url", "origin"), branch: git(root, "rev-parse", "--abbrev-ref", "HEAD") },
    map: { status: "generating", startedAt: now },
  };
  v.projects.push(project);
  writeVault(v);
  return generate(id, claude) ?? project;
}

/**
 * Run the generator (scripts/generate) on a project, through the reader's own
 * Claude Code. Detached, in its own process group, so it survives a reload of
 * this server and Cancel can end it and every `claude` it started at once.
 */
export function generate(id: string, claude?: string): Project | undefined {
  const p = getProject(id);
  if (!p) return undefined;
  if (p.map.status === "generating" && p.map.pid && alive(p.map.pid)) return p;
  const dir = projectDir(id);
  mkdirSync(dir, { recursive: true });
  const log = openSync(join(dir, "generate.log"), "w");
  const child = spawn(
    "npx",
    ["-y", "tsx", "--tsconfig", "tsconfig.json", "scripts/generate/run.mts", p.root, "--name", id, "--out", dir],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, SLOP_BACKEND: "claude-code", ...(claude ? { SLOP_CLAUDE: claude } : {}) },
    },
  );
  closeSync(log);
  child.unref();
  const startedAt = new Date().toISOString();
  update(id, (q) => {
    q.map = { ...q.map, status: "generating", startedAt, pid: child.pid, finishedAt: undefined, error: undefined };
  });
  child.on("exit", (code) => update(id, (q) => finished(q, code === 0)));
  child.on("error", (e) =>
    update(id, (q) => {
      q.map.status = "failed";
      q.map.pid = undefined;
      q.map.error = String(e);
    }),
  );
  return getProject(id);
}

export function cancel(id: string) {
  const p = getProject(id);
  if (!p?.map.pid) return;
  update(id, (q) => (q.map.status = "cancelled"));
  try {
    process.kill(-p.map.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

/** Forget a project and its map. The checkout itself is never touched. */
export function removeProject(id: string) {
  cancel(id);
  const v = readVault();
  v.projects = v.projects.filter((p) => p.id !== id);
  writeVault(v);
  rmSync(projectDir(id), { recursive: true, force: true });
}

/** The project's map file, if one has been made. */
export function mapFileOf(id: string): string | undefined {
  const f = join(projectDir(id), "map.json");
  return existsSync(f) ? f : undefined;
}

/** What the list shows while a map is being made: the generator's last line. */
export const progressOf = (id: string) => logTail(id, 1);
