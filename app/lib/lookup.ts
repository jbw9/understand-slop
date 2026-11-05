/**
 * The map as Claude reads it through its tools (src-tauri/src/mcp.rs):
 * searching it, opening one section, and asking which section explains a
 * file or line. Plain text, because the reader of it is a model choosing what
 * to read next, and every answer names sections by the id path that
 * `slop-map-show section` and plans take, so what Claude finds it can show.
 */
import { findSection } from "@/lib/act";
import { citations, neighbours, nodesAt, symbolsOf, type Link, type MapIndex } from "@/lib/coverage";
import type { Anatomy, Node } from "@/lib/data";
import { describe, type BuiltMap } from "@/lib/map";

const trailOf = (m: BuiltMap, path: string[]) => path.map((_, i) => m.nodeAt(path.slice(0, i + 1))?.title ?? path[i]).join(" › ");
const named = (m: BuiltMap, path: string[]) => `${trailOf(m, path)} [${path.join("/")}]`;

/** Sections whose words match, then symbols and files by name: what to open next. */
export function mapSearch(m: BuiltMap, index: MapIndex | null, query: string): string {
  const q = query.trim().toLowerCase();
  if (!q) return "Give a query: words from what you are looking for, a symbol, or a path.";
  const levels: { path: string[]; score: number }[] = [];
  const walk = (nodes: Node[], at: string[]) => {
    for (const n of nodes) {
      const p = [...at, n.id];
      const title = n.title.toLowerCase();
      const body = [n.sub, n.detail, n.explain?.body].join(" ").toLowerCase();
      const score = title.includes(q) ? 3 : q.split(/\s+/).every((w) => title.includes(w)) ? 2 : body.includes(q) ? 1 : 0;
      if (score) levels.push({ path: p, score });
      walk(n.children ?? [], p);
    }
  };
  walk(m.L0, []);
  levels.sort((a, b) => b.score - a.score || b.path.length - a.path.length);
  const cited = citations(m.L0);
  const code: string[] = [];
  for (const [file, f] of Object.entries(index?.files ?? {})) {
    for (const s of symbolsOf(cited, file, f))
      if (s.name.toLowerCase().includes(q)) code.push(`- ${s.name} (${file}:${s.start}-${s.end}) → ${s.by[0] ? named(m, s.by[0].path) : "not explained by any section"}`);
    if (file.toLowerCase().includes(q)) {
      const by = (cited.get(file) ?? []).sort((a, b) => b.path.length - a.path.length)[0];
      code.push(`- ${file} → ${by ? named(m, by.path) : f.status === "excluded" ? `left out of the map: ${f.reason ?? ""}` : "not explained by any section"}`);
    }
  }
  const out = [
    levels.length ? `Sections:\n${levels.slice(0, 12).map((l) => `- ${named(m, l.path)} — ${m.nodeAt(l.path)?.sub ?? ""}`).join("\n")}` : "",
    code.length ? `Code:\n${code.slice(0, 15).join("\n")}` : "",
  ].filter(Boolean);
  return out.length ? out.join("\n\n") : `Nothing on the map matches "${query}".`;
}

const at = (x: { at?: string }) => (x.at ? ` (${x.at})` : "");
const ROWS = 20;

/**
 * A block as text: the picture's facts, each with the line it cites. Without
 * them a reader of the section got its two sentences and had to open the code
 * for what the level already drew (kafka: map-only answers ran out of turns).
 */
function blockText(b: Anatomy): string {
  const head = "caption" in b && b.caption ? `${b.caption}: ` : "";
  const list = (xs: string[]) => xs.slice(0, ROWS).join("\n") + (xs.length > ROWS ? `\n… ${xs.length - ROWS} more` : "");
  switch (b.kind) {
    case "diagram": {
      const label = (id: string) => b.boxes.find((x) => x.id === id)?.label ?? id;
      return `${head}diagram\n${list(b.arrows.map((a) => `- ${label(a.from)} → ${label(a.to)}${a.label ? `: ${a.label}` : ""}${at(a)}`))}`;
    }
    case "flow": return `${head}steps\n${list(b.rows.map((r, i) => `${i + 1}. ${r.title} — ${r.detail}${at(r)}`))}`;
    case "sequence": return `${head}sequence\n${list(b.rows.map((r) => `- ${r.from} → ${r.to}: ${r.label}${at(r)}`))}`;
    case "table": return `${head}table (${b.columns.join(" | ")})\n${list(b.rows.map((r) => `- ${r.join(" | ")}`))}`;
    case "schema": return `${b.table}: schema\n${list(b.rows.map((c) => `- ${c.name}: ${c.type}${c.key ? ` ${c.key}` : ""}${c.note ? ` — ${c.note}` : ""}`))}`;
    case "routes": return `routes\n${list(b.rows.map((r) => `- ${r.method} ${r.path} (${r.auth})${r.note ? ` — ${r.note}` : ""}`))}`;
    case "facts": return `facts\n${list(b.rows.map((r) => `- ${r.label}: ${r.value}`))}`;
    case "map": return `${head}mapping\n${list(b.rows.map((r) => `- ${r.from} → ${r.to}`))}`;
    case "chips": return `${head}${b.rows.map((r) => r.label).join(", ")}`;
    case "screen": return `screen ${b.title}${b.route ? ` at ${b.route}` : ""}\n${list(b.items.map((x) => `- ${x.type} ${x.label}${x.note ? ` — ${x.note}` : ""}`))}`;
    case "example": return `${head}example\n${b.value.slice(0, 800)}`;
    default: return "";
  }
}

const linked = (m: BuiltMap, ls: Link[]) => ls.slice(0, 12).map((l) => `- ${l.path ? named(m, l.path) : `${l.file} (no section explains it)`} — ${l.via}${l.count > 1 ? ` and ${l.count - 1} more` : ""}`).join("\n");

/** One section as `describe` gives it, with what it draws, what it uses and what uses it, and its parts listed so Claude can go deeper. */
export function mapSection(m: BuiltMap, name: string, index: MapIndex | null = null): string {
  const path = name.trim() ? findSection(m, name) : [];
  if (!path) return `No section is called "${name}". Use map_search to find one.`;
  const node = path.length ? m.nodeAt(path) : null;
  const parts = (node ? node.children : m.L0) ?? [];
  const blocks = ((node ?? m.OVERVIEW)?.anatomy ?? []).map(blockText).filter(Boolean);
  const { uses, usedBy } = neighbours(m.L0, index, path);
  return [
    describe(m, path),
    path.length ? `Id path: ${path.join("/")}` : "",
    blocks.length ? `What it shows:\n${blocks.join("\n\n")}` : "",
    uses.length ? `Uses (its code imports):\n${linked(m, uses)}` : "",
    usedBy.length ? `Used by (what a change here reaches):\n${linked(m, usedBy)}` : "",
    parts.length ? `Its parts:\n${parts.map((c) => `- ${c.title} [${[...path, c.id].join("/")}] — ${c.sub}`).join("\n")}` : "",
    node?.issues?.length ? `Watch out:\n${node.issues.map((i) => `- ${i.title}: ${i.detail}${i.where ? ` (${i.where})` : ""}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The files that import a file, each with the section that explains it. */
function importers(m: BuiltMap, index: MapIndex | null, file: string): string {
  const from = Object.entries(index?.imports ?? {}).filter(([, bs]) => bs.includes(file)).map(([a]) => a);
  if (!from.length) return "";
  const cited = citations(m.L0);
  const rows = from.slice(0, 12).map((a) => {
    const by = (cited.get(a) ?? []).slice().sort((x, y) => x.path.length - y.path.length)[0];
    return `- ${a}${by ? ` → ${named(m, by.path)}` : ""}`;
  });
  return `\n\nImported by ${from.length} file${from.length > 1 ? "s" : ""}:\n${rows.join("\n")}${from.length > 12 ? `\n… ${from.length - 12} more` : ""}`;
}

/** The sections that open a file, or a line of it, deepest first; or why none does. */
export function mapWhere(m: BuiltMap, index: MapIndex | null, file: string, line?: number): string {
  // Claude often names a file by its absolute path.
  const root = m.RUN.root?.replace(/\/$/, "");
  const path = (root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file).replace(/^\.?\//, "");
  const cited = citations(m.L0);
  const hits = line ? nodesAt(cited, path, line) : (cited.get(path) ?? []).slice().sort((a, b) => b.path.length - a.path.length);
  const seen = new Set<string>();
  const levels = hits.filter((c) => !seen.has(c.path.join("/")) && seen.add(c.path.join("/")));
  if (levels.length) return `${path}${line ? `:${line}` : ""} is explained by:\n${levels.slice(0, 8).map((c) => `- ${named(m, c.path)} (cites ${c.start}-${c.end})`).join("\n")}${importers(m, index, path)}`;
  const f = index?.files[path];
  const inFile = cited.get(path) ?? [];
  const near = line ? inFile.slice().sort((a, b) => Math.min(Math.abs(a.start - line), Math.abs(a.end - line)) - Math.min(Math.abs(b.start - line), Math.abs(b.end - line)))[0] : inFile[0];
  if (!f && near) return `No section opens ${path}:${line}. Nearest in this file: ${named(m, near.path)} (cites ${near.start}-${near.end}).`;
  if (!f) return `${path} is not on the map: it is not in the checkout the map was made from (new since, or not a file).`;
  if (f.status === "excluded") return `${path} was left out of the map: ${(f.reason ?? "no reason recorded").replace(/\.$/, "")}.`;
  if (f.status === "other") return `${path} is ${f.kind ?? "not source"}, which the map does not explain.`;
  const roots = f.roots.map((r) => m.L0.find((n) => n.id === r)?.title ?? r).join(", ");
  return `No section opens ${path}${line ? `:${line}` : ""}.${near ? ` Nearest in this file: ${named(m, near.path)}.` : ""}${roots ? ` It belongs to ${roots}.` : ""}${importers(m, index, path)}`;
}
