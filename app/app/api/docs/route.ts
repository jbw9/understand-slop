import { demoDocs, listDocs } from "@/lib/docs";
import { demoSource, loadMap, rootOf } from "@/lib/maps";

/**
 * The Markdown beside the open map's code (`?map=`), for the docs reader. Only
 * the list: each doc's text comes through `/api/source`, like the code's.
 */
export async function GET(request: Request) {
  const map = new URL(request.url).searchParams.get("map") ?? undefined;
  const demo = demoSource(map);
  if (demo) return Response.json({ docs: demoDocs(demo) });
  const open = loadMap(map);
  return Response.json({ docs: open ? listDocs(rootOf(open.file.RUN)) : [] });
}
