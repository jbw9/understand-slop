import { refuse } from "@/lib/server/guard";
import { repoMap, StoryError } from "@/lib/server/repo";

/**
 * The repo's map, merged fresh from `.slop/story.json` and the code. Only when
 * `slop` started this server with SLOP_REPO; otherwise `{repo: null}`, and the
 * page falls back to the bundled demos in public/maps.
 */
export async function GET(req: Request) {
  const dir = process.env.SLOP_REPO;
  // Not an error, so not a 404: the page asks, and a demo server says "none".
  if (!dir) return Response.json({ repo: null });
  const no = refuse(req, false);
  if (no) return no;
  try {
    return Response.json(repoMap(dir));
  } catch (e) {
    const problems = e instanceof StoryError ? e.problems : [String(e)];
    return Response.json({ problems }, { status: 422 });
  }
}
