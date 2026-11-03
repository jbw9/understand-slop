import { hasClaude, pick } from "@/lib/context";
import { updateMap } from "@/lib/update-map";

export type Undone =
  | { ok: true; restored: string[] }
  | { ok: false; conflicts?: string[]; refused?: string[]; error?: string };

/**
 * Puts the files one agent turn edited back as they were (app/api/undo). Then
 * the map is brought back up to the code, and Claude is told with its next
 * prompt, since its session still remembers making the edits.
 */
export async function undoTurn(map: string, turn: string): Promise<Undone> {
  const r = await fetch("/api/undo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ map, turn }),
  })
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "The app could not be reached." }));
  if (!r.ok) return r;
  void updateMap(r.root);
  // A session that is not running has nothing to forget; none is opened to say so.
  if (hasClaude())
    pick({
      key: `undo:${turn}`,
      title: "Last turn undone",
      text: [
        `[Undone: the user reverted the edits of an earlier turn${r.prompt ? ` (asked: "${r.prompt}")` : ""}.`,
        `These files are back to how they were before it: ${r.restored.join(", ")}.`,
        "Do not assume those edits are still there; read the files again before changing them.]",
      ].join("\n"),
    });
  return { ok: true, restored: r.restored };
}
