import { existsSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { sourcesIn } from "@/lib/load";
import { Story, type MapFileT, type SnippetT, type StoryT, type SymbolT } from "@/lib/schema";
import { fileCount, headCommit, indexFile, indexRepo } from "@/lib/server/indexer";

/**
 * A repo's map, as served: `.slop/story.json` (what /slop-map wrote) merged
 * with an index read from the code right now. Nothing here is cached — the
 * index is rebuilt on every read, so the map always quotes the code as it is
 * on disk, saved edits included.
 */

export const storyPath = (dir: string) => path.join(dir, ".slop", "story.json");

export class StoryError extends Error {
  constructor(public problems: string[]) {
    super(problems.join("\n"));
  }
}

/** The story file, schema-checked. Reference checks happen after the merge. */
export function readStory(dir: string): StoryT {
  const file = storyPath(dir);
  if (!existsSync(file)) {
    throw new StoryError([`${file}: no story yet. Run /slop-map in Claude Code in ${dir} to write one.`]);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new StoryError([`${file}: not valid JSON (${e instanceof Error ? e.message : String(e)})`]);
  }
  const parsed = Story.safeParse(json);
  if (!parsed.success) {
    throw new StoryError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return parsed.data;
}

/** Write `.slop/index.json` — for reading, and for the skill to search. */
export function writeIndex(dir: string, symbols: Record<string, SymbolT>) {
  mkdirSync(path.join(dir, ".slop"), { recursive: true });
  writeFileSync(path.join(dir, ".slop", "index.json"), JSON.stringify({ symbols }, null, 1) + "\n");
}

/**
 * Story + index → one map file. Anchored quotes (`file` + `at` + `lines`)
 * are read from the file here and become snippets; one whose line is gone is
 * left unresolved, and the loader marks it.
 */
export function repoMap(dir: string, story = readStory(dir), symbols = indexRepo(dir)): MapFileT {
  const snippets: Record<string, SnippetT> = {};
  const files = new Map<string, string[] | null>();
  const linesOf = (file: string) => {
    if (!files.has(file)) {
      const abs = inside(dir, file);
      files.set(file, abs && existsSync(abs) ? readFileSync(abs, "utf8").split(/\r?\n/) : null);
    }
    return files.get(file);
  };

  const notes: string[] = [];
  const nodes = story.nodes.map((n) => {
    for (const b of sourcesIn(n.anatomy)) {
      if (b.file === undefined || b.at === undefined) continue;
      const file = b.file;
      const lines = linesOf(file);
      // `at` is one line, or several consecutive ones when one isn't unique.
      // Compared trimmed, so indentation never breaks an anchor.
      const want = b.at.split("\n").map((l) => l.trim());
      const hits: number[] = [];
      lines?.forEach((_, k) => {
        if (want.every((w, i) => lines[k + i]?.trim() === w)) hits.push(k);
      });
      if (hits.length > 1) {
        notes.push(
          `${n.id}: "${b.at}" matches ${hits.length} places in ${file} (lines ${hits.map((h) => h + 1).join(", ")}); add the next line to \`at\` to pick one`,
        );
      }
      const k = hits[0] ?? -1;
      const key = `${file}@${b.at}`;
      // Turn the anchor into a snippet reference in place: the loader then
      // treats every quote the same way. The node object is a fresh parse,
      // so mutating its blocks touches nothing shared.
      b.snippet = key;
      delete b.file;
      delete b.at;
      if (lines && k >= 0) {
        const body = lines.slice(k, k + (b.lines ?? 1)).join("\n");
        snippets[key] = { file, start: k + 1, lang: langOf(file), body };
      }
      delete b.lines;
    }
    return n;
  });

  return {
    ...story,
    repo: { ...story.repo, commit: headCommit(dir), files: fileCount(dir), path: dir },
    nodes,
    index: { symbols, snippets },
    notes,
  };
}

function langOf(f: string): SnippetT["lang"] {
  if (/\.[cm]?[jt]sx$/.test(f)) return "tsx";
  if (/\.[cm]?[jt]s$/.test(f)) return "ts";
  if (/\.rs$/.test(f)) return "rs";
  return "text";
}

/** `file` resolved under `dir`, or null if it would land outside it. */
function inside(dir: string, file: string): string | null {
  const root = path.resolve(dir);
  const abs = path.resolve(root, file);
  return abs.startsWith(root + path.sep) ? abs : null;
}

export class SaveConflict extends Error {}

/**
 * Write a unit's new text back to its file.
 *
 * The unit is found by id in the file AS IT IS NOW, not by the line numbers
 * the browser holds, and must still read exactly `before` — the text the edit
 * started from. If someone changed it on disk since, nothing is written and
 * the caller gets a conflict: an edit made against old code never silently
 * overwrites new code. The write is a temp file and a rename, so the file is
 * never seen half-written.
 */
export function saveSymbol(dir: string, symbol: string, before: string, after: string): SymbolT | null {
  const file = symbol.slice(0, symbol.indexOf("#"));
  const abs = file ? inside(dir, file) : null;
  if (!abs || !existsSync(abs)) throw new SaveConflict(`${file || symbol}: not a file in this repo`);
  const now = indexFile(dir, file)[symbol];
  if (!now) throw new SaveConflict(`${symbol} is no longer in ${file}`);
  if (now.body !== before) throw new SaveConflict(`${symbol} changed on disk since it was loaded`);

  const text = readFileSync(abs, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  lines.splice(now.start - 1, now.end - now.start + 1, ...after.split(/\r?\n/));
  const tmp = `${abs}.slop-${process.pid}`;
  writeFileSync(tmp, lines.join(eol));
  chmodSync(tmp, statSync(abs).mode);
  renameSync(tmp, abs);

  // Read back what was written: the unit as the file now has it, or null if
  // the edit left no unit starting there (it was renamed into a non-unit, say).
  return Object.values(indexFile(dir, file)).find((s) => s.start === now.start) ?? null;
}
