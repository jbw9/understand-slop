import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { lastExchange } from "@/lib/keep";

/**
 * The question and answer of the turn Claude just finished, read out of its
 * own session transcript.
 *
 * The transcript path comes from the Stop hook by way of the workspace
 * (src-tauri/src/claude.rs), so it is the app's own value rather than the
 * reader's — but it arrives over HTTP, so it is treated as hostile and
 * confined to Claude Code's session folder, exactly as `turnOf` in
 * app/api/projects/route.ts confines the same value.
 */

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("transcript");
  if (!asked?.endsWith(".jsonl")) return Response.json({ error: "bad request" }, { status: 400 });
  const sessions = join(homedir(), ".claude", "projects") + "/";
  const path = resolve(asked);
  if (!path.startsWith(sessions)) return Response.json({ error: "bad request" }, { status: 400 });
  const exchange = lastExchange(path, (f) => readFileSync(f, "utf8"));
  // A turn with no answer to keep is not an error: most turns are tool work,
  // and the UI simply offers nothing.
  return Response.json({ exchange });
}
