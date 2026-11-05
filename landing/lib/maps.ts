import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DemoNode {
  id: string;
  title: string;
  sub?: string;
  state?: string;
  code?: { file: string; start: number; end: number; label?: string }[];
  children?: DemoNode[];
}

/** What the page reads of a committed map: its run, and its tree's titles. */
export interface DemoFile {
  RUN: { files?: number; commit?: string };
  AUTHORED: DemoNode[];
}

const read = (id: string, file: string) => JSON.parse(readFileSync(join(process.cwd(), "demo", id, file), "utf8"));

/**
 * The demo maps, kept with this page (landing/demo) now that the app ships
 * none (D63), read at build time: the page is static.
 */
export const loadMap = (id: string): DemoFile => read(id, "map.json");

/** Every node of a map, depth first. */
const all = (nodes: DemoNode[]): DemoNode[] => nodes.flatMap((n) => [n, ...all(n.children ?? [])]);

/** What the app's status bar says of a map: how many sections, and how many it isn't sure of. */
export function counts(file: DemoFile) {
  const nodes = all(file.AUTHORED);
  return { sections: nodes.length, unsure: nodes.filter((n) => n.state && n.state !== "derived").length };
}

/** One step of a map, its parts, and for each part the first lines it cites. */
export interface Step {
  title: string;
  sub: string;
  parts: { title: string; sub: string; cite?: { file: string; start: number; lines: string[] } }[];
}

const LINES = 9;

/** The steps of a map down to its lines, for How it works: read from the map and the source it was made from. */
export function descent(id: string): Step[] {
  const file = loadMap(id);
  const source: Record<string, string> = read(id, "source.json");
  const cite = (n: DemoNode) => {
    const c = all([n]).find((x) => x.code?.some((r) => source[r.file]))?.code?.find((r) => source[r.file]);
    if (!c) return undefined;
    const text = source[c.file].split("\n");
    let start = c.start;
    while (start < c.end && !text[start - 1]?.trim()) start++;
    return { file: c.file, start, lines: text.slice(start - 1, Math.min(c.end, start - 1 + LINES)).map((l) => l.trimEnd()) };
  };
  return file.AUTHORED.map((r) => ({
    title: r.title,
    sub: r.sub ?? "",
    parts: (r.children ?? []).map((c) => ({ title: c.title, sub: c.sub ?? "", cite: cite(c) })),
  }));
}
