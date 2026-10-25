import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { listExamples } from "@/lib/maps";
import { cancel, generate, headOf, ImportError, importProject, listProjects, mapFileOf, progressOf, removeProject, updateMap, VAULT, type Turn } from "@/lib/vault";

/**
 * The reader's projects (lib/vault.ts): list them, import one, regenerate,
 * cancel or forget one, or bring one's map up to its code after an edit. Paths arrive from the page, but only as the reader's
 * own choice of a directory on their own machine — nothing here reads or
 * writes inside it except the generator, which only reads.
 */

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

/**
 * A turn as the workspace reports it, kept to what the updater may use: a
 * transcript only from Claude Code's own session folder, and a handful of
 * short corrections.
 */
function turnOf(v: unknown): Turn | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t = v as { transcript?: unknown; corrections?: unknown };
  const sessions = join(homedir(), ".claude", "projects") + "/";
  const transcript =
    typeof t.transcript === "string" && t.transcript.endsWith(".jsonl") && resolve(t.transcript).startsWith(sessions) ? resolve(t.transcript) : undefined;
  const corrections = (Array.isArray(t.corrections) ? t.corrections : [])
    .filter((c): c is { section: string; note: string } => typeof c?.section === "string" && typeof c?.note === "string")
    .slice(0, 20)
    .map((c) => ({ section: c.section.slice(0, 200), note: c.note.slice(0, 2000) }));
  return { transcript, corrections };
}

export async function GET(request: Request) {
  // One project's state, polled by the open map to follow its updates.
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const p = listProjects().find((x) => x.id === id);
    return Response.json(p ? { id: p.id, update: p.update ?? null, progress: p.map.status === "generating" ? progressOf(p.id) : null } : null);
  }
  const projects = listProjects().map((p) => {
    const head = headOf(p.root);
    return {
      ...p,
      // A map from an earlier run still opens while a new one is being made.
      hasMap: Boolean(mapFileOf(p.id)),
      // The code moved on since the map was made.
      stale: Boolean(p.map.status === "ready" && p.map.commit && head && head !== p.map.commit),
      progress: p.map.status === "generating" ? progressOf(p.id) : undefined,
    };
  });
  return Response.json({ vault: VAULT, examples: listExamples(), projects });
}

export async function POST(request: Request) {
  // JSON only: another site's page can send a plain-text POST here without
  // asking, but a JSON one needs a CORS preflight this route never grants.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return bad("bad request", 415);
  const body = (await request.json().catch(() => null)) ?? {};
  const { action, id, root, name, claude, turn } = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  try {
    switch (action) {
      case "import":
        if (!str(root)) return bad("Choose a directory.");
        return Response.json(importProject(root as string, str(name), listExamples(), str(claude)));
      case "regenerate":
        if (!str(id)) return bad("bad request");
        return Response.json(generate(id as string, str(claude)) ?? null);
      case "update":
        if (!str(root)) return bad("bad request");
        // A checkout no project of the user's maps (an example's) cannot follow it.
        return Response.json(updateMap(root as string, str(claude), turnOf(turn)) ?? { skipped: true });
      case "cancel":
        if (!str(id)) return bad("bad request");
        cancel(id as string);
        return Response.json({ ok: true });
      case "remove":
        if (!str(id)) return bad("bad request");
        removeProject(id as string);
        return Response.json({ ok: true });
      default:
        return bad("bad request");
    }
  } catch (e) {
    return e instanceof ImportError ? bad(e.message, 409) : bad("Could not update the project list.", 500);
  }
}
