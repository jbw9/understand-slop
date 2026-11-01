/**
 * A unified diff (`FileChange.diff`, lib/diff.ts) read back into lines a view
 * can draw. Its own file because lib/diff.ts runs git and cannot reach the page.
 */

/** One run of a unified diff, line by line, numbered on both sides. */
export interface HunkLines {
  oldStart: number;
  newStart: number;
  lines: { kind: "+" | "-" | " "; text: string; old?: number; new?: number }[];
}

/** `unified`, as hunks: each line with its number on the side it exists on. */
export function hunksOf(unified: string): HunkLines[] {
  const out: HunkLines[] = [];
  let o = 0;
  let n = 0;
  for (const l of unified.split("\n")) {
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (at) {
      o = Number(at[1]);
      n = Number(at[2]);
      out.push({ oldStart: o, newStart: n, lines: [] });
      continue;
    }
    const h = out[out.length - 1];
    // The `---`/`+++` header comes before the first hunk, so a removed line
    // reading `-- x` is never taken for it.
    if (!h || l.startsWith("\\")) continue;
    const kind = l[0];
    if (kind === "+") h.lines.push({ kind, text: l.slice(1), new: n++ });
    else if (kind === "-") h.lines.push({ kind, text: l.slice(1), old: o++ });
    else if (kind === " ") h.lines.push({ kind, text: l.slice(1), old: o++, new: n++ });
  }
  return out;
}
