import { readTelemetry, setTelemetry } from "@/lib/telemetry";

/** Whether finished runs are reported to the admin dashboard: `GET` → `{on}`, `POST {on}` sets it. */
export async function GET() {
  return Response.json({ on: !(await readTelemetry()).off });
}

export async function POST(request: Request) {
  // JSON only: a cross-site form can send text/plain with no preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "bad request" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  await setTelemetry(body.on);
  return Response.json({ on: body.on });
}
