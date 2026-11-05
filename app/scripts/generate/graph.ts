/**
 * The fact graph: every function, method and class in the repository, and who
 * calls, inherits from and imports whom, read from the code with no model.
 *
 * One generic path for every language: tree-sitter parses the file with that
 * language's grammar (tree-sitter-wasms, prebuilt, no native build) and the
 * language's tags query (tags/<lang>.scm, the grammars' own tags.scm with
 * inheritance added) names its definitions and calls in the same words
 * everywhere. Nothing here knows Python from Go.
 *
 * What is language-specific is which definition a call means, and that is
 * resolved by name, never by type: a bare call to a name defined once in the
 * same file or a file it imports, or a self/this call to a method of the same
 * class, is `extracted` (the source says it); a call through any other
 * receiver, or to the only definition of a name anywhere, is `inferred`; a
 * name with several candidates is left out and counted, not guessed.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { Language, Parser, Query, type Node as SyntaxNode } from "web-tree-sitter";
import { langOf } from "./imports";
import type { Inventory } from "./inventory";

export interface Def {
  /** `path#Outer.inner`; `@line` is added when the same name is defined twice at one level. */
  id: string;
  name: string;
  kind: string;
  file: string;
  start: number;
  end: number;
  /** The definition this one sits in, if any. */
  parent?: string;
  /** Its decorators and signature as written: `@app.route("/login")\ndef login(form):`. */
  head?: string;
  /** Its doc comment or docstring, trimmed. */
  doc?: string;
  /** What it does, in one line: the summarize stage's reading of it (withSummaries). */
  does?: string;
}
export interface Edge {
  /** A def id, or a file path for code at a file's top level (and for every import). */
  from: string;
  to: string;
  kind: "calls" | "inherits" | "imports";
  how: "extracted" | "inferred";
  /** Lines in `from`'s file where it happens; empty for imports. */
  lines: number[];
}
export interface Graph {
  commit: string;
  /** Every file the graph parsed: only in these can it say what a line calls. */
  files: string[];
  /** What each file is for, from the summarize stage (withSummaries). */
  about?: Record<string, string>;
  defs: Def[];
  edges: Edge[];
  /** Files parsed, calls left out because their name had several candidates, and how long the build took. */
  stats: { files: number; parsed: number; calls: number; resolved: number; ambiguous: number; ms: number };
}

/** Which grammar and which tags query each extension reads with. */
const GRAMMAR: Record<string, [wasm: string, tags: string]> = {
  ".ts": ["typescript", "typescript"], ".mts": ["typescript", "typescript"], ".cts": ["typescript", "typescript"], ".tsx": ["tsx", "typescript"],
  ".js": ["javascript", "javascript"], ".jsx": ["javascript", "javascript"], ".mjs": ["javascript", "javascript"], ".cjs": ["javascript", "javascript"],
  ".py": ["python", "python"],
  ".java": ["java", "java"], ".kt": ["kotlin", "kotlin"], ".scala": ["scala", "scala"],
  ".go": ["go", "go"],
  ".rs": ["rust", "rust"],
  ".cs": ["c_sharp", "c_sharp"],
  ".php": ["php", "php"],
  ".rb": ["ruby", "ruby"],
  ".c": ["c", "c"], ".h": ["cpp", "cpp"], ".cc": ["cpp", "cpp"], ".cpp": ["cpp", "cpp"], ".cxx": ["cpp", "cpp"], ".hpp": ["cpp", "cpp"], ".hh": ["cpp", "cpp"],
  ".swift": ["swift", "swift"],
  ".dart": ["dart", "dart"],
  ".ex": ["elixir", "elixir"], ".exs": ["elixir", "elixir"],
};
/** Definition kinds that are parts of the code; constants, variables and fields are not. */
const KINDS = new Set(["function", "method", "class", "interface", "module", "type", "struct", "trait", "enum", "object", "macro", "implementation"]);
const CLASSY = new Set(["class", "interface", "struct", "trait", "enum", "object", "type", "module", "implementation"]);
/** Receivers that mean the enclosing class. */
const SELF = new Set(["self", "this", "cls", "super", "Self", "@"]);
/**
 * Method names every language's built-in containers, strings and promises
 * have. Through a receiver of unknown type they are not resolved to a repo
 * method of the same name (Flask's `options.get(...)` is a dict, not
 * `Scaffold.get`), unless an earlier call showed the receiver's class.
 */
const GENERIC = new Set([
  "get", "set", "has", "add", "delete", "remove", "clear", "keys", "values", "items", "entries", "update", "append", "extend", "insert", "copy",
  "join", "split", "format", "replace", "strip", "trim", "lower", "upper", "startswith", "endswith", "startsWith", "endsWith", "includes", "indexOf",
  "map", "filter", "reduce", "forEach", "find", "some", "every", "sort", "slice", "splice", "concat", "then", "catch", "finally", "toString", "valueOf",
  "length", "size", "count", "index", "len", "pop", "setdefault", "discard", "print", "Add", "Get", "Set", "String", "Error", "close", "read", "write", "next", "call", "apply", "bind", "emit", "on",
]);
/** Languages whose file edges imports.ts reads from a parsed import statement; the rest are matched by name. */
const PARSED_IMPORTS = new Set(["ts", "python", "rust", "c", "dart", "ruby", "php"]);

let ready: Promise<void> | null = null;
const languages = new Map<string, Promise<Language>>();
const queries = new Map<string, Query>();
const req = createRequire(join(process.cwd(), "package.json"));

function language(name: string): Promise<Language> {
  if (!languages.has(name)) languages.set(name, Language.load(req.resolve(`tree-sitter-wasms/out/tree-sitter-${name}.wasm`)));
  return languages.get(name)!;
}
function query(lang: Language, wasm: string, tags: string): Query {
  const key = `${wasm}:${tags}`;
  if (!queries.has(key)) queries.set(key, new Query(lang, readFileSync(join(process.cwd(), "scripts/generate/tags", `${tags}.scm`), "utf8")));
  return queries.get(key)!;
}

interface Raw { name: string; kind: string; startIndex: number; endIndex: number; start: number; end: number; nameIndex: number }
interface Ref { name: string; index: number; line: number; receiver: string | null; kind: "call" | "inherits" }

/** The token before a call's name, when the name is reached through one (`x.go()`, `$this->go()`, `Mod::go()`). */
function receiverOf(text: string, index: number): string | null {
  const before = text.slice(Math.max(0, index - 200), index);
  if (!/(\?\.|\.|->|::)\s*$/.test(before)) return null;
  const m = /([@$]?[A-Za-z_][\w]*|\)|\]|")\s*(\?\.|\.|->|::)\s*$/.exec(before);
  if (!m) return "?";
  return m[1].replace(/^\$/, "");
}

/** Definitions and references of one file, from its grammar's tags query. */
function read(parser: Parser, q: Query, text: string, wasm: string): { defs: Raw[]; refs: Ref[] } {
  const tree = parser.parse(text);
  if (!tree) return { defs: [], refs: [] };
  const defs: Raw[] = [];
  const refs: Ref[] = [];
  try {
    for (const m of q.matches(tree.rootNode)) {
      const name = m.captures.find((c) => c.name === "name")?.node;
      const outer = m.captures.find((c) => c.name.startsWith("definition.") || c.name.startsWith("reference."));
      if (!name || !outer) continue;
      const [role, kind] = outer.name.split(".");
      if (role === "definition") {
        if (!KINDS.has(kind)) continue;
        let node: SyntaxNode = outer.node;
        // Dart keeps a function's body beside its signature, not inside it.
        if (wasm === "dart" && node.nextNamedSibling?.type === "function_body") node = node.nextNamedSibling;
        defs.push({ name: name.text, kind, startIndex: outer.node.startIndex, endIndex: node.endIndex, start: outer.node.startPosition.row + 1, end: node.endPosition.row + 1, nameIndex: name.startIndex });
      } else if (kind === "call" || kind === "inherits") {
        refs.push({ name: name.text, index: name.startIndex, line: name.startPosition.row + 1, receiver: kind === "call" ? receiverOf(text, name.startIndex) : null, kind });
      }
    }
  } finally {
    tree.delete();
  }
  return { defs, refs };
}

/** Same name at the same level twice (overloads, if/else definitions): the later ones get their line. */
function nest(file: string, raws: Raw[]): { defs: Def[]; spans: (Def & { a: number; b: number })[] } {
  const sorted = [...raws].sort((x, y) => x.startIndex - y.startIndex || y.endIndex - x.endIndex);
  const seen = new Set<string>();
  const stack: (Def & { a: number; b: number })[] = [];
  const out: (Def & { a: number; b: number })[] = [];
  const taken = new Set<string>();
  for (const r of sorted) {
    const k = `${r.startIndex}:${r.nameIndex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    while (stack.length && stack[stack.length - 1].b < r.endIndex) stack.pop();
    const parent = stack[stack.length - 1];
    const qual = parent ? `${parent.id.slice(parent.id.indexOf("#") + 1)}.${r.name}` : r.name;
    let id = `${file}#${qual}`;
    if (taken.has(id)) id = `${id}@${r.start}`;
    taken.add(id);
    const kind = r.kind === "function" && parent && CLASSY.has(parent.kind) ? "method" : r.kind;
    const d = { id, name: r.name, kind, file, start: r.start, end: r.end, ...(parent ? { parent: parent.id } : {}), a: r.startIndex, b: r.endIndex };
    out.push(d);
    stack.push(d);
  }
  return { defs: out.map((d) => { const { a, b, ...def } = d; void a; void b; return def; }), spans: out };
}

/** The innermost definition holding a position. */
function within(spans: { a: number; b: number; id: string }[], index: number): string | null {
  let best: { a: number; b: number; id: string } | null = null;
  for (const s of spans) if (s.a <= index && index < s.b && (!best || s.b - s.a < best.b - best.a)) best = s;
  return best?.id ?? null;
}

/** A module's name as code calls it: `src/file_utils.rs` → file_utils, `pkg/helpers/__init__.py` → helpers. */
function stem(path: string): string {
  const parts = path.split("/");
  const base = parts.pop()!.replace(/\.[^.]+$/, "");
  return /^(mod|__init__|index|lib)$/.test(base) ? parts.pop() ?? base : base;
}

/** Whether a function's parameter list names `name`: the text from its own name to the end of its signature. */
function shadows(def: string, own: string, name: string): boolean {
  const at = def.indexOf(own);
  if (at < 0) return false;
  const sig = def.slice(at + own.length, at + own.length + 600);
  const end = sig.search(/\)\s*(:|\{|->|=>|\bwhere\b|\bthrows\b|\bdo\b|$)/m);
  return new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`).test(end < 0 ? sig.split("\n")[0] : sig.slice(0, end));
}

/** Lines that annotate the definition below them: `@decorator`, `#[attr]`, `[Attribute]`. */
const ANNOTATION = /^\s*(@[\w.]+|#\[|\[[A-Z]\w*[\](])/;
/** Lines of comment, in any of the languages read. */
const COMMENT = /^\s*(\/\/\/?|#(?!\[)|\/\*\*?|\*(?!\/)|\*\/|--|%)/;
const HEAD_LINES = 4;
const DOC_CHARS = 400;

/**
 * A definition's header and doc, read from the lines around it with no
 * grammar: the annotations just above it and its first lines up to where its
 * body opens; the comment just above it, or a docstring just inside.
 */
function describe(lines: string[], start: number, end: number): { head?: string; doc?: string } {
  let top = start - 1;
  while (top > 0 && ANNOTATION.test(lines[top - 1])) top--;
  const sig: string[] = [];
  for (let i = start - 1; i < Math.min(end, start - 1 + HEAD_LINES); i++) {
    sig.push(lines[i].trimEnd());
    if (/(\{|:|=>|\bdo|=)\s*$/.test(lines[i]) || /\{\s*\S/.test(lines[i])) break;
  }
  const head = [...lines.slice(top, start - 1).map((l) => l.trim()), ...sig.map((l, i) => (i ? l.trim() : l.trim()))].join("\n").slice(0, 300);
  // A comment just above (past any annotations), nearest line last.
  const above: string[] = [];
  for (let i = top - 1; i >= 0 && COMMENT.test(lines[i]) && above.length < 12; i--) above.unshift(lines[i]);
  let doc = above.map((l) => l.replace(/^\s*(\/\/\/?|#|\/\*\*?|\*\/?|--|%)\s?/, "").replace(/\*\/\s*$/, "").trim()).filter(Boolean).join(" ");
  // Else a docstring just inside: Python's """...""", Elixir's @doc """...""".
  if (!doc) {
    const after = lines.slice(start - 1 + sig.length, Math.min(end, start - 1 + sig.length + 15)).join("\n");
    // A long one need not close within the lines looked at: its opening is what the reader needs.
    const m = /^\s*(?:@(?:module)?doc\s+)?[rRuUbB]?("""|\'\'\')([\s\S]*?)(?:\1|$)|^\s*(?:@(?:module)?doc\s+)?"([^"\n]*)"/.exec(after);
    if (m) doc = (m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim();
  }
  return { ...(head ? { head } : {}), ...(doc ? { doc: doc.slice(0, DOC_CHARS) } : {}) };
}

/**
 * Lays the summarize stage's reading onto the graph: what each file is for,
 * and what each symbol it named does, onto the definition of that name whose
 * lines it spans. The only words in the graph a model wrote.
 */
export function withSummaries(g: Graph, sums: Record<string, { purpose: string; symbols: { name: string; start: number; end: number; does: string }[] }>): Graph {
  g.about = {};
  const byFile = new Map<string, Def[]>();
  for (const d of g.defs) byFile.set(d.file, [...(byFile.get(d.file) ?? []), d]);
  for (const [path, s] of Object.entries(sums)) {
    if (s.purpose && !s.purpose.startsWith("(not summarised")) g.about[path] = s.purpose;
    for (const sym of s.symbols ?? []) {
      const short = sym.name.split(/[.:#\s(]/).filter(Boolean).pop() ?? sym.name;
      const cands = (byFile.get(path) ?? []).filter((d) => d.name === short || d.name === sym.name);
      const d = cands.find((x) => x.start <= sym.end && sym.start <= x.end) ?? (cands.length === 1 ? cands[0] : undefined);
      if (d && sym.does && !d.does) d.does = sym.does;
    }
  }
  return g;
}

let active: Graph | null = null;
/** The graph this run draws from: authors' graph tools answer from it, and the checker proves arrows against it. */
export function setGraph(g: Graph | null) {
  active = g;
}
export const activeGraph = () => active;

const cache = new Map<string, Promise<Graph>>();

/** The repository's fact graph; built once per inventory. */
export function buildGraph(inv: Inventory): Promise<Graph> {
  const key = `${inv.repo}@${inv.commit}:${inv.files.filter((f) => f.code).map((f) => f.hash).join("")}`;
  if (!cache.has(key)) cache.set(key, compile(inv));
  return cache.get(key)!;
}

async function compile(inv: Inventory): Promise<Graph> {
  const t0 = Date.now();
  ready ??= Parser.init();
  await ready;
  const code = inv.files.filter((f) => f.code);
  // Every grammar is loaded before a parser exists: loading one while a parser is alive took 4-5 s each (saas-starter).
  await Promise.all([...new Set(code.map((f) => GRAMMAR[extname(f.path).toLowerCase()]?.[0]).filter(Boolean))].map((l) => language(l!)));
  const parser = new Parser();
  const defs: Def[] = [];
  const perFile = new Map<string, { spans: (Def & { a: number; b: number })[]; refs: Ref[]; text: string }>();
  const tests = new Set(code.filter((f) => f.test).map((f) => f.path));
  let parsed = 0;
  const parsedFiles: string[] = [];
  for (const f of code) {
    const g = GRAMMAR[extname(f.path).toLowerCase()];
    if (!g) continue;
    let text: string;
    try {
      text = readFileSync(join(inv.repo, f.path), "utf8");
    } catch {
      continue;
    }
    const lang = await language(g[0]);
    parser.setLanguage(lang);
    const { defs: raws, refs } = read(parser, query(lang, g[0], g[1]), text, g[0]);
    const { defs: mine, spans } = nest(f.path, raws);
    const lines = text.split("\n");
    for (const d of mine) Object.assign(d, describe(lines, d.start, d.end));
    defs.push(...mine);
    parsedFiles.push(f.path);
    // A definition's own name is not a call to it (Elixir's `def run(x)` is a call node).
    const named = new Set(raws.map((r) => r.nameIndex));
    perFile.set(f.path, { spans, refs: refs.filter((r) => !named.has(r.index)), text });
    parsed++;
  }
  parser.delete();

  const byName = new Map<string, Def[]>();
  for (const d of defs) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const classOf = (id: string | null): Def | null => {
    for (let d = id ? byId.get(id) : undefined; d; d = d.parent ? byId.get(d.parent) : undefined) if (CLASSY.has(d.kind)) return d;
    return null;
  };

  const edges = new Map<string, Edge>();
  const add = (from: string, to: string, kind: Edge["kind"], how: Edge["how"], line?: number) => {
    if (from === to) return;
    const k = `${from}\u0000${to}\u0000${kind}`;
    const e = edges.get(k) ?? { from, to, kind, how, lines: [] };
    if (how === "extracted") e.how = "extracted";
    if (line && !e.lines.includes(line)) e.lines.push(line);
    edges.set(k, e);
  };

  // Inheritance first, so a self call can look in the class's parents.
  const parents = new Map<string, Def[]>();
  for (const [file, { spans, refs }] of perFile) {
    const near = new Set([file, ...(inv.imports[file] ?? [])]);
    for (const r of refs.filter((x) => x.kind === "inherits")) {
      const owner = classOf(within(spans, r.index));
      if (!owner) continue;
      const cands = (byName.get(r.name) ?? []).filter((d) => CLASSY.has(d.kind) && d.id !== owner.id);
      const local = cands.filter((d) => near.has(d.file));
      const pick = local.length === 1 ? local[0] : !local.length && cands.length === 1 ? cands[0] : null;
      if (!pick) continue;
      add(owner.id, pick.id, "inherits", local.length === 1 ? "extracted" : "inferred", r.line);
      parents.set(owner.id, [...(parents.get(owner.id) ?? []), pick]);
    }
  }

  let calls = 0;
  let resolved = 0;
  let ambiguous = 0;
  /** Which class a receiver turned out to be, per function: `from \0 receiver` → class id. */
  const seenOn = new Map<string, string>();
  for (const [file, { spans, refs, text }] of perFile) {
    const near = new Set([file, ...(inv.imports[file] ?? [])]);
    for (const r of refs.filter((x) => x.kind === "call")) {
      calls++;
      const from = within(spans, r.index) ?? file;
      // Code that ships never calls into a test file.
      const all = (byName.get(r.name) ?? []).filter((d) => tests.has(file) || !tests.has(d.file));
      if (!all.length) continue;
      let pick: Def | null = null;
      let how: Edge["how"] = "inferred";
      if (r.receiver && SELF.has(r.receiver)) {
        // self.x(): a method of this class, or of a class it inherits from.
        const cls = classOf(from);
        const lineage = cls ? [cls, ...(parents.get(cls.id) ?? [])] : [];
        for (const c of lineage) {
          const m = all.filter((d) => d.parent === c.id);
          if (m.length === 1) {
            pick = m[0];
            how = c === cls ? "extracted" : "inferred";
            break;
          }
        }
      } else if (r.receiver && /^[A-Z]/.test(r.receiver)) {
        // Mod.x() / Class.x(): a definition inside something of that name.
        const m = all.filter((d) => d.parent && byId.get(d.parent)?.name.split(".").pop() === r.receiver);
        if (m.length === 1) pick = m[0];
        else if (m.length > 1) ambiguous++;
      } else if (r.receiver) {
        // x.y(): the type of x is unknown, so only a single candidate nearby will do,
        // unless an earlier call on x in this function already showed which class x is.
        // A receiver named like a file it can reach is that module: `file_utils::f()`, `helpers.f()`.
        const mod = all.filter((d) => !d.parent && near.has(d.file) && d.file !== file && stem(d.file) === r.receiver);
        const m = mod.length ? mod : all.filter((d) => near.has(d.file) && d.parent);
        const known = seenOn.get(`${from}\u0000${r.receiver}`);
        if (!mod.length && GENERIC.has(r.name) && !known) {
          // dict.get(), list.append(), promise.then(): far likelier a built-in than the one repo method of that name.
          if (m.length) ambiguous++;
        } else if (m.length === 1) {
          pick = m[0];
          if (m[0].parent) seenOn.set(`${from}\u0000${r.receiver}`, m[0].parent);
        } else if (m.length > 1) {
          const cls = seenOn.get(`${from}\u0000${r.receiver}`);
          const same = cls ? m.filter((d) => d.parent === cls) : [];
          if (same.length === 1) pick = same[0];
          else ambiguous++;
        }
      } else {
        // y(): what this file defines or imports at the top level, else the only one anywhere.
        // Top-level definitions, and functions nested in one that encloses this call (closures).
        const enclosing = new Set<string>();
        for (let id: string | undefined = from; id && byId.has(id); id = byId.get(id)!.parent) enclosing.add(id);
        const top = all.filter((d) => !d.parent || enclosing.has(d.parent));
        // A parameter of the same name shadows them all: `def from_file(self, filename, load)` then `load(f)`.
        const own = spans.find((s) => s.id === from);
        if (own && top.every((d) => d.id !== own.id && d.parent !== own.id) && shadows(text.slice(own.a, own.b), own.name, r.name)) continue;
        const here = top.filter((d) => d.file === file);
        const imported = top.filter((d) => near.has(d.file));
        if (here.length === 1) [pick, how] = [here[0], "extracted"];
        else if (!here.length && imported.length === 1) [pick, how] = [imported[0], "extracted"];
        else if (!imported.length && top.length === 1) pick = top[0];
        else if (here.length > 1 || imported.length > 1 || top.length > 1) ambiguous++;
      }
      if (!pick) continue;
      resolved++;
      add(from, pick.id, "calls", how, r.line);
    }
  }

  for (const [a, bs] of Object.entries(inv.imports)) {
    const lang = langOf(a);
    for (const b of bs) add(a, b, "imports", lang && PARSED_IMPORTS.has(lang) ? "extracted" : "inferred");
  }

  return {
    commit: inv.commit,
    files: parsedFiles,
    defs,
    edges: [...edges.values()],
    stats: { files: code.length, parsed, calls, resolved, ambiguous, ms: Date.now() - t0 },
  };
}
