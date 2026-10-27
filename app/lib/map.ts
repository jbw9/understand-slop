/**
 * The map on screen, whichever repository it describes.
 *
 * A map file states facts — `RUN`, the `OVERVIEW` of the repository, the
 * authored tree, and row-to-row `LINKS` — as `maps/<name>/map.json`,
 * hand-exported or generated.
 * Everything derived from those lives here, so a second repository is a second
 * file, not a copy of the tree plumbing.
 */

import type { Anatomy, CodeRef, Link, Node, Run } from "@/lib/data";
import { rowId } from "@/lib/data";

/**
 * The repository as a level of its own: what it is, and one picture whose
 * boxes open the roots. Absent on a map still being made, whose top level is
 * then its roots listed (D60).
 */
export type Overview = Pick<Node, "sub" | "detail" | "anatomy" | "issues" | "code" | "state" | "unsure">;

export interface MapFile {
  RUN: Run;
  OVERVIEW?: Overview;
  AUTHORED: Node[];
  LINKS: Link[];
}

/** The top level's id: the empty path, which is the repository itself. */
export const TOP_ID = "";

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
 * Runs once at module load over the authored tree, so `nodeAt`, `levelAt`
 * and the canvas all see one uniform structure and none of them
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

/** Everything the screen reads, derived once from one map file. */
export function buildMap(file: MapFile, name: string) {
  const { RUN, OVERVIEW, LINKS } = file;
  /**
   * The tree everything else reads: authored nodes, plus one node for every
   * row that carries `under`. Built once, so no consumer knows a row was
   * involved.
   */
  const L0: Node[] = withRowChildren(file.AUTHORED);

  /** The repository as a node: the level the empty path opens, its parts the roots. */
  const TOP: Node = { state: "derived", ...OVERVIEW, id: TOP_ID, title: RUN.repo, sub: OVERVIEW?.sub ?? "", col: 0, row: 0, children: L0 };

  /** Resolve a path of ids to the node it names; the empty path is the repository. */
  function nodeAt(path: string[]): Node | null {
    let found: Node | null = TOP;
    for (const id of path) {
      found = found?.children?.find((n) => n.id === id) ?? null;
      if (!found) return null;
    }
    return found;
  }

  /** The nodes shown at a given path's level — roots when the path is empty. */
  function levelAt(path: string[]): Node[] {
    return nodeAt(path)?.children ?? [];
  }

  return { name, RUN, OVERVIEW, LINKS, L0, TOP, nodeAt, levelAt };
}

export type BuiltMap = ReturnType<typeof buildMap>;


/**
 * The code behind a level. A row-built level has no refs of its own; the code
 * of the nearest level above it is still the code behind it, up to the
 * repository's own.
 */
export function codeAt({ nodeAt }: BuiltMap, path: string[]): CodeRef[] {
  for (let i = path.length; i >= 0; i--) {
    const code = nodeAt(path.slice(0, i))?.code;
    if (code?.length) return code;
  }
  return [];
}

/** Past this a pick reads as the whole card pasted in, not a pointer to it. */
const DETAIL_CAP = 1500;

const cap = (text: string) => (text.length > DETAIL_CAP ? `${text.slice(0, DETAIL_CAP)}…` : text);

const trail = ({ nodeAt }: BuiltMap, path: string[]) =>
  path
    .map((_, i) => nodeAt(path.slice(0, i + 1))?.title)
    .filter(Boolean)
    .join(" › ");

/**
 * Every section's name, indented as the tree nests — what Claude reads to
 * learn what the map calls things (`slop-map-list`, src-tauri/src/claude.rs).
 *
 * Titles and one-line subs only, no detail and no code: this is for choosing a
 * section to show, and a reader asking how sign-ups work is served by Claude
 * finding the one section called that, not by it reading the whole map first.
 */
export function outline(m: BuiltMap): string {
  const lines = (nodes: Node[], depth = 0): string[] =>
    nodes.flatMap((n) => [
      `${"  ".repeat(depth)}- ${n.title}${n.sub ? ` — ${n.sub}` : ""}`,
      ...lines(n.children ?? [], depth + 1),
    ]);
  return [`${m.RUN.repo}${m.OVERVIEW?.sub ? `: ${m.OVERVIEW.sub}` : ""}`, "", ...lines(m.L0)].join("\n");
}

/**
 * One section of the map as text for Claude: where it sits, what it says, and
 * the code behind it — the last so Claude reads the real thing, not only the
 * map's account of it. `[]` is the repository as a whole.
 */
export function describe(m: BuiltMap, path: string[]): string {
  const { RUN, OVERVIEW, L0, nodeAt } = m;
  const node = path.length ? nodeAt(path) : null;
  if (!node) {
    return [
      `[Map section: the whole repository (${RUN.repo})`,
      ...[OVERVIEW?.sub, OVERVIEW?.detail].filter(Boolean),
      `Its top-level sections: ${L0.map((n) => n.title).join(", ")}]`,
    ].join("\n");
  }
  const where = trail(m, path);
  const detail = node.detail && cap(node.detail);
  const code = codeAt(m, path);
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
export function describeElement(m: BuiltMap, path: string[], label: string, text: string, code?: string): string {
  const where = path.length ? `${trail(m, path)} › ${label}` : label;
  const behind = code ? [] : codeAt(m, path);
  return [
    `[Map element: ${where} (${m.RUN.repo})`,
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

/** Lines of code to send along with a section's problems. */
export interface Span {
  file: string;
  start: number;
  end: number;
}

/** Around a problem's line: enough to see the function it sits in. */
const BEFORE = 10;
const AFTER = 20;
/** One code ref, and everything sent at once. */
const SPAN_CAP = 80;
const TOTAL_CAP = 600;
/**
 * Claude Code puts a prompt hook's output in the prompt only under about
 * 10,000 characters; past that it saves it to a file, and reading it back is
 * the call this was meant to save. Measured: 9,800 went inline, 10,200 did not.
 */
const INLINE_CAP = 9000;

/**
 * The code a section's problems point at, so it can go with them: each
 * problem's line with some around it, then the section's own code, each
 * file's ranges merged where they meet, within TOTAL_CAP lines.
 */
export function problemSpans(m: BuiltMap, path: string[]): Span[] {
  const node = path.length ? m.nodeAt(path) : null;
  const wanted: Span[] = [];
  for (const it of node?.issues ?? []) {
    const at = it.where?.match(/^(.+?):(\d+)(?:-(\d+))?$/);
    if (at) wanted.push({ file: at[1], start: Math.max(1, Number(at[2]) - BEFORE), end: Number(at[3] ?? at[2]) + AFTER });
  }
  for (const c of codeAt(m, path)) wanted.push({ file: c.file, start: c.start, end: Math.min(c.end, c.start + SPAN_CAP - 1) });
  const merged: Span[] = [];
  let total = 0;
  for (const s of wanted) {
    const same = merged.find((x) => x.file === s.file && s.start <= x.end + 1 && x.start <= s.end + 1);
    if (same) {
      const grown = Math.max(same.end, s.end) - Math.min(same.start, s.start) + 1;
      if (total - (same.end - same.start + 1) + grown > TOTAL_CAP) continue;
      total += grown - (same.end - same.start + 1);
      same.start = Math.min(same.start, s.start);
      same.end = Math.max(same.end, s.end);
    } else if (total + (s.end - s.start + 1) <= TOTAL_CAP) {
      merged.push({ ...s });
      total += s.end - s.start + 1;
    }
  }
  return merged;
}

/**
 * A section's problems as text for an agent: every one in full — what goes
 * wrong and where — then the section they belong to and its code. With the
 * code itself (`source`, read from problemSpans), it goes along numbered, so
 * the agent can answer from it rather than spend calls finding it.
 */
export function describeProblems(m: BuiltMap, path: string[], source: (Span & { code: string })[] = []): string {
  const node = path.length ? m.nodeAt(path) : null;
  const issues = node?.issues ?? [];
  const code = codeAt(m, path);
  const head = [
    `[Map problems: ${trail(m, path)} (${m.RUN.repo})`,
    `The map found ${issues.length} ${issues.length === 1 ? "problem" : "problems"} here:`,
    ...issues.map((it, i) => `${i + 1}. ${it.title} — ${it.detail}${it.where ? ` (${it.where})` : ""}`),
    node?.sub ? `The section: ${node.sub}` : "",
    code.length ? `Code:\n${code.map((c) => `- ${c.file}:${c.start}-${c.end} — ${c.label}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  // The code, in order — problems' lines first — while it stays inline; the
  // range that would cross the line is cut short, and the rest left out.
  let room = INLINE_CAP - head.length - 60;
  const blocks: string[] = [];
  for (const s of source) {
    const lines = s.code.split("\n").map((l, i) => `${String(s.start + i).padStart(5)}  ${l}`);
    const kept: string[] = [];
    for (const l of lines) {
      if (l.length + 1 > room - s.file.length - 30) break;
      kept.push(l);
      room -= l.length + 1;
    }
    if (!kept.length) break;
    blocks.push(`${s.file}:${s.start}-${s.start + kept.length - 1}\n\`\`\`\n${kept.join("\n")}\n\`\`\``);
    room -= s.file.length + 30;
    if (kept.length < lines.length) break;
  }
  return (blocks.length ? `${head}\nThe code they point at, as it is now:\n${blocks.join("\n")}` : head).concat("]");
}
