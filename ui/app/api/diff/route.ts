import { commitList, mapDiff } from "@/lib/diff";
import { loadMap, rootOf } from "@/lib/maps";

/**
 * What a commit did to the map the reader has open.
 *
 * `GET ?map=&from=&to=` — `from` defaults to the commit the map was made at and
 * `to` to the working tree, which is the comparison that answers "what have I
 * changed since". `GET ?map=&commits=1` is the list the two pickers offer.
 *
 * The checkout is resolved from the map, exactly as app/api/source/route.ts
 * does: a caller names a map, never a path. `from` and `to` go to `git
 * rev-parse` to be resolved, which is the only thing done with them — an
 * unknown revision is a 400, not an argument passed on to another command.
 */

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  let open;
  try {
    open = loadMap(q.get("map") ?? undefined);
  } catch {
    return bad("No such map.", 404);
  }
  const root = rootOf(open.file.RUN);

  if (q.get("commits")) return Response.json({ commits: commitList(root), at: open.file.RUN.commit });

  const rev = (k: string) => {
    const v = q.get(k);
    // A revision is short: anything long is not one, and is refused before git
    // is asked about it.
    return v && v.length <= 200 ? v : undefined;
  };
  try {
    return Response.json(mapDiff(root, rev("from"), rev("to"), open.file));
  } catch (e) {
    return bad(e instanceof RangeError ? e.message : "Could not read the checkout.", e instanceof RangeError ? 400 : 500);
  }
}
