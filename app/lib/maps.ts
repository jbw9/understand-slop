/**
 * Server-side: every map the app can open, and the repo each one reads its
 * code from. They are the reader's own projects in the vault (lib/vault.ts),
 * which stay on their machine; the app ships no example maps.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Run } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { apply, overlayFile, readOverlay } from "@/lib/overlay";
import { listProjects, mapFileOf, markOpened, projectDir } from "@/lib/vault";

/** One entry in the map picker. */
export interface MapEntry {
  id: string;
  label: string;
  /** One of the reader's projects, which follows edits; false only for the one map a static export serves. */
  local: boolean;
}

/**
 * How the map was made: the audit.md its last run wrote beside it
 * (scripts/generate/audit.ts). Only for a listed project, so the id, which
 * arrives from the page, never names a path; null when its map was made
 * before runs kept one.
 */
export function auditOf(id: string): string | null {
  const dir = listProjects().some((p) => p.id === id) ? projectDir(id) : null;
  const f = dir && join(dir, "audit.md");
  return f && existsSync(f) ? readFileSync(f, "utf8") : null;
}

/** Every map that can be opened: the reader's projects that have one. */
export function listMaps(): MapEntry[] {
  return listProjects()
    .filter((p) => mapFileOf(p.id))
    .map((p) => ({ id: p.id, label: p.name, local: true }));
}

/**
 * `name` arrives from the URL, so only a listed map is ever read. A project's
 * map is given the project's directory as its root: that is where the reader
 * keeps it, whatever the generator recorded. With no name, or one that is not
 * a project, the reader's most recently opened project opens; null when they
 * have none yet.
 */
export function loadMap(name: string | undefined): { name: string; version?: string; file: MapFile } | null {
  const projects = listProjects();
  const opened = (p: (typeof projects)[number]) => Date.parse(p.openedAt ?? p.addedAt);
  const project =
    (name ? projects.find((p) => p.id === name && mapFileOf(p.id)) : undefined) ??
    projects.filter((p) => mapFileOf(p.id)).sort((a, b) => opened(b) - opened(a))[0];
  const file = project && mapFileOf(project.id);
  if (project && file) {
    markOpened(project.id);
    const version = mapVersion(project.id);
    return { name: project.id, version, file: readMap(project.id, project.root, file) };
  }
  return null;
}

function readMap(id: string, root: string, file: string): MapFile {
  const map: MapFile = JSON.parse(readFileSync(file, "utf8"));
  map.RUN.root = root;
  // What the reader added, composed in here so every consumer sees it.
  return apply(map, readOverlay(id)).file;
}

const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);

/**
 * Which state of a project's map is on disk: the times of the two files it is
 * composed from. The generator and the updater rename a whole new file into
 * place, so a new time is a new map, and the open page follows it
 * (app/api/map/route.ts). Undefined for anything that is not a project with a map.
 */
export function mapVersion(id: string): string | undefined {
  const file = listProjects().some((p) => p.id === id) && mapFileOf(id);
  return file ? `${mtime(file)}:${mtime(overlayFile(id))}` : undefined;
}

/**
 * A project's map as the open page shows it, read again because it changed.
 * The version is taken before the read: a write landing between the two makes
 * the file newer than its stamp, so the next poll reads it again rather than
 * missing it.
 */
export function liveMap(id: string): { version: string; file: MapFile } | null {
  const project = listProjects().find((p) => p.id === id);
  const version = mapVersion(id);
  const f = project && mapFileOf(id);
  if (!project || !version || !f) return null;
  const file = readMap(id, project.root, f);
  file.RUN.url ??= remoteOf(file.RUN);
  return { version, file };
}

/**
 * The landing page's demo maps (landing/demo/<name>), committed with that page
 * rather than shipped with the app (D63). Read only for a page the landing
 * frames (`?embed`) or a static export of one; the reader's own map list never
 * includes them. Null outside a checkout of this repo, as in the desktop app.
 */
const DEMOS = join(process.cwd(), "..", "landing", "demo");

function isDemo(name: string | undefined): name is string {
  return Boolean(name && /^[\w.-]+$/.test(name) && existsSync(join(DEMOS, name, "map.json")));
}

export function loadDemo(name: string | undefined): { name: string; file: MapFile } | null {
  return isDemo(name) ? { name, file: JSON.parse(readFileSync(join(DEMOS, name, "map.json"), "utf8")) } : null;
}

const baked = new Map<string, Record<string, string>>();

/**
 * A demo's cited files as they were when its map was made (`source.json`
 * beside it), for a machine without its checkout. Keyed by repo-relative path,
 * so a caller's path never reaches the disk. Undefined when one of the
 * reader's projects has the same name: a project mapped from this very
 * checkout is called `understand-slop` too, and its code is on disk, as it is
 * now, not as the demo froze it.
 */
export function demoSource(name: string | undefined): Record<string, string> | undefined {
  if (!isDemo(name) || listProjects().some((p) => p.id === name && mapFileOf(p.id))) return undefined;
  const file = join(DEMOS, name, "source.json");
  if (!baked.has(name) && existsSync(file)) baked.set(name, JSON.parse(readFileSync(file, "utf8")));
  return baked.get(name);
}

/** Where checkouts usually live, under home, in the order they are tried. */
const CODE_DIRS = ["Desktop/Code", "projects", "Projects", "code", "Code", "src", "dev", "repos", "git"];

/**
 * Where a map's code lives. A generated map records its absolute root; a
 * hand-authored one names only its repo, so a literal `/Users/<name>/…` is
 * never baked into a fixture, and is looked for in the usual folders. With no
 * checkout found it stays at ~/Desktop/Code.
 */
export function rootOf(run: Run): string {
  if (run.root) return run.root;
  if (process.env.SLOP_REPO_ROOT) return process.env.SLOP_REPO_ROOT;
  const tried = CODE_DIRS.map((d) => resolve(homedir(), d, run.repo));
  return tried.find((d) => existsSync(d) && statSync(d).isDirectory()) ?? tried[0];
}

/** The checkout's `origin` as a web address (`git@host:o/r.git` → `https://host/o/r`), if it has one. */
export function remoteOf(run: Run): string | undefined {
  try {
    const url = execFileSync("git", ["-C", rootOf(run), "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return url.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "").replace(/^https:\/\/[^@/]+@/, "https://") || undefined;
  } catch {
    return undefined;
  }
}
