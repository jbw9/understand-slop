import { listExamples } from "@/lib/maps";
import { cancel, generate, headOf, ImportError, importProject, listProjects, mapFileOf, progressOf, removeProject, VAULT } from "@/lib/vault";

/**
 * The reader's projects (lib/vault.ts): list them, import one, regenerate,
 * cancel or forget one. Paths arrive from the page, but only as the reader's
 * own choice of a directory on their own machine — nothing here reads or
 * writes inside it except the generator, which only reads.
 */

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function GET() {
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
  const { action, id, root, name, claude } = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  try {
    switch (action) {
      case "import":
        if (!str(root)) return bad("Choose a directory.");
        return Response.json(importProject(root as string, str(name), listExamples(), str(claude)));
      case "regenerate":
        if (!str(id)) return bad("bad request");
        return Response.json(generate(id as string, str(claude)) ?? null);
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
