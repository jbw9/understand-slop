import { commitList, mapDiff, resolveRef, type Resolved } from "@/lib/diff";
import { loadMap, rootOf } from "@/lib/maps";

/**
 * What a commit did to the map the reader has open.
 *
 * `GET ?map=&from=&to=` — `from` defaults to the commit the map was made at and
 * `to` to the working tree, which is the comparison that answers "what have I
 * changed since". `GET ?map=&commits=1` is the list the two pickers offer.
 *
 * `from` and `to` may also be English, because an agent passes a reader's words
 * through unaltered: "last commit by hindra2" is resolved by `resolveRef` and
 * the reading comes back in `read`, so the page can show what the phrase was
 * taken to mean instead of diffing against a guess.
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
    open = null;
  }
  if (!open) return bad("No such map.", 404);
  const root = rootOf(open.file.RUN);

  if (q.get("commits")) return Response.json({ commits: commitList(root), at: open.file.RUN.commit });

  const rev = (k: string) => {
    const v = q.get(k);
    // A revision is short: anything long is not one, and is refused before git
    // is asked about it.
    return v && v.length <= 200 ? v : undefined;
  };
  const asked = { from: rev("from"), to: rev("to") };

  const got: { from?: Resolved; to?: Resolved } = {};
  for (const side of ["from", "to"] as const) {
    const phrase = asked[side];
    if (!phrase) continue;
    const r = resolveRef(root, phrase);
    if ("error" in r) return bad(r.error);
    got[side] = r;
  }

  // One side naming a single commit ("the last commit by hindra2") is how
  // people ask what that commit changed, so it becomes `<it>~1..<it>` rather
  // than `<it>..` — but only when the other side was not asked for, since two
  // named ends are already a range the reader chose.
  let from = got.from?.commit ?? asked.from;
  let to = got.to?.commit ?? asked.to;
  const read: { from?: string; to?: string } = {};
  const span = (one: Resolved) => `${one.how} — showing what it changed (${one.commit.slice(0, 7)}~1..${one.commit.slice(0, 7)})`;
  if (got.from?.span && !asked.to) {
    read.from = span(got.from);
    to = got.from.commit;
    from = `${got.from.commit}~1`;
  } else if (got.to?.span && !asked.from) {
    read.to = span(got.to);
    from = `${got.to.commit}~1`;
  } else {
    if (got.from) read.from = got.from.how;
    if (got.to) read.to = got.to.how;
  }

  try {
    const diff = mapDiff(root, from, to, open.file);
    return Response.json(read.from || read.to ? { ...diff, read } : diff);
  } catch (e) {
    return bad(e instanceof RangeError ? e.message : "Could not read the checkout.", e instanceof RangeError ? 400 : 500);
  }
}
