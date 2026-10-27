import { readSlice, writeSlice, Refused } from "@/lib/repo";
import { demoSource, loadMap, rootOf } from "@/lib/maps";
import { sliceOf } from "@/lib/source";

/** The checkout behind the map the reader has open (`?map=`); null with no project yet. */
const rootFor = (map: string | null | undefined) => {
  const open = loadMap(map ?? undefined);
  return open ? rootOf(open.file.RUN) : null;
};

/**
 * The only door to the real repository.
 *
 * GET reads a slice; POST writes one back. Both take caller-supplied paths, so
 * both go through the same containment check in `lib/repo.ts` — that check is
 * the whole security model and neither handler is allowed its own version of
 * it.
 *
 * Refusals are 400 with a plain message. A refused path never gets a different
 * status or a different body from a path that exists and is out of bounds:
 * probing for what is on the filesystem should learn nothing.
 */

function bad(message: string) {
  return Response.json({ refused: message }, { status: 400 });
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const file = q.get("file");
  const start = Number(q.get("start"));
  const end = Number(q.get("end"));
  if (!file || !Number.isInteger(start) || !Number.isInteger(end)) {
    return bad("bad request");
  }

  const fixture = q.get("fixture") ?? undefined;
  // A landing demo reads the code it was mapped from, committed beside it (D63).
  const demo = demoSource(q.get("map") ?? undefined);
  if (demo) {
    const text = demo[file];
    return text === undefined ? bad("unreadable") : Response.json(sliceOf(text, { file, start, end, fixture }));
  }
  const root = rootFor(q.get("map"));
  if (!root) return bad("unreadable");
  try {
    // `fixture` is the text the map claims is at these lines. Passing it is
    // what lets the answer say "this has drifted" instead of quietly showing
    // fresh code under a stale explanation.
    return Response.json(await readSlice({ file, start, end }, fixture, root));
  } catch (e) {
    return bad(e instanceof Refused ? e.message : "unreadable");
  }
}

export async function POST(request: Request) {
  // JSON only: a cross-site form can send text/plain with no preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return bad("bad request");
  const body = await request.json().catch(() => null);
  const { file, start, end, code, expected, map } = body ?? {};
  if (
    typeof file !== "string" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    typeof code !== "string" ||
    typeof expected !== "string"
  ) {
    return bad("bad request");
  }

  const root = rootFor(typeof map === "string" ? map : null);
  if (!root) return bad("unreadable");
  const result = await writeSlice({ file, start, end, code, expected }, root);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
