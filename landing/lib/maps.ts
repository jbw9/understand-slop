import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DemoNode {
  id: string;
  title: string;
  sub?: string;
  children?: DemoNode[];
}

/** What the page reads of a committed map: its run, and its tree's titles. */
export interface DemoFile {
  RUN: { files?: number; elapsed?: string; commit?: string };
  AUTHORED: DemoNode[];
}

/** What the page reads of a map's report: the claims verification rewrote. */
export interface DemoReport {
  roots: { verify?: { nodes: number; rewritten: { id: string; claims: string[] }[] } }[];
}

/**
 * The demo maps, kept with this page (landing/demo) now that the app ships
 * none (D63), read at build time: the page is static.
 */
const read = (id: string, file: string) => JSON.parse(readFileSync(join(process.cwd(), "demo", id, file), "utf8"));
export const loadMap = (id: string): DemoFile => read(id, "map.json");
export const loadReport = (id: string): DemoReport => read(id, "report.json");
