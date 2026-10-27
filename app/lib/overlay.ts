/**
 * Server-side: what the reader added to a map, and every version of it.
 *
 * A generated map is the generator's to rewrite — a regenerate replaces it
 * wholesale, and every update redoes the sections the code touched
 * (scripts/generate/update.ts). So the reader's own additions cannot live in
 * `map.json`: the two writers would share one file and the generator would
 * win, silently, exactly when the reader had most invested in it.
 *
 * They live beside it instead, and are composed in at read time:
 *
 *   <vault>/projects/<id>/overlay.json   additions and edits, current
 *   <vault>/projects/<id>/history.json   every version before this one
 *
 * `apply` is the whole integration: `lib/maps.ts` calls it inside `loadMap`,
 * which every reader of a map already goes through, so the canvas, the title
 * bar and the text handed to Claude all see composed content without knowing
 * this file exists.
 *
 * Nothing here is ever lost. A write appends what it replaced to the history,
 * and an entry whose section has gone is kept and reported rather than
 * dropped — a regenerate that renames a section must not delete a note.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Anatomy, Node, Origin } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { projectDir } from "@/lib/vault";

/** A block the reader added to a section. */
export interface BlockEntry {
  kind: "block";
  id: string;
  /** The section it belongs to, as the URL carries it. `[]` is the repo level. */
  path: string[];
  block: Anatomy;
  /**
   * Who added it. A `note` carries its own, because it renders its own mark;
   * every other kind — a diagram, a table — is drawn by the same component a
   * generated one is, with nowhere to put a mark. So the block's origin is
   * recorded here and `apply` lifts it onto the section, which does have
   * somewhere: without this a kept diagram reads as something the analysis
   * found in the code, which is the one thing the reader must never be told.
   */
  origin?: Origin;
  /**
   * Where among the section's own blocks it sits: the number of authored
   * blocks to put it after. Absent means last, which is where an addition
   * goes unless the reader moved it.
   */
  after?: number;
}

/** A field of a section the reader rewrote in their own words. */
export interface FieldEntry {
  kind: "field";
  id: string;
  path: string[];
  field: "title" | "sub" | "detail";
  value: string;
  origin: Origin;
}

/** A whole new part the reader added under a section. */
export interface SectionEntry {
  kind: "section";
  id: string;
  /** The section it goes under. `[]` adds a new root. */
  parent: string[];
  node: Node;
}

export type Entry = BlockEntry | FieldEntry | SectionEntry;

export interface Overlay {
  version: 1;
  entries: Entry[];
}

/** One past version, newest first in the file. */
export interface Version {
  /** When it was replaced. */
  at: string;
  /** What the change was, in a few words, for the history list. */
  label: string;
  entries: Entry[];
}

interface History {
  version: 1;
  versions: Version[];
}

const EMPTY: Overlay = { version: 1, entries: [] };

export const overlayFile = (id: string) => join(projectDir(id), "overlay.json");
const historyFile = (id: string) => join(projectDir(id), "history.json");

/** Written whole and renamed into place, as the vault's index is: a crash never leaves half a file. */
function writeAtomic(file: string, data: unknown) {
  mkdirSync(join(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1) + "\n");
  renameSync(tmp, file);
}

export function readOverlay(id: string): Overlay {
  try {
    const o = JSON.parse(readFileSync(overlayFile(id), "utf8")) as Overlay;
    if (o.version === 1 && Array.isArray(o.entries)) return o;
  } catch {
    /* none yet, or unreadable: an empty overlay still shows the map */
  }
  return EMPTY;
}

export function readHistory(id: string): Version[] {
  try {
    const h = JSON.parse(readFileSync(historyFile(id), "utf8")) as History;
    if (h.version === 1 && Array.isArray(h.versions)) return h.versions;
  } catch {
    /* no history yet */
  }
  return [];
}

/**
 * Replace the overlay, keeping what it was. `label` is what the history list
 * shows for the version being replaced, so it describes the change being made.
 */
export function writeOverlay(id: string, next: Overlay, label: string) {
  const before = readOverlay(id);
  // The first write has nothing to keep: an empty overlay is not a version
  // worth reverting to, and listing it would offer "undo to nothing" as a step.
  if (before.entries.length || existsSync(overlayFile(id))) {
    const versions = [{ at: new Date().toISOString(), label, entries: before.entries }, ...readHistory(id)];
    writeAtomic(historyFile(id), { version: 1, versions } satisfies History);
  }
  writeAtomic(overlayFile(id), next);
}

/**
 * Go back to a past version. The revert is itself a change, so what is being
 * replaced goes into the history too: reverting is never a way to lose work.
 */
export function revertTo(id: string, at: string): Overlay | undefined {
  const version = readHistory(id).find((v) => v.at === at);
  if (!version) return undefined;
  const next: Overlay = { version: 1, entries: version.entries };
  writeOverlay(id, next, `Reverted to ${new Date(at).toLocaleString()}`);
  return next;
}

export const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ── composing ────────────────────────────────────────────────── */

/** What `apply` could not place, so the UI can say so instead of pretending it applied. */
export interface Orphan {
  id: string;
  /** The section it named, for the message. */
  where: string;
  kind: Entry["kind"];
}

function at(nodes: Node[], path: string[]): Node | null {
  let level = nodes;
  let found: Node | null = null;
  for (const id of path) {
    found = level.find((n) => n.id === id) ?? null;
    if (!found) return null;
    level = found.children ?? [];
  }
  return found;
}

/**
 * One entry, into a tree already copied down its own path. Returns false when
 * the section it names is gone, which makes it an orphan rather than an error.
 */
function place(roots: Node[], e: Entry): boolean {
  if (e.kind === "section") {
    if (!e.parent.length) {
      roots.push({ ...e.node, col: 0, row: roots.length });
      return true;
    }
    const parent = at(roots, e.parent);
    if (!parent) return false;
    const children = [...(parent.children ?? [])];
    children.push({ ...e.node, col: 0, row: children.length });
    parent.children = children;
    return true;
  }
  const node = at(roots, e.path);
  if (!node) return false;
  if (e.kind === "field") {
    node[e.field] = e.value;
    // The reader's words are theirs, and the mark has to survive onto the node
    // the screen reads — a field edit with no visible origin is the one thing
    // this file exists to prevent.
    node.origin = e.origin;
    return true;
  }
  const blocks = [...(node.anatomy ?? [])];
  blocks.splice(e.after ?? blocks.length, 0, e.block);
  node.anatomy = blocks;
  // A block the reader kept marks the level, unless the level is already
  // marked as theirs by something more specific (a field they rewrote).
  const own = e.block.kind === "note" ? e.block.origin : e.origin;
  if (own && !node.origin) node.origin = own;
  return true;
}

/**
 * The map as the reader has it: the generator's tree with their additions in
 * place. Pure — the file passed in is never mutated, so a caller holding the
 * generator's own copy keeps it.
 */
export function apply(file: MapFile, o: Overlay): { file: MapFile; orphans: Orphan[] } {
  if (!o.entries.length) return { file, orphans: [] };
  // A structured clone is enough and keeps this honest: every node the entries
  // touch is a fresh object, so nothing writes through to the caller's tree.
  const roots: Node[] = structuredClone(file.AUTHORED);
  const orphans: Orphan[] = [];
  for (const e of o.entries) {
    if (!place(roots, e)) {
      const where = (e.kind === "section" ? e.parent : e.path).join(" › ") || "the repository";
      orphans.push({ id: e.id, where, kind: e.kind });
    }
  }
  return { file: { ...file, AUTHORED: roots }, orphans };
}
