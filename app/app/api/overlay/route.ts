import { readFileSync } from "node:fs";
import type { Anatomy, Node, Origin } from "@/lib/data";
import type { MapFile } from "@/lib/map";
import { apply, newId, readHistory, readOverlay, revertTo, writeOverlay, type Entry, type Overlay } from "@/lib/overlay";
import { getProject, mapFileOf } from "@/lib/vault";

/**
 * What the reader added to one of their own maps (lib/overlay.ts): read it
 * with its history and anything it could not place, or add, edit, remove and
 * revert.
 *
 * Only a vault project has an overlay. An example map is a committed fixture
 * shared by every reader of this checkout, so it is read-only by design and
 * every action here refuses one rather than writing into the repository.
 */

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

/** Short free text, capped as `turnOf` caps a correction: a body is reader-supplied. */
const line = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** `path`/`parent`: section ids as the URL carries them. `[]` is the repo level. */
function pathOf(v: unknown): string[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return undefined;
  const ids = v.filter((s): s is string => typeof s === "string" && Boolean(s)).map((s) => s.slice(0, 200));
  return ids.length === v.length ? ids.slice(0, 12) : undefined;
}

function originOf(v: unknown): Origin | undefined {
  const o = (v ?? {}) as { by?: unknown; note?: unknown };
  if (o.by !== "user" && o.by !== "claude") return undefined;
  // `at` is this machine's clock, not the caller's: a note cannot claim to
  // have been added last year and sort itself to the top of the history.
  return { by: o.by, at: new Date().toISOString(), note: line(o.note, 2000) };
}

/**
 * One entry, validated down to what `apply` needs to place it. Blocks and
 * nodes are checked for their discriminant and the fields the renderers read
 * rather than their whole shape — the schema is `lib/data.ts`'s and would
 * drift if restated here, and an unknown block kind simply does not render.
 */
function entryOf(body: Record<string, unknown>): Entry | string {
  const kind = body.kind;
  if (kind === "field") {
    const path = pathOf(body.path);
    const field = body.field;
    const value = line(body.value, 2000);
    const origin = originOf(body.origin);
    if (!path?.length) return "Say which part to change.";
    if (field !== "title" && field !== "sub" && field !== "detail") return "bad request";
    if (!value) return "Write what it should say.";
    if (!origin) return "bad request";
    return { kind: "field", id: newId(), path, field, value, origin };
  }
  if (kind === "block") {
    const path = pathOf(body.path);
    const block = body.block as Anatomy | undefined;
    if (!path) return "bad request";
    if (!block || typeof block !== "object" || typeof (block as { kind?: unknown }).kind !== "string") return "bad request";
    if (block.kind === "note") {
      const bodyText = line(block.body, 2000);
      const origin = originOf(block.origin);
      if (!bodyText) return "Write the note.";
      if (!origin) return "bad request";
      block.body = bodyText;
      block.origin = origin;
      if (block.title) block.title = line(block.title)!;
    }
    const after = typeof body.after === "number" && body.after >= 0 ? Math.floor(body.after) : undefined;
    // A kept picture or table has nowhere of its own to say whose it is, so
    // the entry carries it and `apply` marks the level (lib/overlay.ts).
    const origin = block.kind === "note" ? undefined : originOf(body.origin);
    if (block.kind !== "note" && !origin) return "bad request";
    return { kind: "block", id: newId(), path, block, origin, after };
  }
  if (kind === "section") {
    const parent = pathOf(body.parent);
    const node = body.node as Node | undefined;
    if (!parent) return "bad request";
    if (!node || typeof node !== "object" || !line(node.title) || !line(node.sub)) return "Give the new part a name.";
    return { kind: "section", id: newId(), parent, node };
  }
  return "bad request";
}

/** The project's own map, before the overlay — so `apply` is never run twice over one tree. */
function authored(id: string): MapFile | undefined {
  const file = mapFileOf(id);
  if (!file) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MapFile;
  } catch {
    return undefined;
  }
}

/**
 * The map id must name a project in the vault. A caller-supplied path never
 * reaches the filesystem: `projectDir` is derived from the id the vault holds.
 */
function projectOf(v: unknown) {
  const id = line(v);
  return id ? getProject(id) : undefined;
}

export async function GET(request: Request) {
  const project = projectOf(new URL(request.url).searchParams.get("map"));
  if (!project) return bad("No such project.");
  const overlay = readOverlay(project.id);
  const map = authored(project.id);
  // Without a map yet there is nothing to place against, so nothing is
  // orphaned — not even the entries that will be once one exists.
  const orphans = map ? apply(map, overlay).orphans : [];
  return Response.json({ overlay, history: readHistory(project.id), orphans });
}

export async function POST(request: Request) {
  // JSON only: another site's page can send a plain-text POST here without
  // asking, but a JSON one needs a CORS preflight this route never grants.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return bad("bad request", 415);
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const project = projectOf(body.map);
  if (!project) return bad("No such project.");
  const { entries } = readOverlay(project.id);
  const id = line(body.id);
  const where = (e: Entry) => (e.kind === "section" ? e.parent : e.path).join(" › ") || "the repository";

  const save = (next: Entry[], label: string) => {
    writeOverlay(project.id, { version: 1, entries: next } satisfies Overlay, label);
    return Response.json({ ok: true });
  };

  switch (body.action) {
    case "add": {
      const e = entryOf(body);
      if (typeof e === "string") return bad(e);
      const what = e.kind === "block" ? `a ${e.block.kind}` : e.kind === "section" ? `the part ${e.node.title}` : `the ${e.field}`;
      return save([...entries, e], `Added ${what} to ${where(e)}`);
    }
    case "edit": {
      const at = entries.findIndex((e) => e.id === id);
      if (at < 0) return bad("That change is no longer there.");
      const e = entryOf(body);
      if (typeof e === "string") return bad(e);
      // The id it replaces, so history and revert still name one thing.
      return save(entries.map((old, i) => (i === at ? { ...e, id: old.id } : old)), `Edited ${where(e)}`);
    }
    case "remove": {
      const gone = entries.find((e) => e.id === id);
      if (!gone) return bad("That change is no longer there.");
      return save(entries.filter((e) => e !== gone), `Removed a change to ${where(gone)}`);
    }
    case "revert": {
      const at = line(body.at);
      if (!at) return bad("bad request");
      const next = revertTo(project.id, at);
      return next ? Response.json({ ok: true, overlay: next }) : bad("That version is no longer there.");
    }
    default:
      return bad("bad request");
  }
}
