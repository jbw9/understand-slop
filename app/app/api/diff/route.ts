import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitLog, mapDiff, resolveRef, type Resolved } from "@/lib/diff";
import { loadMap, rootOf } from "@/lib/maps";
import { apply, readOverlay } from "@/lib/overlay";
import { projectDir } from "@/lib/vault";
import { branches, defaultBase, pulls, reviewRange, type Review } from "@/lib/review";

/**
 * What a commit did to the map the reader has open.
 *
 * `GET ?map=&from=&to=` — `from` defaults to the commit the map was made at and
 * `to` to the working tree, which is the comparison that answers "what have I
 * changed since". `GET ?map=&commits=1` is the commit list the panel offers.
 * `GET ?map=&review=pr:<n>|<base>...<branch>` reviews a pull request or a
 * branch from where it left its base (lib/review.ts); `?branches=1` lists
 * both to pick from.
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

  if (q.get("commits")) return Response.json({ commits: commitLog(root, 200), at: open.file.RUN.commit });
  if (q.get("branches")) return Response.json({ branches: branches(root), base: defaultBase(root), ...pulls(root) });

  const rev = (k: string) => {
    const v = q.get(k);
    // A revision is short: anything long is not one, and is refused before git
    // is asked about it.
    return v && v.length <= 200 ? v : undefined;
  };
  const asked = { from: rev("from"), to: rev("to") };

  let review: Review | undefined;
  const spec = rev("review");
  if (spec) {
    const r = reviewRange(root, spec);
    if ("error" in r) return bad(r.error);
    review = r;
    asked.from = r.from;
    asked.to = r.to;
  }

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
    const dir = projectDir(open.name);
    const json = (f: string) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : undefined);
    // Since the map was made, and it has been updated since: the map as it was
    // then is the other picture, so its diagrams and tables diff box by box.
    // The reader's own additions are on both, so they never read as a change.
    const snapshot = !from && !to ? json("map.base.json") : undefined;
    // A file no section cites still has a root that owns it (index.json): the
    // way in for new code that no level explains yet.
    // Only code: a lockfile or an icon changing is not something a level could explain.
    const index = json("index.json") as { files: Record<string, { roots: string[]; status: string }> } | undefined;
    const ext = (p: string) => p.slice(p.lastIndexOf("."));
    const code = new Set(Object.entries(index?.files ?? {}).filter(([, f]) => f.status === "source").map(([p]) => ext(p)));
    const rooted = (out: { path: string; near?: string[] }[] = []) =>
      out
        .filter((o) => !index || (index.files[o.path] ? index.files[o.path].status === "source" : code.has(ext(o.path))))
        .map((o) => (o.near || !index?.files[o.path]?.roots[0] ? o : { ...o, near: [index.files[o.path].roots[0]] }));
    const before = snapshot && { ...apply(snapshot, readOverlay(open.name)).file, RUN: { ...snapshot.RUN, root } };
    const diff = before
      ? mapDiff(root, from, to, before, {}, open.file)
      : mapDiff(root, from, to, open.file, json("base.json") ?? {});
    // A review's ends are the commits it resolved to, so they need no reading back.
    if (review) return Response.json({ ...diff, review, outside: rooted(diff.outside) });
    return Response.json(read.from || read.to ? { ...diff, read, outside: rooted(diff.outside) } : { ...diff, outside: rooted(diff.outside) });
  } catch (e) {
    return bad(e instanceof RangeError ? e.message : "Could not read the checkout.", e instanceof RangeError ? 400 : 500);
  }
}
