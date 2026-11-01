import { cachedTimeline, storyOf } from "@/lib/history";
import { loadMap, rootOf } from "@/lib/maps";
import { projectDir, tellStory, telling } from "@/lib/vault";

/**
 * The history of the map the reader has open (lib/history.ts).
 *
 * `GET ?map=` — the timeline, the chapters a story run wrote (if any), and
 * whether one is running. `POST ?map=` with `{claude}` — start telling the
 * story; it costs a model run, so only ever on the reader's click.
 *
 * As app/api/diff/route.ts: a caller names a map, never a path, and the
 * checkout is the project's own.
 */

function opened(request: Request) {
  try {
    return loadMap(new URL(request.url).searchParams.get("map") ?? undefined);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const open = opened(request);
  if (!open) return Response.json({ error: "No such map." }, { status: 404 });
  const dir = projectDir(open.name);
  try {
    const timeline = cachedTimeline(rootOf(open.file.RUN), dir, open.file);
    return Response.json({ timeline, story: storyOf(dir), telling: telling(open.name) });
  } catch {
    return Response.json({ error: "Could not read the checkout's history." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const open = opened(request);
  if (!open) return Response.json({ error: "No such map." }, { status: 404 });
  const { claude } = (await request.json().catch(() => ({}))) as { claude?: unknown };
  const started = tellStory(open.name, typeof claude === "string" && claude ? claude : undefined);
  return Response.json({ telling: started || telling(open.name) });
}
