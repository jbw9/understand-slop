import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Diagram } from "@/components/v2/landing-agent";

export interface DemoNode {
  id: string;
  title: string;
  sub?: string;
  children?: DemoNode[];
  anatomy?: ({ kind: string } & Diagram)[];
}

/** What the page reads of a committed map: its run, and its tree's titles. */
export interface DemoFile {
  RUN: { files?: number; commit?: string };
  AUTHORED: DemoNode[];
  OVERVIEW: { anatomy: ({ kind: string } & Diagram)[] };
}

/**
 * The demo maps, kept with this page (landing/demo) now that the app ships
 * none (D63), read at build time: the page is static.
 */
export const loadMap = (id: string): DemoFile =>
  JSON.parse(readFileSync(join(process.cwd(), "demo", id, "map.json"), "utf8"));
