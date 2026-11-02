import { loadMap, rootOf } from "@/lib/maps";
import { reviewRange } from "@/lib/review";
import { mapReview, reviewMap } from "@/lib/vault";

/**
 * The map after a branch or pull request (lib/vault.ts `mapReview`):
 * `GET ?map=&commit=` says whether it exists or is being made (only read, so
 * a commit is enough), `POST` with `{map, review, claude}` starts making it.
 * As app/api/diff/route.ts, what is checked out is only ever the commit the
 * review spec itself resolves to.
 */
function resolved(map: string | null, spec: string | null) {
  let open: ReturnType<typeof loadMap> = null;
  try {
    open = loadMap(map ?? undefined);
  } catch {}
  if (!open || !spec) return { error: "No such map or review." };
  const r = reviewRange(rootOf(open.file.RUN), spec);
  return "error" in r ? r : { id: open.name, commit: r.to };
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  let open: ReturnType<typeof loadMap> = null;
  try {
    open = loadMap(q.get("map") ?? undefined);
  } catch {}
  return Response.json(open ? reviewMap(open.name, q.get("commit") ?? "") : { status: "none" });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { map?: string; review?: string; claude?: string };
  const r = resolved(body.map ?? null, body.review ?? null);
  if ("error" in r) return Response.json({ status: "failed", error: r.error });
  return Response.json(mapReview(r.id, r.commit, body.claude));
}
