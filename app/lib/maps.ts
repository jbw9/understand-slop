/**
 * Server-side: every map the app can open, and the repo each one reads its
 * code from. Two kinds: the examples committed under `app/maps/<name>/map.json`,
 * and the reader's own projects in the vault (lib/vault.ts), which stay on
 * their machine.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Run } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { apply, readOverlay } from "@/lib/overlay";
import { listProjects, mapFileOf, markOpened } from "@/lib/vault";

const MAPS = join(process.cwd(), "maps");
export const DEFAULT_MAP = "explorify";

/** One entry in the map picker. */
export interface MapEntry {
  id: string;
  label: string;
  /** Imported from this machine, not one of the committed examples. */
  local: boolean;
}

/** The committed examples. */
export function listExamples(): string[] {
  return readdirSync(MAPS).filter((d) => existsSync(join(MAPS, d, "map.json"))).sort();
}

/** Every map that can be opened: the reader's projects that have one, then the examples. */
export function listMaps(): MapEntry[] {
  const mine = listProjects()
    .filter((p) => mapFileOf(p.id))
    .map((p) => ({ id: p.id, label: p.name, local: true }));
  return [...mine, ...listExamples().map((id) => ({ id, label: id, local: false }))];
}

/**
 * `name` arrives from the URL, so only a listed map is ever read. A project's
 * map is given the project's directory as its root: that is where the reader
 * keeps it, whatever the generator recorded. With no name the reader's most
 * recently opened project opens, and only with none of their own an example.
 */
export function loadMap(name: string | undefined): { name: string; file: MapFile } {
  const projects = listProjects();
  const opened = (p: (typeof projects)[number]) => Date.parse(p.openedAt ?? p.addedAt);
  const project = name
    ? projects.find((p) => p.id === name)
    : projects.filter((p) => mapFileOf(p.id)).sort((a, b) => opened(b) - opened(a))[0];
  const file = project && mapFileOf(project.id);
  if (project && file) {
    markOpened(project.id);
    const map: MapFile = JSON.parse(readFileSync(file, "utf8"));
    map.RUN.root = project.root;
    // What the reader added, composed in here so every consumer sees it. Only
    // a project gets one: an example is a committed fixture, read-only by
    // design and shared by every reader of this checkout.
    const { file: composed } = apply(map, readOverlay(project.id));
    return { name: project.id, file: composed };
  }
  const pick = name && listExamples().includes(name) ? name : DEFAULT_MAP;
  return { name: pick, file: JSON.parse(readFileSync(join(MAPS, pick, "map.json"), "utf8")) };
}

/** Where checkouts usually live, under home, in the order they are tried. */
const CODE_DIRS = ["Desktop/Code", "projects", "Projects", "code", "Code", "src", "dev", "repos", "git"];

/**
 * Where a map's code lives. A generated map records its absolute root; a
 * hand-authored one names only its repo, so a literal `/Users/<name>/…` is
 * never baked into a fixture, and is looked for in the usual folders. With no
 * checkout found it stays at ~/Desktop/Code, where the examples were made.
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
