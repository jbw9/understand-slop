/**
 * A plan Claude wrote in plan mode, read for its tab (components/plan.tsx),
 * and the question Claude Code asks about it, read off the terminal.
 *
 * The plan is Markdown in the shape Claude is asked for (src-tauri/src/claude.rs,
 * SYSTEM): a title, one sentence, a picture as fenced JSON, then short
 * sections. Nothing here insists on that shape: a plan written any other way is
 * still split by its headings and drawn as Markdown.
 */

export interface Section {
  title: string;
  body: string;
}

export interface PlanDoc {
  title: string;
  /** The one sentence under the title: what the user gets. */
  lede: string;
  /** Everything between the lede and the first section: the picture. */
  intro: string;
  sections: Section[];
  steps: number;
  files: { added: number; changed: number; removed: number };
  /** Minutes to read the words, rounded up. */
  minutes: number;
}

/** One line of a ```files block. */
export interface FileLine {
  verdict: "added" | "changed" | "removed";
  path: string;
  why: string;
}

const VERDICT = { "+": "added", "~": "changed", "-": "removed", "−": "removed" } as const;

export function fileLines(body: string): FileLine[] {
  return body.split("\n").flatMap((l) => {
    const m = l.match(/^\s*([+~\-−])\s+(\S+)(.*)$/);
    if (!m) return [];
    const why = m[3].replace(/^\s*(?:[—–:]|--?)\s*/, "").trim();
    return [{ verdict: VERDICT[m[1] as keyof typeof VERDICT], path: m[2].replace(/`/g, ""), why }];
  });
}

/** The fences drawn as pictures rather than shown as code. */
const DRAWN = /^```(diagram|screen|sequence|table|files)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;

export type Piece = { kind: "prose"; text: string } | { kind: "figure"; lang: string; body: string };

/**
 * Markdown cut into prose and the fences drawn as pictures, in order, so a
 * picture is never laid out by the prose's own list and table styles.
 */
export function pieces(md: string): Piece[] {
  const out: Piece[] = [];
  let from = 0;
  for (const m of md.matchAll(DRAWN)) {
    const prose = md.slice(from, m.index).trim();
    if (prose) out.push({ kind: "prose", text: prose });
    out.push({ kind: "figure", lang: m[1], body: m[2] });
    from = m.index + m[0].length;
  }
  const rest = md.slice(from).trim();
  if (rest) out.push({ kind: "prose", text: rest });
  return out;
}

/** Lines outside fences, for finding headings and counting words. */
function unfenced(lines: string[]): boolean[] {
  let inside = false;
  return lines.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) {
      inside = !inside;
      return false;
    }
    return !inside;
  });
}

export function parsePlan(text: string): PlanDoc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const open = unfenced(lines);
  const h1 = lines.findIndex((l, i) => open[i] && /^#\s+/.test(l));
  const title = h1 >= 0 ? lines[h1].replace(/^#\s+/, "").trim() : "Plan";
  const starts = lines.flatMap((l, i) => (open[i] && /^##\s+/.test(l) ? [i] : []));
  const head = lines.slice(0, starts[0] ?? lines.length).filter((_, i) => i !== h1);

  // The first paragraph of plain words under the title, if it comes first.
  const first = head.findIndex((l) => l.trim());
  let lede = "";
  let intro = head;
  if (first >= 0 && !/^\s*([#>|`~*-]|\d+\.|<)/.test(head[first])) {
    const end = head.findIndex((l, i) => i > first && !l.trim());
    const stop = end < 0 ? head.length : end;
    lede = head.slice(first, stop).join(" ").trim();
    intro = head.slice(stop);
  }

  const sections = starts.map((s, k) => ({
    title: lines[s].replace(/^##\s+/, "").trim(),
    body: lines.slice(s + 1, starts[k + 1] ?? lines.length).join("\n").trim(),
  }));

  const steps = sections
    .filter((s) => /step/i.test(s.title))
    .reduce((n, s) => n + s.body.split("\n").filter((l) => /^\d+[.)]\s/.test(l)).length, 0);
  const files = { added: 0, changed: 0, removed: 0 };
  for (const m of text.matchAll(/^\s*```files\s*\n([\s\S]*?)^\s*```/gm)) {
    for (const f of fileLines(m[1])) files[f.verdict]++;
  }
  const words = lines.filter((l, i) => open[i]).join(" ").split(/\s+/).filter(Boolean).length;

  return { title, lede, intro: intro.join("\n").trim(), sections, steps, files, minutes: Math.max(1, Math.ceil(words / 200)) };
}

/** One answer Claude Code offers to a plan; `input` takes words: what to change. */
export interface Choice {
  n: number;
  label: string;
  input: boolean;
}

/**
 * The answers Claude Code offers to a plan, read off the bottom of its
 * terminal, or null while it is not asking. Read rather than assumed, because
 * they differ between versions and settings ("Yes, and use auto mode",
 * "Yes, and auto-accept edits", "Yes, clear context and …"): what a button in
 * the plan's tab says is what pressing its number in the terminal does.
 *
 * Only the plan's own question counts. A permission prompt for a command asks
 * "Do you want to proceed?" with numbered answers too, and must never be
 * answered from here.
 */
export function planChoices(screen: string[]): Choice[] | null {
  const at = screen.findLastIndex((l) => /would you like to proceed|ready to execute/i.test(l));
  if (at < 0) return null;
  const out: Choice[] = [];
  for (const l of screen.slice(at + 1)) {
    const m = l.match(/^\s*(?:[❯›>]\s*)?(\d)\.\s+(.+?)\s*$/);
    if (m && Number(m[1]) === out.length + 1) out.push({ n: out.length + 1, label: m[2], input: !/^yes\b/i.test(m[2]) });
  }
  return out.some((c) => !c.input) ? out : null;
}
