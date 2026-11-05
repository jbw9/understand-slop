import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMap, rootOf } from "@/lib/maps";
import type { Node } from "@/lib/data";
import { git, readText, refs, type Base } from "@/scripts/generate/gitdiff";
import { sourcePath } from "@/scripts/generate/inventory";
import { projectDir } from "@/lib/vault";
import type { MapIndex } from "@/lib/coverage";

/**
 * Every file of the map the reader has open: what the map knows of each
 * (`index.json`, scripts/generate/catalog.ts) and what is in the checkout now,
 * so a file added since the map was made shows as not on it yet rather than
 * not at all.
 *
 * `?behind=1` answers only which of those files changed since the map last
 * saw them (its commit, then base.json after updates: what an update would
 * start from), for the status bar to poll without the whole index.
 *
 * As app/api/diff/route.ts: a caller names a map, never a path, and the
 * checkout is the project's own.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  let open: ReturnType<typeof loadMap> = null;
  try {
    open = loadMap(q.get("map") ?? undefined);
  } catch {}
  if (!open) return Response.json({ error: "No such map." }, { status: 404 });
  const f = join(projectDir(open.name), "index.json");
  const index: MapIndex | null = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  const root = rootOf(open.file.RUN);
  let present: string[] = [];
  try {
    present = execFileSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Not a git checkout: the index alone is what there is.
  }
  // New code files, judged as an update judges them
  // (scripts/generate/inventory.ts): a lockfile, a test or a type stub
  // appearing is not something the map would add.
  const files = index?.files ?? {};
  const added = present.filter((p) => !files[p] && sourcePath(p));
  if (q.get("behind")) {
    const b = join(projectDir(open.name), "base.json");
    const base: Base = existsSync(b) ? JSON.parse(readFileSync(b, "utf8")) : {};
    const cited = new Set<string>();
    const walk = (nodes: Node[]) => nodes.forEach((n) => (refs(n).forEach((r) => cited.add(r.file)), walk(n.children ?? [])));
    walk(open.file.AUTHORED);
    const untracked = git(root, "ls-files", "--others", "--exclude-standard").split("\n");
    const touched = new Set([...git(root, "diff", "--name-only", "--relative", open.file.RUN.commit).split("\n"), ...untracked, ...Object.keys(base)]);
    touched.delete("");
    // Exactly what an update would take (update.ts `found`), so one always
    // clears it: code or a cited file, and a deletion only of a cited one. A
    // file an update already followed differs from the commit but not from base.json.
    const behind = [...touched].filter((p) => {
      const text = readText(join(root, p));
      const takes = text === null ? cited.has(p) : sourcePath(p) || cited.has(p);
      return takes && (p in base ? base[p] !== text : true);
    });
    return Response.json({ behind });
  }
  return Response.json({ index, added });
}
