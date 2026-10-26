/**
 * The shape a generated node must have, checked field by field so the author
 * gets a precise list back instead of a renderer crash. The types themselves
 * stay in lib/data.ts — `typeReference` hands the model that file's own text,
 * comments included, because those comments ARE the standard each field is
 * held to.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- validates untrusted model output */
import { readFileSync } from "node:fs";

/** lib/data.ts from `State` to just before the old inline fixture. */
export function typeReference(): string {
  const src = readFileSync("lib/data.ts", "utf8");
  return src.slice(src.indexOf("export type State"), src.indexOf("export const RUN"));
}

const STATES = ["derived", "partial", "inferred"];
const KINDS: Record<string, string[]> = {
  diagram: ["caption", "boxes", "arrows"],
  table: ["columns", "rows", "state"],
  sequence: ["actors", "rows"],
  screen: ["title", "items"],
  example: ["caption", "value"],
  schema: ["table", "rows"],
  routes: ["rows"],
  flow: ["rows"],
  facts: ["rows"],
  bars: ["unit", "rows"],
  parts: ["total", "rows"],
  chips: ["rows"],
  map: ["rows"],
};

const isStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown) => Number.isInteger(v);

/**
 * Problems with a node's shape, recursively. Mutates only what has one right
 * answer (`col`/`row` become the child's index) so the model is never asked to
 * spend a round on grid bookkeeping.
 */
export function shapeProblems(node: any, prefix: string, isRoot = true): string[] {
  const out: string[] = [];
  const at = (k: string) => `${node?.id ?? "?"}.${k}`;
  if (!node || typeof node !== "object") return ["node is not an object"];
  if (!isStr(node.id)) out.push(at("id") + " missing");
  else if (!isRoot && !node.id.startsWith(prefix + "-")) out.push(`${node.id}: ids under this root must start with "${prefix}-"`);
  for (const k of ["title", "sub"]) if (!isStr(node[k])) out.push(at(k) + " missing");
  if (!STATES.includes(node.state)) out.push(at("state") + ` must be one of ${STATES.join("/")}`);
  if (node.group && !["sequence", "set"].includes(node.group.ordering)) out.push(at("group.ordering") + " must be sequence or set");
  if (!Array.isArray(node.code)) out.push(at("code") + " must be an array of {file,start,end,label}");
  else node.code.forEach((c: any, i: number) => {
    if (!isStr(c?.file) || !isInt(c?.start) || !isInt(c?.end) || !isStr(c?.label)) out.push(at(`code[${i}]`) + " needs file, start, end (integers), label");
  });
  for (const [i, iss] of (node.issues ?? []).entries())
    if (!isStr(iss?.title) || !isStr(iss?.detail)) out.push(at(`issues[${i}]`) + " needs title and detail");
  for (const [i, b] of (node.anatomy ?? []).entries()) {
    const need = KINDS[b?.kind];
    if (!need) { out.push(at(`anatomy[${i}]`) + ` kind "${b?.kind}" is not one of ${Object.keys(KINDS).join(", ")}`); continue; }
    for (const k of need) if (b[k] === undefined) out.push(at(`anatomy[${i}]`) + ` (${b.kind}) missing ${k}`);
    if (b.kind === "diagram") {
      for (const x of b.boxes ?? []) if (!isStr(x?.id) || !isStr(x?.label) || !isInt(x?.col) || !isInt(x?.row)) out.push(at(`anatomy[${i}]`) + " diagram box needs id, label, col, row");
      for (const a of b.arrows ?? []) if (!isStr(a?.from) || !isStr(a?.to)) out.push(at(`anatomy[${i}]`) + " diagram arrow needs from, to");
    }
    if (b.kind === "table" && (!Array.isArray(b.columns) || !Array.isArray(b.rows) || b.rows.some((r: any) => !Array.isArray(r)))) out.push(at(`anatomy[${i}]`) + " table needs columns: string[] and rows: string[][]");
    if (b.kind === "screen" && (b.items ?? []).some((x: any) => !["heading", "text", "field", "choice", "button", "list", "image"].includes(x?.type)))
      out.push(at(`anatomy[${i}]`) + " screen item type must be heading/text/field/choice/button/list/image");
    if (b.kind === "screen" && !["phone", "web"].includes(b.device)) out.push(at(`anatomy[${i}]`) + ' screen needs device: "phone" or "web" — see the brief');
    if (b.kind === "screen" && b.route !== undefined && !(isStr(b.route) && b.route.startsWith("/")))
      out.push(at(`anatomy[${i}]`) + ' screen route is a URL path starting with "/", not a file path');
  }
  if (node.children !== undefined && !Array.isArray(node.children)) out.push(at("children") + " must be an array");
  (node.children ?? []).forEach((c: any, i: number) => {
    if (c && typeof c === "object") { c.col = 0; c.row = i; }
    out.push(...shapeProblems(c, prefix, false));
  });
  if (isRoot) { node.col = 0; node.row = 0; }
  return out;
}
