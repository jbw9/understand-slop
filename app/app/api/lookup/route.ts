import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapIndex } from "@/lib/coverage";
import { mapSearch, mapSection, mapWhere } from "@/lib/lookup";
import { buildMap } from "@/lib/map";
import { loadMap } from "@/lib/maps";
import { listProjects, projectDir } from "@/lib/vault";

/**
 * Claude's map tools (src-tauri/src/mcp.rs, answered through the page):
 * `GET ?root=&tool=search&q=`, `tool=section&name=`, `tool=where&file=&line=`.
 *
 * The map is the project whose checkout the asking tab runs in, not whichever
 * is on screen, so an agent in one project never reads another's map. Only a
 * project the reader imported is ever read: `root` is matched against the
 * vault, never opened as a path.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const root = q.get("root");
  const p = listProjects().find((x) => x.root === root);
  const open = p ? loadMap(p.id) : null;
  if (!p || !open) return Response.json({ text: "This checkout has no map in Bluprint yet, so there is nothing to look up. Import it from Projects to map it." });
  const m = buildMap(open.file, open.name);
  const f = join(projectDir(p.id), "index.json");
  const index: MapIndex | null = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  const tool = q.get("tool");
  const line = Number(q.get("line")) || undefined;
  const text =
    tool === "search" ? mapSearch(m, index, q.get("q") ?? "")
    : tool === "section" ? mapSection(m, q.get("name") ?? "", index)
    : tool === "where" ? mapWhere(m, index, q.get("file") ?? "", line)
    : `No map tool called ${tool}.`;
  return Response.json({ text });
}
