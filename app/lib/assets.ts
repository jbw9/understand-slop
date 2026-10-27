/**
 * Server-side: images a doc pulls from the web — badges, logos, diagrams on a
 * CDN — fetched once and kept in the vault, so a doc read on a train still
 * shows them. A copy younger than a day is served without asking; an older
 * one is refreshed, and kept serving when the network is not there.
 *
 * The URL comes from a doc, which comes from someone else's repository, so it
 * is treated as hostile: http(s) only, no address on this machine or its
 * network, an image type, and a size cap.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VAULT } from "@/lib/vault";

const DIR = join(VAULT, "cache", "images");
const FRESH = 24 * 60 * 60 * 1000;
const MAX = 5 << 20;

/** Hosts that name this machine or a private network: never fetched. */
const LOCAL = /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

export class NotAnImage extends Error {}

function check(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NotAnImage("bad url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new NotAnImage("not http");
  if (LOCAL.test(url.hostname)) throw new NotAnImage("local address");
  return url;
}

export async function remoteImage(raw: string): Promise<{ body: Buffer; type: string }> {
  const url = check(raw);
  const key = createHash("sha256").update(url.href).digest("hex");
  const body = join(DIR, key);
  const meta = join(DIR, `${key}.json`);
  const cached = () =>
    existsSync(body) && existsSync(meta)
      ? { body: readFileSync(body), type: (JSON.parse(readFileSync(meta, "utf8")) as { type: string }).type }
      : null;
  if (existsSync(meta) && Date.now() - statSync(meta).mtimeMs < FRESH) {
    const hit = cached();
    if (hit) return hit;
  }
  try {
    // Redirects by hand, each hop checked before it is asked: a badge host
    // redirecting to this machine must not get the request made for it.
    let at = url;
    let res = await fetch(at, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    for (let hop = 0; res.status >= 300 && res.status < 400 && res.headers.get("location"); hop++) {
      if (hop === 4) throw new NotAnImage("too many redirects");
      at = check(new URL(res.headers.get("location")!, at).href);
      res = await fetch(at, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    }
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new NotAnImage(`not an image (${res.status} ${type})`);
    const got = Buffer.from(await res.arrayBuffer());
    if (got.length > MAX) throw new NotAnImage("too large");
    mkdirSync(DIR, { recursive: true });
    writeFileSync(`${body}.part`, got);
    renameSync(`${body}.part`, body);
    writeFileSync(meta, JSON.stringify({ url: url.href, type }));
    return { body: got, type };
  } catch (e) {
    // Offline, or the host is down: the last copy, however old, beats a hole.
    const stale = cached();
    if (stale) return stale;
    throw e instanceof NotAnImage ? e : new NotAnImage("unreachable");
  }
}
