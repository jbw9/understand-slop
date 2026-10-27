/**
 * Stage 1 — one short, structured reading of every source file (Haiku).
 *
 * The cut sees the whole repo only through these, so they record what a file
 * DOES for the product (what it reads, writes, shows, calls), with line ranges
 * the author can jump to. Keyed by content: an unchanged file is never re-read,
 * which is also what an incremental map will need.
 */

import { ask, BACKEND, MODELS } from "./bedrock";
import { isSource, numbered, type Inventory, type RepoFile } from "./inventory";

export interface FileSummary {
  path: string;
  purpose: string;
  kind: string;
  symbols: { name: string; start: number; end: number; does: string }[];
  reads: string[];
  writes: string[];
  external: string[];
  user_sees: string;
}

const KINDS = ["screen", "component", "api-route", "server-action", "hook", "state", "data-model", "migration", "query", "lib", "config", "script", "job", "cli", "entry", "types", "other"];

const TOOL = {
  name: "summary",
  description: "Record what this file does.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["purpose", "kind", "symbols", "reads", "writes", "external", "user_sees"],
    properties: {
      purpose: { type: "string", description: "One plain sentence: what this file does for the product or its caller. Not a restatement of the file name." },
      kind: { type: "string", enum: KINDS },
      symbols: {
        type: "array",
        description: "The functions, components, routes, classes or tables that matter, up to 12, with their exact line ranges as numbered.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "start", "end", "does"],
          properties: { name: { type: "string" }, start: { type: "integer" }, end: { type: "integer" }, does: { type: "string", description: "A few words." } },
        },
      },
      reads: { type: "array", items: { type: "string" }, description: "Data it reads: tables, collections, storage keys, env vars, cookies, files. Concrete names." },
      writes: { type: "array", items: { type: "string" }, description: "Data it writes, same form." },
      external: { type: "array", items: { type: "string" }, description: "Outside services or HTTP endpoints it calls (Stripe, S3, /api/posts)." },
      user_sees: { type: "string", description: "If it renders UI: what a user sees and can do, in one sentence. Otherwise empty." },
    },
  },
};

const SYSTEM = `You read one source file from a repository and record what it does, for someone mapping the whole codebase.
Be concrete and literal: real table names, real routes, real env var names, real line numbers as shown in the left margin.
Never guess at code you cannot see. Call the summary tool once.`;

/** Larger files are read in their first part only; the summary says so. */
const MAX_LINES = 1500;

const shown = (inv: Inventory, f: RepoFile) =>
  `File: ${f.path} (${f.lines} lines)${f.lines > MAX_LINES ? `\n(Only lines 1-${MAX_LINES} of ${f.lines} are shown.)` : ""}\n\n${numbered(inv.repo, f.path, 1, MAX_LINES)}`;

async function one(inv: Inventory, f: RepoFile): Promise<FileSummary> {
  try {
    const s = await ask<Omit<FileSummary, "path">>({
      model: MODELS.haiku,
      stage: "summarize",
      maxTokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Repository: ${inv.name}\n${shown(inv, f)}` }],
      tool: TOOL,
    });
    return { path: f.path, ...s };
  } catch (e) {
    // One unreadable file is a gap the cut is told about, not a failed run.
    return { path: f.path, purpose: `(not summarised: ${(e as Error).message.slice(0, 120)})`, kind: "other", symbols: [], reads: [], writes: [], external: [], user_sees: "" };
  }
}

const MANY = {
  name: "summaries",
  description: "Record what each file shown does.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["files"],
    properties: {
      files: {
        type: "array",
        items: { ...TOOL.input_schema, required: ["path", ...TOOL.input_schema.required], properties: { path: { type: "string", description: "The file's path exactly as shown." }, ...TOOL.input_schema.properties } },
      },
    },
  },
};

/** Lines a batch may carry, and files per batch. */
const BATCH_LINES = 3000;
const BATCH_FILES = 8;

/**
 * Small files in one call, for Claude Code: every `claude -p` pays its own
 * start-up and prompt, which one call per file multiplied by the repository.
 * A file the batch leaves out is summarised on its own.
 */
async function many(inv: Inventory, files: RepoFile[]): Promise<FileSummary[]> {
  let got: FileSummary[] = [];
  if (files.length > 1)
    got = (await ask<{ files: FileSummary[] }>({
      model: MODELS.haiku,
      stage: "summarize",
      system: `${SYSTEM.replace("one source file", "several source files").replace("Call the summary tool once.", "Record every file shown, each by its path.")}`,
      messages: [{ role: "user", content: `Repository: ${inv.name}\n\n${files.map((f) => shown(inv, f)).join("\n\n")}` }],
      tool: MANY,
    }).catch(() => ({ files: [] }))).files.filter((x) => files.some((f) => f.path === x.path));
  const left = files.filter((f) => !got.some((x) => x.path === f.path));
  return [...got, ...(await Promise.all(left.map((f) => one(inv, f))))];
}

export async function summarize(inv: Inventory, onDone: (n: number, of: number) => void): Promise<Record<string, FileSummary>> {
  const todo = inv.files.filter(isSource);
  const batches: RepoFile[][] = [];
  for (const f of todo) {
    const b = batches[batches.length - 1];
    const lines = (x: RepoFile) => Math.min(x.lines, MAX_LINES);
    if (BACKEND === "claude-code" && b && b.length < BATCH_FILES && b.reduce((a, x) => a + lines(x), 0) + lines(f) <= BATCH_LINES) b.push(f);
    else batches.push([f]);
  }
  const out: Record<string, FileSummary> = {};
  let n = 0;
  await Promise.all(
    batches.map(async (b) => {
      for (const s of b.length > 1 ? await many(inv, b) : [await one(inv, b[0])]) out[s.path] = s;
      for (let i = 0; i < b.length; i++) onDone(++n, todo.length);
    }),
  );
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

/** One line per file — the form the cut reads the whole repo in. */
export function oneLine(s: FileSummary): string {
  const io = [
    s.reads.length ? `reads ${s.reads.slice(0, 4).join(", ")}` : "",
    s.writes.length ? `writes ${s.writes.slice(0, 4).join(", ")}` : "",
    s.external.length ? `calls ${s.external.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return `${s.path} [${s.kind}] ${s.purpose}${io ? ` (${io})` : ""}`;
}

/** A file's summary with its symbols, the form an author reads its own files in. */
export function full(s: FileSummary): string {
  const syms = s.symbols.map((x) => `    ${x.start}-${x.end} ${x.name}: ${x.does}`).join("\n");
  return `${oneLine(s)}${s.user_sees ? `\n    user sees: ${s.user_sees}` : ""}${syms ? `\n${syms}` : ""}`;
}

/** A directory folded into one line: its size, what kinds of file it holds, and its largest files' purposes. */
function folded(dir: string, files: RepoFile[], sums: Record<string, FileSummary>): string {
  const kinds = new Map<string, number>();
  for (const f of files) {
    const k = sums[f.path]?.kind ?? "other";
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const mix = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${n} ${k}`).join(", ");
  const lines = files.reduce((a, f) => a + f.lines, 0);
  const largest = [...files]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 3)
    .map((f) => `${f.path.slice(dir.length + 1)}: ${(sums[f.path]?.purpose ?? "").slice(0, 90)}`)
    .join("; ");
  return `${dir}/ (${files.length} files, ${lines} lines: ${mix}) — largest: ${largest}`;
}

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/**
 * The files one line each (`line`), unless that is more than `budget`
 * characters: then whole directories are folded into one line apiece
 * (`dir/ (N files …)`), deepest and largest first, until it fits. A large
 * repository is still seen whole, with detail where the tree is shallow,
 * rather than failing a prompt that cannot hold one line per file. Says
 * whether anything was folded, so a prompt can tell its reader how to read it.
 */
export function fit(
  files: RepoFile[],
  sums: Record<string, FileSummary>,
  line: (f: RepoFile) => string,
  budget: number,
): { text: string; folded: boolean } {
  type Entry = { key: string; dir: string; text: string; files: RepoFile[] };
  let entries: Entry[] = files.map((f) => ({ key: f.path, dir: parentOf(f.path), text: line(f), files: [f] }));
  let size = entries.reduce((a, e) => a + e.text.length + 1, 0);
  let any = false;
  while (size > budget) {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) if (e.dir) groups.set(e.dir, [...(groups.get(e.dir) ?? []), e]);
    // The deepest directory first, and of those the one costing most: the top
    // of the tree is what a reader cuts by, so it keeps its detail longest.
    const depth = (d: string) => d.split("/").length;
    const cost = (es: Entry[]) => es.reduce((a, e) => a + e.text.length, 0);
    const pick = [...groups].sort(([a, x], [b, y]) => depth(b) - depth(a) || cost(y) - cost(x))[0];
    if (!pick) break;
    const [dir, inside] = pick;
    const all = inside.flatMap((e) => e.files);
    const one: Entry = { key: `${dir}/`, dir: parentOf(dir), text: folded(dir, all, sums), files: all };
    entries = [...entries.filter((e) => !inside.includes(e)), one];
    size += one.text.length - cost(inside);
    any = true;
  }
  return { text: entries.sort((a, b) => a.key.localeCompare(b.key)).map((e) => e.text).join("\n"), folded: any };
}

