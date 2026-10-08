import { z } from "zod";
import { refuse } from "@/lib/server/guard";
import { SaveConflict, saveSymbol } from "@/lib/server/repo";

const Body = z.object({ symbol: z.string(), before: z.string(), after: z.string() });

/**
 * Write one edited unit back to its file. 409 when the unit on disk no longer
 * reads `before` — the browser's copy is stale, and nothing is written.
 */
export async function POST(req: Request) {
  const dir = process.env.SLOP_REPO;
  if (!dir) return Response.json({ error: "read-only: not serving a repo" }, { status: 403 });
  const no = refuse(req, true);
  if (no) return no;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "expected {symbol, before, after}" }, { status: 400 });
  const { symbol, before, after } = parsed.data;
  try {
    return Response.json({ symbol: saveSymbol(dir, symbol, before, after) });
  } catch (e) {
    if (e instanceof SaveConflict) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
