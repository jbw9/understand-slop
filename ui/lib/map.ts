/**
 * The map on screen, whichever repository it describes.
 *
 * A fixture states facts — `RUN`, the authored tree, the root chain `E0`, and
 * row-to-row `LINKS`. Everything derived from those lives here, so a second
 * repository is a second fixture and a one-line change below, not a copy of
 * the tree plumbing.
 */

import type { Anatomy, CodeRef, Node } from "@/lib/data";
import { rowId } from "@/lib/data";
import { AUTHORED, RUN } from "@/lib/explorify";

export { RUN, E0, LINKS } from "@/lib/explorify";

/* ── rows that go deeper ──────────────────────────────────────
   A row carrying `under` becomes a REAL child node, spliced in beside whatever
   children its owner already had. See the note in lib/data.ts: the synthesized
   id is rowId(owner, key), the same id the row's anchor registers under, so the
   row and the card it opens share an identity and connect without a special
   case in the wire layer. */

/** The rows of one anatomy block that carry `under`, as {key, label, blocks}. */
function deepRows(blocks: Anatomy[]) {
  const out: { key: string; label: string; sub?: string; detail?: string; under: Anatomy[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "map") {
      for (const r of b.rows) {
        // `to` is carried so the node can state the rule itself. On the engine
        // cards `from → to` IS the formula, and a card titled "dividendsTax"
        // whose subtitle only named its parent would hide the one line the
        // reader opened it for.
        if (r.under) out.push({ key: r.from, label: r.from, sub: r.to, under: r.under });
      }
    } else if (b.kind === "flow") {
      for (const r of b.rows) {
        // `detail` rides along. The card no longer renders a step's paragraph
        // when that step has somewhere to go (D24) — so if it does not land on
        // the child it lands nowhere, which is content present in the file and
        // invisible in the UI. That is the exact failure this tool exists to
        // find, and it stayed green through tsc and lint.
        if (r.under) out.push({ key: String(r.n), label: r.title, detail: r.detail, under: r.under });
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
    // ⚠ The synthesized children are fed back through this function, NOT just
    // constructed and returned.
    //
    // A row's `under` is itself an Anatomy[], so it can hold rows that carry
    // their own `under` — which is the only way a branch reaches past three
    // levels. Building these nodes without recursing set `anatomy` correctly
    // and then never looked at it again, so the second `under` stayed data and
    // never became a node: every root measured exactly 3 levels deep however
    // deeply it was authored. The content was present in the file and
    // unreachable in the UI, which is the failure that looks most like "the
    // fixture is shallow" while being nothing of the kind.
    const fromRows = n.anatomy
      ? withRowChildren(
          deepRows(n.anatomy).map((r, i): Node => ({
            id: rowId(n.id, r.key),
            title: r.label,
            // Not authored per row: 93 of these exist. A map row already
            // states the rule on its `to` side, so that becomes the subtitle —
            // on the engine cards it is literally the formula. Everything else
            // falls back to naming the card it opened out of, which is the
            // "what belongs to what" question. The generic "what happens to
            // it" it replaces said nothing on all 93.
            sub: r.sub ?? `Inside ${n.title}`,
            detail: r.detail,
            state: "derived",
            col: 0,
            row: authored.length + i,
            anatomy: r.under,
            evidence: n.evidence,
            fromRow: true,
          })),
        )
      : [];
    const children = [...authored, ...fromRows];
    return children.length ? { ...n, children } : { ...n, children: undefined };
  });
}

/**
 * The tree everything else reads: authored nodes, plus one node for every row
 * that carries `under`. Built once, so no consumer knows a row was involved.
 */
export const L0: Node[] = withRowChildren(AUTHORED);

/** Resolve a path of ids to the node it names. */
export function nodeAt(path: string[]): Node | null {
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
export function levelAt(path: string[]): Node[] {
  if (path.length === 0) return L0;
  return nodeAt(path)?.children ?? [];
}

/** Every node in the tree, flattened. Used for id lookups and audits. */
export function allNodes(nodes: Node[] = L0): Node[] {
  return nodes.flatMap((n) => [n, ...allNodes(n.children ?? [])]);
}

/**
 * The code behind a level. A row-built level has no refs of its own; the code
 * of the nearest level above it is still the code behind it.
 */
export function codeAt(path: string[]): CodeRef[] {
  for (let i = path.length; i > 0; i--) {
    const code = nodeAt(path.slice(0, i))?.code;
    if (code?.length) return code;
  }
  return [];
}

/** Past this a pick reads as the whole card pasted in, not a pointer to it. */
const DETAIL_CAP = 1500;

const cap = (text: string) => (text.length > DETAIL_CAP ? `${text.slice(0, DETAIL_CAP)}…` : text);

const trail = (path: string[]) =>
  path
    .map((_, i) => nodeAt(path.slice(0, i + 1))?.title)
    .filter(Boolean)
    .join(" › ");

/**
 * One section of the map as text for Claude: where it sits, what it says, and
 * the code behind it — the last so Claude reads the real thing, not only the
 * map's account of it. `[]` is the repository as a whole.
 */
export function describe(path: string[]): string {
  const node = path.length ? nodeAt(path) : null;
  if (!node) {
    return [
      `[Map section: the whole repository (${RUN.repo})`,
      RUN.about,
      `Its top-level sections: ${L0.map((n) => n.title).join(", ")}]`,
    ].join("\n");
  }
  const where = trail(path);
  const detail = node.detail && cap(node.detail);
  const code = codeAt(path);
  return [
    `[Map section: ${where} (${RUN.repo})`,
    node.sub,
    detail,
    node.unsure ? `Not certain: ${node.unsure}` : "",
    node.issues?.length ? `Problems: ${node.issues.map((i) => i.title).join("; ")}` : "",
    code.length ? `Code:\n${code.map((c) => `- ${c.file}:${c.start}-${c.end} — ${c.label}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("]");
}

/**
 * One thing on a level — a row, a box, a line of a screen — as text for
 * Claude: what it says, where on the map it sits, and its code. With no code
 * of its own, the code behind its section is named instead.
 */
export function describeElement(path: string[], label: string, text: string, code?: string): string {
  const where = path.length ? `${trail(path)} › ${label}` : label;
  const behind = code ? [] : codeAt(path);
  return [
    `[Map element: ${where} (${RUN.repo})`,
    cap(text.trim()),
    code ? `Code: ${code}` : "",
    behind.length
      ? `Code behind its section:\n${behind.map((c) => `- ${c.file}:${c.start}-${c.end} — ${c.label}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("]");
}
