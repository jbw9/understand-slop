import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { auditOf } from "@/lib/maps";
import { cancel, cloneProject, createProject, focus, generate, headOf, ImportError, importProject, listProjects, mapFileOf, progressOf, projectDir, removeProject, setPaused, updateMap, VAULT, type Turn } from "@/lib/vault";

/**
 * The reader's projects (lib/vault.ts): list them, start, import or clone one, regenerate,
 * cancel or forget one, or bring one's map up to its code after an edit. Paths arrive from the page, but only as the reader's
 * own choice of a directory on their own machine — nothing here reads or
 * writes inside it except the generator, which only reads, starting a
 * project, which makes it as an empty git checkout, and cloning one into it.
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
  const sessions = join(homedir(), ".claude", "projects") + sep;
  const transcript =
    typeof t.transcript === "string" && t.transcript.endsWith(".jsonl") && resolve(t.transcript).startsWith(sessions) ? resolve(t.transcript) : undefined;
  const corrections = (Array.isArray(t.corrections) ? t.corrections : [])
    .filter((c): c is { section: string; note: string } => typeof c?.section === "string" && typeof c?.note === "string")
    .slice(0, 20)
    .map((c) => ({ section: c.section.slice(0, 200), note: c.note.slice(0, 2000) }));
  return { transcript, corrections };
}

/**
 * The section ids a running update is redoing, as its log names them
 * (scripts/generate/update.ts, "N sections to redo: a, b"), so the open map can
 * mark them while they are rewritten. None until the updater has picked them.
 */
function redoingOf(id: string): string[] {
  try {
    const line = readFileSync(join(projectDir(id), "update.log"), "utf8").match(/sections to redo: (.*)/)?.[1] ?? "";
    return line.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // How one map was made, for the audit view: a project's or an example's.
  const audit = params.get("audit");
  if (audit) return Response.json({ markdown: auditOf(audit) });
  // One project's state, polled by the open map to follow its updates.
  const id = params.get("id");
  if (id) {
    const p = listProjects().find((x) => x.id === id);
    return Response.json(
      p ? { id: p.id, update: p.update ?? null, redoing: p.update?.status === "running" ? redoingOf(p.id) : [], progress: p.map.status === "generating" ? progressOf(p.id) : null } : null,
    );
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
  return Response.json({ vault: VAULT, projects });
}

export async function POST(request: Request) {
  // JSON only: another site's page can send a plain-text POST here without
  // asking, but a JSON one needs a CORS preflight this route never grants.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return bad("bad request", 415);
  const body = (await request.json().catch(() => null)) ?? {};
  const { action, id, root, name, url, claude, turn, explain, full, paused } = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const level = (["none", "minimal", "brief", "detailed", "full"] as const).find((l) => l === explain);
  try {
    switch (action) {
      case "import":
        if (!str(root)) return bad("Choose a directory.");
        return Response.json(importProject(root as string, str(name), str(claude), level, paused === true));
      case "create":
        if (!str(root) || !str(name)) return bad("Choose where it goes and what it is called.");
        return Response.json(createProject(root as string, name as string, paused === true));
      case "clone":
        if (!str(url) || !str(root)) return bad("Give the repository and where it goes.");
        return Response.json(await cloneProject(url as string, root as string, str(name) ?? "", str(claude), level, paused === true));
      case "regenerate":
        if (!str(id)) return bad("bad request");
        return Response.json(generate(id as string, str(claude), level, full === true) ?? null);
      case "update":
        if (!str(root)) return bad("bad request");
        // A checkout no project of the user's maps (an example's) cannot follow it.
        return Response.json(updateMap(root as string, str(claude), turnOf(turn)) ?? { skipped: true });
      case "pause":
        if (!str(id)) return bad("bad request");
        setPaused(id as string, paused === true);
        return Response.json({ ok: true });
      case "focus":
        // The section the reader opened, written in full next.
        if (!str(id) || !str(body.section)) return bad("bad request");
        return Response.json({ ok: focus(id as string, body.section as string) });
      case "cancel":
        if (!str(id)) return bad("bad request");
        cancel(id as string);
        return Response.json({ ok: true });
      case "remove":
        if (!str(id)) return bad("bad request");
        await removeProject(id as string);
        return Response.json({ ok: true });
      default:
        return bad("bad request");
    }
  } catch (e) {
    return e instanceof ImportError ? bad(e.message, 409) : bad("Could not update the project list.", 500);
  }
}
