import { rowId, type Anatomy, type CodeUnit, type Edge, type Link, type Node } from "@/lib/data";
import { MapFile, type AnatomyFile, type MapFileT, type MapNodeT, type SymbolT } from "@/lib/schema";
import { makeMap } from "@/lib/tree";

/**
 * Turn a map file (ui/lib/schema.ts) into the map every view reads.
 *
 * Two passes of checking, so a bad file — an LLM's, most likely — fails with
 * a list of what is wrong and where, never with a blank screen:
 *  1. the schema, with zod;
 *  2. the references the schema can't see: ids unique, parents exist, edge
 *     ends are siblings, links land on real rows.
 * Code is the exception. A story names code by symbol id, and code moves:
 * a function renamed or deleted since the story was written is not a broken
 * file, it is drift. So a symbol or quote missing from the index is a
 * WARNING — its card still renders, marked partial and alarmed, saying what
 * is gone — and the rest of the map loads.
 * Then the flat node list is rebuilt into the tree, code references become
 * code-unit cards, and the result goes through `makeMap` like any other map.
 */

export type LoadedMap = ReturnType<typeof buildMap> & { warnings: string[] };

export class MapError extends Error {
  constructor(public problems: string[]) {
    super(`The map file has ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  }
}

export function parseMap(json: unknown): LoadedMap {
  const parsed = MapFile.safeParse(json);
  if (!parsed.success) {
    throw new MapError(
      parsed.error.issues.map((i) => `${pathText(i.path) || "(root)"}: ${i.message}`),
    );
  }
  const { errors, warnings: missing } = checkReferences(parsed.data);
  const warnings = [...parsed.data.notes, ...missing];
  if (errors.length) throw new MapError(errors);
  return { ...buildMap(parsed.data), warnings };
}

/** `["nodes", 0, "state"]` → `nodes[0].state`, matching the reference checks. */
const pathText = (path: PropertyKey[]) =>
  path.map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`)).join("");

/* ── pass 2: references ──────────────────────────────────────────── */

/** The row keys a card's anatomy exposes, as `rowId` builds them. */
function rowKeys(blocks: AnatomyFile[] = []): string[] {
  return blocks.flatMap((b) => {
    switch (b.kind) {
      case "schema":
        return b.rows.map((r) => r.name);
      case "routes":
        return b.rows.map((r) => `${r.method} ${r.path}`);
      case "flow":
        return b.rows.map((r) => String(r.n));
      case "facts":
      case "chips":
      case "bars":
      case "parts":
        return b.rows.map((r) => r.label);
      case "map":
        return b.rows.map((r) => r.from);
      case "source":
        return ["source"];
    }
  });
}

type SourceFile = Extract<AnatomyFile, { kind: "source" }>;

/** Every `source` block, however deep in `under`. */
export function sourcesIn(blocks: AnatomyFile[] = []): SourceFile[] {
  return blocks.flatMap((b) => {
    if (b.kind === "source") return [b];
    if (b.kind === "flow" || b.kind === "map") return b.rows.flatMap((r) => sourcesIn(r.under));
    return [];
  });
}

/** How many of a source block's three ways of naming code it uses. */
const formsOf = (b: SourceFile) =>
  [b.snippet !== undefined, b.symbol !== undefined, b.file !== undefined || b.at !== undefined].filter(Boolean).length;

/** What a missing quote says on its card, and in the warnings. */
function missingQuote(b: SourceFile) {
  if (b.symbol) return `${nameOf(b.symbol)} no longer found in ${fileOf(b.symbol)}`;
  if (b.file) return `"${b.at}" no longer found in ${b.file}`;
  return `snippet "${b.snippet}" is not in the index`;
}

const fileOf = (symbolId: string) => symbolId.slice(0, symbolId.indexOf("#"));

function checkReferences(m: MapFileT) {
  const out: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, MapNodeT>();
  m.nodes.forEach((n, i) => {
    if (byId.has(n.id)) out.push(`nodes[${i}].id: "${n.id}" is used twice`);
    byId.set(n.id, n);
  });
  const parentOf = (id: string) => byId.get(id)?.parent;

  m.nodes.forEach((n, i) => {
    if (n.parent !== null && !byId.has(n.parent)) out.push(`nodes[${i}].parent: no node "${n.parent}"`);
    for (const b of sourcesIn(n.anatomy)) {
      if (formsOf(b) !== 1 || (b.file !== undefined) !== (b.at !== undefined)) {
        out.push(`nodes[${i}] (${n.id}): a source block needs exactly one of snippet, symbol, or file + at`);
      } else if (!quoteOf(m, b)) warnings.push(`${n.id}: ${missingQuote(b)}`);
    }
    n.code?.forEach((c, j) => {
      const ref = typeof c === "string" ? { symbol: c } : c;
      if (!ref.symbol.includes("#")) out.push(`nodes[${i}].code[${j}]: "${ref.symbol}" is not a symbol id (<file>#<name>)`);
      else if (!(ref.symbol in m.index.symbols)) warnings.push(`${n.id}: ${nameOf(ref.symbol)} no longer found in ${fileOf(ref.symbol)}`);
    });
  });
  // A parent chain that loops would hang the tree build.
  for (const n of m.nodes) {
    const seen = new Set<string>();
    for (let at: string | null | undefined = n.id; at; at = parentOf(at)) {
      if (seen.has(at)) {
        out.push(`nodes: parent chain through "${n.id}" loops`);
        break;
      }
      seen.add(at);
    }
  }

  m.edges.forEach((e, i) => {
    if (e.parent !== null && !byId.has(e.parent)) out.push(`edges[${i}].parent: no node "${e.parent}"`);
    for (const end of ["from", "to"] as const) {
      const id = e[end];
      if (!byId.has(id)) out.push(`edges[${i}].${end}: no node "${id}"`);
      else if (parentOf(id) !== e.parent) {
        out.push(`edges[${i}].${end}: "${id}" is not a child of ${e.parent === null ? "the roots" : `"${e.parent}"`}`);
      }
    }
  });

  m.links.forEach((l, i) => {
    for (const end of ["from", "to"] as const) {
      const { node, row } = l[end];
      const n = byId.get(node);
      if (!n) out.push(`links[${i}].${end}.node: no node "${node}"`);
      else if (!rowKeys(n.anatomy).includes(row)) out.push(`links[${i}].${end}.row: "${node}" has no row "${row}"`);
    }
  });

  for (const [id, s] of Object.entries(m.index.symbols)) {
    s.calls.forEach((c, j) => {
      if (!(c in m.index.symbols)) out.push(`index.symbols["${id}"].calls[${j}]: no symbol "${c}"`);
    });
    if (s.parent && !(s.parent in m.index.symbols)) out.push(`index.symbols["${id}"].parent: no symbol "${s.parent}"`);
    if (s.end < s.start) out.push(`index.symbols["${id}"]: end ${s.end} is before start ${s.start}`);
  }
  return { errors: out, warnings };
}

/** The code a source block quotes, if the index has it. */
function quoteOf(m: MapFileT, b: SourceFile): { file: string; start: number; body: string } | null {
  if (b.symbol) return m.index.symbols[b.symbol] ?? null;
  if (b.snippet) return m.index.snippets[b.snippet] ?? null;
  // An anchor is resolved against the file when the story is merged with its
  // repo (lib/server/repo.ts), which turns it into a snippet. Seen here
  // unresolved, there was no file to read.
  return null;
}

/* ── build ───────────────────────────────────────────────────────── */

interface Narrative {
  sub?: string;
  detail?: string;
  state?: Node["state"];
  alarm?: boolean;
  id?: string;
  methods?: (Narrative & { symbol: string })[];
}

const nameOf = (symbolId: string) => symbolId.slice(symbolId.indexOf("#") + 1).split(".").pop()!;

function buildMap(m: MapFileT) {
  const symbols = m.index.symbols;
  /** The first card that shows each symbol: what a `calls` entry opens. */
  const cardOf = new Map<string, string>();
  const units: { node: Node; calls: string[] }[] = [];

  const anatomy = (blocks: AnatomyFile[]): Anatomy[] =>
    blocks.map((b): Anatomy => {
      if (b.kind === "source") {
        const s = quoteOf(m, b);
        if (!s) {
          return { kind: "source", file: b.file ?? (b.symbol ? fileOf(b.symbol) : "?"), start: 1, code: `// ${missingQuote(b)}`, why: b.why ? `${b.why} (The quote is gone: ${missingQuote(b)}.)` : `The quote is gone: ${missingQuote(b)}.` };
        }
        return { kind: "source", file: s.file, start: s.start, code: s.body, ...(b.why ? { why: b.why } : {}) };
      }
      if (b.kind === "flow") {
        return { ...b, rows: b.rows.map((r) => (r.under ? { ...r, under: anatomy(r.under) } : { ...r })) } as Anatomy;
      }
      if (b.kind === "map") {
        return { ...b, rows: b.rows.map((r) => (r.under ? { ...r, under: anatomy(r.under) } : { ...r })) } as Anatomy;
      }
      return b as Anatomy;
    });

  /** A code-unit card for `symbolId`, with its class's methods under it. */
  const unitCard = (
    symbolId: string,
    id: string,
    narrative: Narrative,
    row: number,
  ): Node => {
    const s: SymbolT | undefined = symbols[symbolId];
    if (!s) {
      // Drift: the story names code the repo no longer has. The card stays,
      // so links to it still land, and says what is gone.
      return {
        id,
        kind: "function",
        title: nameOf(symbolId),
        sub: `No longer found in ${fileOf(symbolId)}`,
        state: "partial",
        alarm: true,
        col: 0,
        row,
        detail: `The map names ${symbolId}, but the code has no unit by that name any more — it was renamed, moved or deleted since the story was written. Re-run /slop-map to update the story.${narrative.detail ? `\n\nWhat the story said: ${narrative.detail}` : ""}`,
      };
    }
    const unit: CodeUnit = {
      lang: s.lang === "text" ? "ts" : s.lang,
      file: s.file,
      start: s.start,
      end: s.end,
      signature: s.signature,
      body: s.body,
      complete: s.complete,
      symbol: symbolId,
    };
    const methods = Object.entries(symbols).filter(([, t]) => t.parent === symbolId);
    const node: Node = {
      id,
      kind: s.kind === "class" ? "class" : "function",
      title: nameOf(symbolId),
      sub: narrative.sub ?? "",
      state: narrative.state ?? "derived",
      ...(narrative.alarm ? { alarm: true } : {}),
      col: 0,
      row,
      ...(narrative.detail ? { detail: narrative.detail } : {}),
      evidence: `${s.file}:${s.start}`,
      unit,
      ...(methods.length
        ? {
            children: methods.map(([mid], k) => {
              const note: Narrative = narrative.methods?.find((x) => x.symbol === mid) ?? {};
              return unitCard(mid, note.id ?? `${id}.${nameOf(mid)}`, note, k);
            }),
          }
        : {}),
    };
    if (!cardOf.has(symbolId)) cardOf.set(symbolId, id);
    units.push({ node, calls: s.calls });
    return node;
  };

  const kids = new Map<string | null, MapNodeT[]>();
  for (const n of m.nodes) {
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent)!.push(n);
  }
  const edgesUnder = new Map<string | null, Edge[]>();
  for (const e of m.edges) {
    if (!edgesUnder.has(e.parent)) edgesUnder.set(e.parent, []);
    const { parent: _parent, ...edge } = e;
    void _parent;
    edgesUnder.get(e.parent)!.push(edge);
  }

  const build = (parent: string | null): Node[] =>
    (kids.get(parent) ?? []).map((n, i): Node => {
      const children = build(n.id);
      const code = (n.code ?? []).map((c, j) => {
        const ref = typeof c === "string" ? { symbol: c } : c;
        return unitCard(ref.symbol, ref.id ?? `${n.id}~${nameOf(ref.symbol)}`, ref, children.length + j);
      });
      const all = [...children, ...code];
      const edges = edgesUnder.get(n.id);
      return {
        id: n.id,
        ...(n.kind ? { kind: n.kind } : {}),
        title: n.title,
        sub: n.sub,
        state: n.state,
        ...(n.alarm ? { alarm: true } : {}),
        ...(n.ghost ? { ghost: true } : {}),
        col: 0,
        row: i,
        ...(n.detail ? { detail: n.detail } : {}),
        ...(n.evidence ? { evidence: n.evidence } : {}),
        ...(n.anatomy ? { anatomy: anatomy(n.anatomy) } : {}),
        ...(edges ? { edges } : {}),
        ...(all.length ? { children: all } : {}),
      };
    });

  const authored = build(null);
  // Calls are resolved last, once every card that shows a symbol exists.
  // A call to a symbol no card shows is dropped: there is nowhere to open.
  for (const u of units) {
    const calls = u.calls.flatMap((c) => cardOf.get(c) ?? []);
    if (calls.length) u.node.unit!.calls = calls;
  }

  const E0 = edgesUnder.get(null) ?? [];
  const LINKS: Link[] = m.links.map((l) => ({
    from: rowId(l.from.node, l.from.row),
    to: rowId(l.to.node, l.to.row),
    state: l.state,
    ...(l.alarm ? { alarm: true } : {}),
    ...(l.label ? { label: l.label } : {}),
  }));
  const RUN = {
    command: "slop",
    repo: m.repo.name,
    commit: m.repo.commit,
    files: m.repo.files,
    elapsed: "—",
  };
  return { RUN, E0, LINKS, ...makeMap(authored, E0) };
}
