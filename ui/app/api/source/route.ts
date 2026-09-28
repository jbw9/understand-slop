import { readSlice, writeSlice, Refused } from "@/lib/repo";

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

  try {
    // `fixture` is the text the map claims is at these lines. Passing it is
    // what lets the answer say "this has drifted" instead of quietly showing
    // fresh code under a stale explanation.
    return Response.json(
      await readSlice({ file, start, end }, q.get("fixture") ?? undefined),
    );
  } catch (e) {
    return bad(e instanceof Refused ? e.message : "unreadable");
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { file, start, end, code, expected } = body ?? {};
  if (
    typeof file !== "string" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    typeof code !== "string" ||
    typeof expected !== "string"
  ) {
    return bad("bad request");
  }

  const result = await writeSlice({ file, start, end, code, expected });
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
