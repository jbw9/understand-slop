import { invoke } from "@tauri-apps/api/core";
import { readSettings } from "@/lib/settings";

/**
 * A turn of Claude's the map follows (src-tauri/src/claude.rs): its session's
 * transcript, for what it did and why, and the sections it reported wrong
 * with slop-map-fix.
 */
export interface Turn {
  transcript?: string | null;
  corrections: { section: string; note: string }[];
}

/**
 * Asks for the map of the project at `root` to be brought up to its code
 * (lib/vault.ts): only the sections the edits touched, or the agent found
 * wrong, are redone, by the same Claude Code the tabs run. With no turn it
 * only looks at the code, and a map whose cited code is unchanged costs no
 * model call (scripts/generate/update.ts). `skipped` when the checkout is not
 * one of the user's projects.
 */
export async function updateMap(root: string, turn?: Turn): Promise<{ skipped?: boolean } | null> {
  const found = await invoke<{ path: string } | null>("claude_detect", { configured: readSettings().claudePath || null }).catch(() => null);
  return fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "update", root, claude: found?.path, turn }),
  })
    .then((r) => r.json())
    .catch(() => null);
}
