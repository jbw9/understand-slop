import { rowId, type Anatomy, type Edge, type Node } from "@/lib/data";

/**
 * Everything a view needs from a map, built from any repo's authored tree.
 * The dataset files (visulearn.ts, snecko.ts) hold only facts; how a tree is
 * walked, and how rows that go deeper become nodes, is said once, here.
 */

/* ── rows that go deeper ──────────────────────────────────────
   A row carrying `under` becomes a REAL child node, spliced in beside whatever
   children its owner already had.

   The alternative — a bespoke "detail card" with its own state, its own
   position and its own wire — was built first and was wrong. It gave the
   product two ways to go deeper: cards drilled, rows did something else that
   looked similar and behaved differently. Everything the drill already does
   (camera, Escape, drillOut, the depth rule, out-of-scope fading) had to be
   re-implemented or went missing. As a node, a row inherits all of it and the
   special case disappears.

   The synthesized id is `rowId(owner, key)` — the SAME id the row's anchor
   registers under. That is deliberate: the wire layer resolves an endpoint by
   walking up to the nearest [data-node], so the row and the card it opens
   share an identity and connect without a special-cased wire. */

/** The rows of one anatomy block that carry `under`, as {key, label, blocks}. */
function deepRows(blocks: Anatomy[]) {
  const out: { key: string; label: string; under: Anatomy[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "map") {
      for (const r of b.rows) {
        if (r.under) out.push({ key: r.from, label: r.from, under: r.under });
      }
    } else if (b.kind === "flow") {
      for (const r of b.rows) {
        if (r.under) out.push({ key: String(r.n), label: r.title, under: r.under });
      }
    }
  }
  return out;
}

/**
 * Walk the tree and give every `under`-carrying row a child node.
 *
 * Runs once at module load over the authored tree, so `nodeAt`, `levelAt`,
 * `allNodes` and the canvas all see one uniform structure and none of them
 * needs to know a row was involved.
 */
function withRowChildren(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const authored = n.children ? withRowChildren(n.children) : [];
    const fromRows = n.anatomy
      ? deepRows(n.anatomy).map((r, i): Node => ({
          id: rowId(n.id, r.key),
          title: r.label,
          // What this level answers, not a restatement of the row.
          sub: "what happens to it",
          state: "derived",
          col: 0,
          row: authored.length + i,
          anatomy: r.under,
          evidence: n.evidence,
          // Only the one you clicked is ever rendered. See Node.fromRow.
          fromRow: true,
        }))
      : [];
    const children = [...authored, ...fromRows];
    return children.length ? { ...n, children } : { ...n, children: undefined };
  });
}

/**
 * The tree everything else reads — authored nodes, plus one node for every
 * row that carries `under` — and the lookups over it. Built once per map, so
 * no consumer knows a row was involved. Views walk by path, so none of these
 * assumes a depth.
 */
export function makeMap(authored: Node[], roots: Edge[]) {
  const L0: Node[] = withRowChildren(authored);

  /** Resolve a path of ids to the node it names. */
  function nodeAt(path: string[]): Node | null {
    let level: Node[] = L0;
    let found: Node | null = null;
    for (const id of path) {
      found = level.find((n) => n.id === id) ?? null;
      if (!found) return null;
      level = found.children ?? [];
    }
    return found;
  }

  /** The nodes shown at a given path's level — roots when the path is empty. */
  function levelAt(path: string[]): Node[] {
    if (path.length === 0) return L0;
    return nodeAt(path)?.children ?? [];
  }

  /**
   * The path from a root to the node with this id, or null. Ids are unique
   * across the whole tree, which is what lets a relation or a row link name a
   * node anywhere and have the view jump straight to it.
   */
  function pathTo(id: string, nodes: Node[] = L0, at: string[] = []): string[] | null {
    for (const n of nodes) {
      const here = [...at, n.id];
      if (n.id === id) return here;
      const found = pathTo(id, n.children ?? [], here);
      if (found) return found;
    }
    return null;
  }

  /** The edges among the nodes listed at a path's level — the root edges at the top. */
  function edgesOf(path: string[]): Edge[] {
    if (path.length === 0) return roots;
    return nodeAt(path)?.edges ?? [];
  }

  /** Every node in the tree, flattened. Used for id lookups and audits. */
  function allNodes(nodes: Node[] = L0): Node[] {
    return nodes.flatMap((n) => [n, ...allNodes(n.children ?? [])]);
  }

  return { L0, nodeAt, levelAt, pathTo, edgesOf, allNodes };
}
