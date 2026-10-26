/**
 * Server-side: the project vault — the reader's own projects, imported from
 * their machine. It lives in the app's data directory, never in this repo, so
 * an imported project and its map stay local: the only maps ever committed are
 * the examples under `app/maps/`.
 *
 *   <vault>/projects.json             the list below
 *   <vault>/projects/<id>/map.json    the map, as the generator writes it
 *   <vault>/projects/<id>/report.json what generating it took
 *   <vault>/projects/<id>/generate.log the generator's output, for progress and errors
 *   <vault>/projects/<id>/progress.json how far a run in flight has got, root by root
 *   <vault>/projects/<id>/.cache/     model replies, so a regenerate is cheap
 *   <vault>/projects/<id>/base.json   the code as the last update saw it (scripts/generate/update.ts)
 *   <vault>/projects/<id>/update.json what the last update did
 *   <vault>/projects/<id>/update.log  its output
 *   <vault>/projects/<id>/turns.json  agents' turns waiting for the next update to take them
 *
 * The directory is the one Tauri names for this app (`app_data_dir`: the OS
 * data directory plus the bundle identifier), so the desktop app and this
 * server agree on it without being told. SLOP_VAULT overrides it.
 */

import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/** `empty`: a project started from scratch, with no code to map yet. */
export type MapStatus = "generating" | "ready" | "failed" | "cancelled" | "empty";

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
  /**
   * Keeping the map up with the code: after an agent's turn edits it, only
   * the sections the edits touched are redone (scripts/generate/update.ts).
   */
  update?: {
    status: "running" | "done" | "failed";
    startedAt: string;
    finishedAt?: string;
    pid?: number;
    /** Another turn ended while this ran: run again once it is done. */
    again?: boolean;
    changed?: string[];
    /** The sections redone, by title. */
    sections?: string[];
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
    if (p.update?.status === "running" && !(p.update.pid && alive(p.update.pid))) {
      updated(p);
      changed = true;
    }
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
 * Start a project from scratch: make `<parent>/<name>` as an empty git
 * checkout and register it. There is no code to map yet, so nothing runs;
 * the reader maps it from the list once there is.
 */
export function createProject(parentIn: string, nameIn: string, examples: string[]): Project {
  const name = nameIn.trim();
  if (!name || /[\\/]/.test(name) || name === "." || name === "..") throw new ImportError("Give it a folder name, without slashes.");
  const parent = resolve(parentIn.replace(/^~(?=$|\/)/, homedir()));
  const root = join(parent, name);
  if (existsSync(root) && (!statSync(root).isDirectory() || readdirSync(root).length))
    throw new ImportError(`${root} already exists. Use an existing folder instead.`);
  const v = readVault();
  const same = v.projects.find((p) => p.root === root);
  if (same) throw new ImportError(`Already imported as "${same.name}".`);
  mkdirSync(root, { recursive: true });
  git(root, "init");
  const now = new Date().toISOString();
  const project: Project = {
    id: freeId(name, new Set([...examples, ...v.projects.map((p) => p.id)])),
    name,
    root,
    addedAt: now,
    map: { status: "empty", startedAt: now },
  };
  v.projects.push(project);
  writeVault(v);
  return project;
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
  // A fresh map starts from the code as it is; what earlier updates saw goes.
  rmSync(join(dir, "base.json"), { force: true });
  rmSync(join(dir, "update.json"), { force: true });
  // The last run's progress would otherwise read as this one's until the
  // first stage overwrites it.
  rmSync(join(dir, "progress.json"), { force: true });
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
    q.update = undefined;
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

/** What a finished update left in update.json. */
function updated(p: Project) {
  const u = p.update!;
  u.pid = undefined;
  u.finishedAt = new Date().toISOString();
  try {
    const r = JSON.parse(readFileSync(join(projectDir(p.id), "update.json"), "utf8"));
    if (Date.parse(r.finishedAt) < Date.parse(u.startedAt)) throw new Error("stale");
    u.status = r.ok ? "done" : "failed";
    u.changed = r.changed;
    u.sections = (r.sections ?? []).map((s: { title: string }) => s.title);
    u.error = r.error;
  } catch {
    u.status = "failed";
    u.error = (() => {
      try {
        return readFileSync(join(projectDir(p.id), "update.log"), "utf8").trimEnd().split("\n").slice(-12).join("\n");
      } catch {
        return "";
      }
    })() || "The update stopped without saying why.";
  }
}

/** An agent's turn the map follows: what it did and why (its transcript), and where it found the map wrong. */
export interface Turn {
  transcript?: string;
  corrections: { section: string; note: string }[];
}

/**
 * Bring a project's map up to the code in its checkout, redoing only what
 * changed or what an agent found wrong (scripts/generate/update.ts). Asked
 * for when an agent in the app finishes a turn that edited the checkout at
 * `root`, or reported the map wrong; the turn waits in turns.json for the
 * update to take it. A map still being made, or not made, is left alone; one
 * already updating runs again after.
 */
export function updateMap(root: string, claude?: string, turn?: Turn): Project | undefined {
  const p = listProjects().find((x) => x.root === root);
  if (!p || p.map.status !== "ready" || !mapFileOf(p.id)) return p;
  if (turn) {
    const file = join(projectDir(p.id), "turns.json");
    let waiting: Turn[] = [];
    try {
      waiting = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* none waiting */
    }
    writeFileSync(file, JSON.stringify([...waiting, turn]) + "\n");
  }
  if (p.update?.status === "running") {
    update(p.id, (q) => (q.update!.again = true));
    return getProject(p.id);
  }
  const dir = projectDir(p.id);
  const log = openSync(join(dir, "update.log"), "w");
  const child = spawn(
    "npx",
    ["-y", "tsx", "--tsconfig", "tsconfig.json", "scripts/generate/run.mts", p.root, "--update", "--out", dir],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, SLOP_BACKEND: "claude-code", ...(claude ? { SLOP_CLAUDE: claude } : {}) },
    },
  );
  closeSync(log);
  child.unref();
  update(p.id, (q) => (q.update = { status: "running", startedAt: new Date().toISOString(), pid: child.pid }));
  child.on("exit", () => {
    let again = false;
    update(p.id, (q) => {
      again = Boolean(q.update?.again);
      updated(q);
    });
    if (again) updateMap(root, claude);
  });
  child.on("error", (e) =>
    update(p.id, (q) => {
      q.update = { ...q.update!, status: "failed", pid: undefined, error: String(e) };
    }),
  );
  return getProject(p.id);
}

/** The project's map file, if one has been made. */
export function mapFileOf(id: string): string | undefined {
  const f = join(projectDir(id), "map.json");
  return existsSync(f) ? f : undefined;
}

/** How far a map still being made has got (scripts/generate/pipeline.ts writes it). */
export interface Progress {
  startedAt: string;
  stage: string;
  roots: { id: string; title: string; status: "queued" | "drafting" | "done" | "failed"; detail?: string }[];
  /** The generator's last line, when it has not written a progress file yet. */
  line?: string;
}

/**
 * What the list shows while a map is being made. The generator's own
 * progress.json where there is one; until the first stage writes it — and for
 * a run started before this file existed — the log's last line.
 */
export function progressOf(id: string): Progress {
  const line = logTail(id, 1);
  try {
    const p = JSON.parse(readFileSync(join(projectDir(id), "progress.json"), "utf8")) as Progress;
    if (typeof p.stage === "string" && Array.isArray(p.roots)) return { ...p, line };
  } catch {
    /* not written yet, or unreadable: the log still says something */
  }
  return { startedAt: "", stage: "", roots: [], line };
}
