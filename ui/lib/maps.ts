/**
 * Server-side: the map files under `ui/maps/<name>/map.json`, and the repo
 * each one reads its code from.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Run } from "@/lib/data";
import type { MapFile } from "@/lib/map";

const MAPS = join(process.cwd(), "maps");
export const DEFAULT_MAP = "explorify";

export function listMaps(): string[] {
  return readdirSync(MAPS).filter((d) => existsSync(join(MAPS, d, "map.json"))).sort();
}

/** `name` arrives from the URL, so only a listed map is ever read. */
export function loadMap(name: string | undefined): { name: string; file: MapFile } {
  const pick = name && listMaps().includes(name) ? name : DEFAULT_MAP;
  return { name: pick, file: JSON.parse(readFileSync(join(MAPS, pick, "map.json"), "utf8")) };
}

/**
 * Where a map's code lives. A generated map records its absolute root; a
 * hand-authored one names a directory under ~/Desktop/Code, so a literal
 * `/Users/<name>/…` is never baked into a fixture.
 */
export function rootOf(run: Run): string {
  return run.root ?? process.env.SLOP_REPO_ROOT ?? resolve(homedir(), "Desktop/Code", run.repo);
}
