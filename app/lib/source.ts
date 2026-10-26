/**
 * Client-side: where the drawer reads code from.
 *
 * Served by `next dev`, that is `/api/source` over the real checkout. A static
 * export (scripts/export-static.mts) has no server, so it reads the files the
 * map cites, baked into `source.json` beside the page at build time.
 */

import type { Slice } from "@/lib/repo";

/** Set only in a static export: the one map it serves. */
export const STATIC_MAP = process.env.NEXT_PUBLIC_STATIC_MAP;
/** In a static export, the code host page a ref links to: `<base>/<file>#L<start>-L<end>`. */
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;

let baked: Promise<Record<string, string>> | undefined;

export async function readSource(
  q: { map: string; file: string; start: number; end: number; fixture?: string },
  signal?: AbortSignal,
): Promise<{ slice: Slice } | { refused: string }> {
  if (!STATIC_MAP) {
    const params = new URLSearchParams({ map: q.map, file: q.file, start: String(q.start), end: String(q.end) });
    if (q.fixture !== undefined) params.set("fixture", q.fixture);
    const res = await fetch(`/api/source?${params}`, { signal });
    const body = await res.json();
    return res.ok ? { slice: body as Slice } : { refused: (body.refused as string) ?? "unreadable" };
  }
  baked ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/source.json`).then((r) => r.json());
  const text = (await baked)[q.file];
  if (text === undefined) return { refused: "not in this export" };
  const lines = text.split("\n");
  const code = lines.slice(q.start - 1, q.end).join("\n");
  return {
    slice: { file: q.file, start: q.start, end: q.end, code, total: lines.length, matchesFixture: q.fixture === undefined || code === q.fixture },
  };
}
