/**
 * The server reads and writes the user's code, so it answers only the page it
 * serves. `slop` binds to 127.0.0.1, which keeps other machines out; this
 * keeps out other sites in the same browser — by Host (a rebound DNS name
 * still says its own name) and, on a write, by Origin.
 */
export function refuse(req: Request, write: boolean): Response | null {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
    return Response.json({ error: `refused: host ${host}` }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (write && origin && new URL(origin).host !== req.headers.get("host")) {
    return Response.json({ error: "refused: cross-origin write" }, { status: 403 });
  }
  return null;
}
