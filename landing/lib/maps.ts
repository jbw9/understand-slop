import { readFileSync } from "node:fs";
import { join } from "node:path";

/** What the page reads of a committed map: its run, and its roots' titles down one level. */
export interface DemoFile {
  RUN: { files?: number; elapsed?: string };
  AUTHORED: { id: string; title: string; sub?: string; children?: { id: string; title: string; sub?: string }[] }[];
}

/** A map the app ships (app/maps), read at build time: the page is static. */
export const loadMap = (id: string): DemoFile => JSON.parse(readFileSync(join(process.cwd(), "..", "app", "maps", id, "map.json"), "utf8"));
