import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMap, rootOf } from "@/lib/maps";
import { projectDir } from "@/lib/vault";
import type { MapIndex } from "@/lib/coverage";

/**
 * Every file of the map the reader has open: what the map knows of each
 * (`index.json`, scripts/generate/catalog.ts) and what is in the checkout now,
 * so a file added since the map was made shows as not on it yet rather than
 * not at all.
 *
 * As app/api/diff/route.ts: a caller names a map, never a path, and the
 * checkout is the project's own.
 */
export async function GET(request: Request) {
  let open: ReturnType<typeof loadMap> = null;
  try {
    open = loadMap(new URL(request.url).searchParams.get("map") ?? undefined);
  } catch {}
  if (!open) return Response.json({ error: "No such map." }, { status: 404 });
  const f = join(projectDir(open.name), "index.json");
  const index: MapIndex | null = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  let present: string[] = [];
  try {
    present = execFileSync("git", ["-C", rootOf(open.file.RUN), "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Not a git checkout: the index alone is what there is.
  }
  // New files of a kind the map explains here (by extension), and files it
  // explains that are gone: a lockfile or an image appearing is not news.
  const ext = (p: string) => p.slice(p.lastIndexOf("."));
  const files = index?.files ?? {};
  const kinds = new Set(Object.entries(files).filter(([, x]) => x.status === "source").map(([p]) => ext(p)));
  const now = new Set(present);
  const added = present.filter((p) => !files[p] && kinds.has(ext(p)));
  const gone = present.length ? Object.keys(files).filter((p) => files[p].status === "source" && !now.has(p)) : [];
  return Response.json({ index, added, gone });
}
