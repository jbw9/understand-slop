/**
 * The one rule tying a code unit's signature to its body: the signature is
 * the body's HEAD — everything up to the first line that ends in `{` — read
 * as one line. Shared by the card editor (components/edits.tsx) and the repo
 * indexer (lib/server/indexer.ts), so an indexed signature always equals what
 * the editor reads back.
 */

/**
 * Split a unit into its head (through the first line ending in `{`) and the
 * rest. A unit whose head never opens a brace is all head, one line.
 */
export function splitHead(body: string) {
  const lines = body.split("\n");
  let k = lines.findIndex((l) => /\{\s*$/.test(l));
  if (k < 0) k = 0;
  return { head: lines.slice(0, k + 1).join("\n"), rest: lines.slice(k + 1).join("\n") };
}

/**
 * Re-read the signature from the body. Always re-read, never "kept if the body
 * still starts with it": typing at the END of the signature leaves that prefix
 * intact, so a prefix test would miss exactly the edit people make most —
 * adding a parameter or a return type.
 *
 * snecko's generator (scripts/gen_snecko.py) runs the same normalisation.
 */
export function readSignature(body: string) {
  return splitHead(body)
    .head.replace(/\{\s*$/, "") // the opening brace belongs to the body
    .replace(/\s+/g, " ") // a wrapped head reads as one line
    .replace(/\(\s+/g, "(")
    .replace(/,\s*\)/g, ")") // a trailing comma before `)` goes with the wrap
    .trim();
}
