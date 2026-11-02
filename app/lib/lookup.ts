/**
 * The map as Claude reads it through its tools (src-tauri/src/mcp.rs):
 * searching it, opening one section, and asking which section explains a
 * file or line. Plain text, because the reader of it is a model choosing what
 * to read next, and every answer names sections by the id path that
 * `slop-map-show section` and plans take, so what Claude finds it can show.
 */
import { findSection } from "@/lib/act";
import { citations, nodesAt, symbolsOf, type MapIndex } from "@/lib/coverage";
import type { Node } from "@/lib/data";
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

/** One section as `describe` gives it, with its parts listed so Claude can go deeper. */
export function mapSection(m: BuiltMap, name: string): string {
  const path = name.trim() ? findSection(m, name) : [];
  if (!path) return `No section is called "${name}". Use map_search to find one.`;
  const node = path.length ? m.nodeAt(path) : null;
  const parts = (node ? node.children : m.L0) ?? [];
  return [
    describe(m, path),
    path.length ? `Id path: ${path.join("/")}` : "",
    parts.length ? `Its parts:\n${parts.map((c) => `- ${c.title} [${[...path, c.id].join("/")}] — ${c.sub}`).join("\n")}` : "",
    node?.issues?.length ? `Watch out:\n${node.issues.map((i) => `- ${i.title}: ${i.detail}${i.where ? ` (${i.where})` : ""}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
  if (levels.length) return `${path}${line ? `:${line}` : ""} is explained by:\n${levels.slice(0, 8).map((c) => `- ${named(m, c.path)} (cites ${c.start}-${c.end})`).join("\n")}`;
  const f = index?.files[path];
  const inFile = cited.get(path) ?? [];
  const near = line ? inFile.slice().sort((a, b) => Math.min(Math.abs(a.start - line), Math.abs(a.end - line)) - Math.min(Math.abs(b.start - line), Math.abs(b.end - line)))[0] : inFile[0];
  if (!f && near) return `No section opens ${path}:${line}. Nearest in this file: ${named(m, near.path)} (cites ${near.start}-${near.end}).`;
  if (!f) return `${path} is not on the map: it is not in the checkout the map was made from (new since, or not a file).`;
  if (f.status === "excluded") return `${path} was left out of the map: ${(f.reason ?? "no reason recorded").replace(/\.$/, "")}.`;
  if (f.status === "other") return `${path} is ${f.kind ?? "not source"}, which the map does not explain.`;
  const roots = f.roots.map((r) => m.L0.find((n) => n.id === r)?.title ?? r).join(", ");
  return `No section opens ${path}${line ? `:${line}` : ""}.${near ? ` Nearest in this file: ${named(m, near.path)}.` : ""}${roots ? ` It belongs to ${roots}.` : ""}`;
}
