/**
 * Which file of the repository uses which, read from the code with no model.
 *
 * Each language's import statements are resolved to files the repository
 * holds: TS/JS through tsconfig paths, Python through its packages, Go
 * through go.mod, Rust through its module tree, Java/Kotlin/Scala, C#, PHP
 * and Elixir through the names files declare, Ruby through require and its
 * constants, C/C++ through #include, Dart through pubspec. Where a language
 * lets a file use another's names with no import at all (a Java package, a Go
 * package, a C# namespace, a Swift module), an edge is a declared type or
 * top-level name of the one file used as a word in the other.
 *
 * An import of anything outside the repository is not an edge: a package is
 * not a part of the map. Parsed imports are precise (D2 measured 98–100% for
 * TS/JS); the name edges are what `PRECISION` is sampled for.
 */
import { readFileSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";
import ts from "typescript";

export type Lang = "ts" | "python" | "jvm" | "go" | "rust" | "csharp" | "php" | "ruby" | "c" | "swift" | "dart" | "elixir";

const EXT: Record<string, Lang> = {
  ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts", ".vue": "ts", ".svelte": "ts", ".astro": "ts",
  ".py": "python",
  ".java": "jvm", ".kt": "jvm", ".scala": "jvm",
  ".go": "go",
  ".rs": "rust",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".c": "c", ".h": "c", ".cc": "c", ".cpp": "c", ".cxx": "c", ".hpp": "c", ".hh": "c", ".m": "c", ".mm": "c",
  ".swift": "swift",
  ".dart": "dart",
  ".ex": "elixir", ".exs": "elixir",
};
export const langOf = (path: string): Lang | null => EXT[extname(path).toLowerCase()] ?? null;

type Edges = Map<string, Set<string>>;
const dir = (p: string) => posix.dirname(p) === "." ? "" : posix.dirname(p);
const join2 = (a: string, b: string) => posix.normalize(a ? `${a}/${b}` : b).replace(/^\.\//, "");
const words = (s: string) => new Set(s.match(/[A-Za-z_]\w*/g) ?? []);

/** Comments blanked out, newlines kept, so a commented-out import or a name in a doc comment is not an edge. */
function uncommented(text: string, lang: Lang): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  if (lang === "python" || lang === "ruby" || lang === "elixir") return text.replace(/#[^\n]*/g, blank);
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
  if (lang === "php") out = out.replace(/(^|\s)#[^\n[]*/g, blank);
  return out;
}

/* ── TS / JS ─────────────────────────────────────────────── */

/** `@/x` style aliases from every tsconfig, as prefix → directory. */
function aliases(repo: string, listed: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const f of listed.filter((x) => /(^|\/)tsconfig[^/]*\.json$/.test(x))) {
    const cfg = ts.readConfigFile(join(repo, f), ts.sys.readFile).config;
    const base = posix.join(posix.dirname(f), cfg?.compilerOptions?.baseUrl ?? ".");
    for (const [k, v] of Object.entries<string[]>(cfg?.compilerOptions?.paths ?? {}))
      if (k.endsWith("/*") && v[0]?.endsWith("/*")) out.push([k.slice(0, -1), posix.normalize(posix.join(base, v[0].slice(0, -1))) + "/"]);
  }
  return out;
}

function resolveTs(from: string, spec: string, known: Set<string>, alias: [string, string][]): string | null {
  let base: string | null = null;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else for (const [prefix, d] of alias) if (spec.startsWith(prefix)) { base = posix.normalize(d + spec.slice(prefix.length)); break; }
  if (base === null) return null;
  base = base.replace(/^\.\//, "");
  const tries = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte"].flatMap((e) => [base + e, `${base}/index${e}`])];
  // `./x.js` in TS source names `./x.ts`.
  if (/\.(m?js|jsx)$/.test(base)) tries.push(base.replace(/\.(m?js|jsx)$/, ".ts"), base.replace(/\.(m?js|jsx)$/, ".tsx"));
  return tries.find((t) => known.has(t)) ?? null;
}

function tsGraph(files: string[], text: (p: string) => string, known: Set<string>, alias: [string, string][], add: (a: string, b: string) => void) {
  for (const f of files) {
    let src = text(f);
    // A single-file component's imports are in its <script> blocks; an Astro page's in its front matter.
    if (/\.(vue|svelte)$/.test(f)) src = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    else if (f.endsWith(".astro")) src = /^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? "";
    for (const i of ts.preProcessFile(src, true, true).importedFiles) {
      const to = resolveTs(f, i.fileName, known, alias);
      if (to) add(f, to);
    }
  }
}

/* ── Python ──────────────────────────────────────────────── */

function pythonGraph(files: string[], text: (p: string) => string, known: Set<string>, add: (a: string, b: string) => void) {
  // A module's dotted name from the top of its package (the first directory up without an __init__.py), and from the repository's top.
  const byName = new Map<string, string>();
  for (const f of files) {
    const parts = f.replace(/\.py$/, "").split("/");
    if (parts[parts.length - 1] === "__init__") parts.pop();
    let i = parts.length - 1;
    while (i > 0 && known.has(`${parts.slice(0, i).join("/")}/__init__.py`)) i--;
    const fromPackage = parts.slice(i).join(".");
    if (fromPackage && !byName.has(fromPackage)) byName.set(fromPackage, f);
    const fromTop = parts.join(".");
    if (fromTop && !byName.has(fromTop)) byName.set(fromTop, f);
    if (parts[0] === "src" && parts.length > 1 && !byName.has(parts.slice(1).join("."))) byName.set(parts.slice(1).join("."), f);
  }
  const absolute = (name: string) => {
    for (let ps = name.split("."); ps.length; ps.pop()) {
      const hit = byName.get(ps.join("."));
      if (hit) return hit;
    }
    return null;
  };
  const relative = (f: string, dots: number, mod: string) => {
    let base = dir(f);
    for (let i = 1; i < dots; i++) base = dir(base);
    const path = join2(base, mod.replace(/\./g, "/"));
    return [`${path}.py`, `${path}/__init__.py`].find((p) => known.has(p)) ?? null;
  };
  for (const f of files) {
    const src = uncommented(text(f), "python");
    for (const m of src.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)$/gm))
      for (const one of m[1].split(",")) {
        const to = absolute(one.trim().split(/\s+/)[0]);
        if (to) add(f, to);
      }
    for (const m of src.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm)) {
      const dots = m[1].length;
      const names = m[3].replace(/[()\\]/g, " ").split(",").map((x) => x.trim().split(/\s+/)[0]).filter((x) => x && x !== "*");
      const base = dots ? (m[2] ? relative(f, dots, m[2]) : null) : absolute(m[2]);
      let any = false;
      // `from pkg import sub` names a module when there is one by that name.
      for (const n of names) {
        const sub = dots ? relative(f, dots, m[2] ? `${m[2]}.${n}` : n) : byName.get(`${m[2]}.${n}`) ?? null;
        if (sub) { add(f, sub); any = true; }
      }
      if (!any) {
        const to = base ?? (dots ? relative(f, dots, "__init__") : null);
        if (to) add(f, to);
      }
    }
  }
}

/* ── names a file declares, for the languages that resolve by name ───────── */

interface Decl { file: string; scope: string; names: string[] }

/**
 * The types a file declares at its top level: those indented least. A nested
 * type is reached through the one around it, and counting it is wrong: every
 * Kafka request class nests a `Builder`, which made each one "use" the rest.
 */
function topTypes(src: string, keywords: string): string[] {
  const found = [...src.matchAll(new RegExp(`^([ \\t]*)(?:[a-z@]+[ \\t]+)*(?:${keywords})[ \\t]+([A-Z]\\w*)`, "gm"))].map((m) => ({ indent: m[1].replace(/\t/g, "    ").length, name: m[2] }));
  const top = Math.min(...found.map((x) => x.indent));
  return found.filter((x) => x.indent === top).map((x) => x.name);
}

/** Each file's package / namespace / module and the names it declares there. */
function declared(files: string[], text: (p: string) => string, lang: Lang): Decl[] {
  return files.map((f) => {
    const src = uncommented(text(f), lang);
    let scope = "";
    const names = new Set<string>();
    if (lang === "jvm") {
      scope = [...src.matchAll(/^[ \t]*package[ \t]+([\w.]+)/gm)].map((m) => m[1]).join(".");
      topTypes(src, "class|interface|enum|record|object|trait|@interface").forEach((n) => names.add(n));
      if (f.endsWith(".kt")) for (const m of src.matchAll(/^(?:fun|val|var)[ \t]+(?:<[^>]+>[ \t]*)?([a-zA-Z]\w*)/gm)) names.add(m[1]);
      if (/^[A-Z]/.test(basename(f))) names.add(basename(f, extname(f)));
    } else if (lang === "csharp") {
      scope = /^[ \t]*namespace[ \t]+([\w.]+)/m.exec(src)?.[1] ?? "";
      topTypes(src, "class|interface|struct|enum|record").forEach((n) => names.add(n));
    } else if (lang === "php") {
      scope = /^[ \t]*namespace[ \t]+([\w\\]+)/m.exec(src)?.[1] ?? "";
      topTypes(src, "class|interface|trait|enum").forEach((n) => names.add(n));
    } else if (lang === "swift") {
      const target = /(?:^|\/)Sources\/([^/]+)\//.exec(f)?.[1];
      scope = target ?? "";
      topTypes(src, "class|struct|enum|protocol|actor|typealias").forEach((n) => names.add(n));
      for (const m of src.matchAll(/^(?:public |internal |private |fileprivate )?func[ \t]+([a-zA-Z]\w*)/gm)) names.add(m[1]);
    } else if (lang === "go") {
      scope = dir(f);
      for (const m of src.matchAll(/^func[ \t]+([A-Za-z]\w*)/gm)) names.add(m[1]);
      for (const m of src.matchAll(/^(?:type|var|const)[ \t]+([A-Za-z]\w*)/gm)) names.add(m[1]);
      for (const b of src.matchAll(/^(?:type|var|const)[ \t]*\(\n([\s\S]*?)^\)/gm))
        for (const m of b[1].matchAll(/^[ \t]+([A-Za-z]\w*)/gm)) names.add(m[1]);
      names.delete("init");
      names.delete("main");
    }
    return { file: f, scope, names: [...names].filter((n) => n.length >= 3) };
  });
}

/** Edges from each file to those in `scopes` whose declared names it uses as words. */
function byMention(f: string, used: Set<string>, decls: Decl[], add: (a: string, b: string) => void) {
  for (const d of decls) if (d.file !== f && d.names.some((n) => used.has(n))) add(f, d.file);
}

function groupBy(decls: Decl[]) {
  const m = new Map<string, Decl[]>();
  for (const d of decls) m.set(d.scope, [...(m.get(d.scope) ?? []), d]);
  return m;
}

/* ── Java / Kotlin / Scala ───────────────────────────────── */

function jvmGraph(files: string[], text: (p: string) => string, add: (a: string, b: string) => void) {
  const decls = declared(files, text, "jvm");
  const inScope = groupBy(decls);
  const fqn = new Map<string, string>();
  for (const d of decls) for (const n of d.names) if (!fqn.has(`${d.scope}.${n}`)) fqn.set(`${d.scope}.${n}`, d.file);
  for (const d of decls) {
    const src = uncommented(text(d.file), "jvm");
    const body = src.replace(/^[ \t]*(?:package|import)[^\n]*/gm, "");
    const used = words(body);
    for (const m of src.matchAll(/^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+?)(\.\*|\._|\.\{([^}]*)\})?(?:[ \t]+as[ \t]+\w+)?[ \t;]*$/gm)) {
      const [, path, wild, braces] = m;
      if (braces !== undefined) {
        for (const one of braces.split(",")) { const to = fqn.get(`${path}.${one.trim().split(/\s/)[0]}`); if (to) add(d.file, to); }
        continue;
      }
      if (wild) { byMention(d.file, used, inScope.get(path) ?? [], add); continue; }
      // `a.b.C`, a nested `a.b.C.Inner`, or a static member `a.b.C.m`: the longest prefix that names a type.
      for (let ps = path.split("."); ps.length > 1; ps.pop()) {
        const to = fqn.get(ps.join("."));
        if (to) { add(d.file, to); break; }
      }
    }
    // A package's own types need no import.
    byMention(d.file, used, inScope.get(d.scope) ?? [], add);
  }
}

/* ── C# ──────────────────────────────────────────────────── */

function csharpGraph(files: string[], text: (p: string) => string, add: (a: string, b: string) => void) {
  const decls = declared(files, text, "csharp");
  const inScope = groupBy(decls);
  const global = new Set<string>();
  const usings = new Map<string, string[]>();
  for (const d of decls) {
    const src = uncommented(text(d.file), "csharp");
    const own: string[] = [];
    for (const m of src.matchAll(/^[ \t]*(global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:\w+[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm)) { if (m[1]) global.add(m[2]); else own.push(m[2]); }
    usings.set(d.file, own);
  }
  for (const d of decls) {
    const used = words(uncommented(text(d.file), "csharp"));
    // Its own namespace and every one enclosing it are in scope, beside what it uses.
    const parents = d.scope.split(".").map((_, i, a) => a.slice(0, i + 1).join("."));
    const spaces = new Set([...parents, ...global, ...(usings.get(d.file) ?? [])]);
    for (const s of spaces) {
      byMention(d.file, used, inScope.get(s) ?? [], add);
      // `using static N.T` and `using X = N.T` name a type, not a namespace.
      const i = s.lastIndexOf(".");
      const t = i > 0 ? (inScope.get(s.slice(0, i)) ?? []).find((x) => x.names.includes(s.slice(i + 1))) : undefined;
      if (t && t.file !== d.file) add(d.file, t.file);
    }
  }
}

/* ── PHP ─────────────────────────────────────────────────── */

function phpGraph(files: string[], text: (p: string) => string, known: Set<string>, add: (a: string, b: string) => void) {
  const decls = declared(files, text, "php");
  const inScope = groupBy(decls);
  const fqn = new Map<string, string>();
  for (const d of decls) for (const n of d.names) fqn.set(`${d.scope}\\${n}`.replace(/^\\/, ""), d.file);
  for (const d of decls) {
    const src = uncommented(text(d.file), "php");
    for (const m of src.matchAll(/^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?([\w\\]+?)(?:\\\{([^}]*)\})?(?:[ \t]+as[ \t]+\w+)?[ \t]*;/gm)) {
      const names = m[2] !== undefined ? m[2].split(",").map((x) => `${m[1]}\\${x.trim().split(/\s/)[0]}`) : [m[1]];
      for (const n of names) { const to = fqn.get(n.replace(/^\\/, "")); if (to) add(d.file, to); }
    }
    for (const m of src.matchAll(/\b(?:require|include)(?:_once)?[ \t]*\(?[ \t]*(?:__DIR__[ \t]*\.[ \t]*)?['"]([^'"]+\.php)['"]/g)) {
      const to = [join2(dir(d.file), m[1].replace(/^\//, "")), m[1].replace(/^\//, "")].find((p) => known.has(p));
      if (to) add(d.file, to);
    }
    byMention(d.file, words(src.replace(/^[ \t]*(?:namespace|use)[^\n]*/gm, "")), inScope.get(d.scope) ?? [], add);
  }
}

/* ── Go ──────────────────────────────────────────────────── */

function goGraph(files: string[], text: (p: string) => string, listed: string[], repo: string, add: (a: string, b: string) => void) {
  const mods = listed
    .filter((f) => /(^|\/)go\.mod$/.test(f))
    .map((f) => ({ dir: dir(f), path: /^module[ \t]+(\S+)/m.exec(readFileSync(join(repo, f), "utf8"))?.[1] ?? "" }))
    .filter((m) => m.path)
    .sort((a, b) => b.path.length - a.path.length);
  const decls = declared(files, text, "go");
  const inDir = groupBy(decls);
  const pkgName = new Map<string, string>();
  for (const d of decls) if (!pkgName.has(d.scope) && !d.file.endsWith("_test.go")) pkgName.set(d.scope, /^package[ \t]+(\w+)/m.exec(text(d.file))?.[1] ?? basename(d.scope));
  for (const d of decls) {
    const src = uncommented(text(d.file), "go");
    const specs: { alias?: string; path: string }[] = [];
    for (const m of src.matchAll(/^import[ \t]+(?:([\w.]+)[ \t]+)?"([^"]+)"/gm)) specs.push({ alias: m[1], path: m[2] });
    for (const b of src.matchAll(/^import[ \t]*\(([\s\S]*?)\)/gm))
      for (const m of b[1].matchAll(/^[ \t]*(?:([\w.]+)[ \t]+)?"([^"]+)"/gm)) specs.push({ alias: m[1], path: m[2] });
    for (const s of specs) {
      const mod = mods.find((m) => s.path === m.path || s.path.startsWith(`${m.path}/`));
      if (!mod) continue;
      const target = join2(mod.dir, s.path.slice(mod.path.length + 1));
      const there = inDir.get(target) ?? [];
      if (!there.length) continue;
      const alias = s.alias ?? pkgName.get(target) ?? basename(target);
      if (alias === "_") { there.filter((x) => !x.file.endsWith("_test.go")).forEach((x) => add(d.file, x.file)); continue; }
      if (alias === ".") { byMention(d.file, words(src), there, add); continue; }
      const used = new Set([...src.matchAll(new RegExp(`\\b${alias.replace(/\./g, "\\.")}\\.([A-Z]\\w*)`, "g"))].map((m) => m[1]));
      byMention(d.file, used, there, add);
    }
    // A package's files use each other's names with no import.
    byMention(d.file, words(src.replace(/^import[ \t]*\([\s\S]*?^\)/gm, "").replace(/^import[^\n]*/gm, "")), inDir.get(d.scope) ?? [], add);
  }
}

/* ── Rust ────────────────────────────────────────────────── */

function rustGraph(files: string[], text: (p: string) => string, known: Set<string>, listed: string[], repo: string, add: (a: string, b: string) => void) {
  // Each crate's root files, then the module tree its `mod x;` lines grow.
  const crates = new Map<string, string>(); // crate name → root file
  const moduleOf = new Map<string, { crate: string; path: string[] }>();
  const fileOf = new Map<string, string>(); // "crate::a::b" → file
  const roots: { file: string; crate: string }[] = [];
  for (const toml of listed.filter((f) => /(^|\/)Cargo\.toml$/.test(f))) {
    const body = readFileSync(join(repo, toml), "utf8");
    const base = dir(toml);
    const name = (/^\[package\][\s\S]*?^name[ \t]*=[ \t]*"([^"]+)"/m.exec(body)?.[1] ?? basename(base)).replace(/-/g, "_");
    // Each root is a crate of its own: `crate::` in main.rs is main's tree, and main reaches the library by its name.
    const bins = files.filter((f) => f.startsWith(join2(base, "src/bin/")) && f.split("/").length === join2(base, "src/bin/x").split("/").length);
    for (const [r, crate] of [[join2(base, "src/lib.rs"), name], [join2(base, "src/main.rs"), `${name}#main`], ...bins.map((b) => [b, `${name}#${b}`]), [join2(base, "build.rs"), `${name}#build`]])
      if (known.has(r)) roots.push({ file: r, crate });
    if (known.has(join2(base, "src/lib.rs"))) crates.set(name, join2(base, "src/lib.rs"));
  }
  const queue = roots.map((r) => ({ ...r, path: [] as string[] }));
  while (queue.length) {
    const { file, crate, path } = queue.shift()!;
    if (moduleOf.has(file)) continue;
    moduleOf.set(file, { crate, path });
    fileOf.set([crate, ...path].join("::"), file);
    const stem = basename(file, ".rs");
    const childDir = ["lib", "main", "mod"].includes(stem) || roots.some((r) => r.file === file) ? dir(file) : join2(dir(file), stem);
    const src = uncommented(text(file), "rust");
    for (const m of src.matchAll(/(?:#\[path[ \t]*=[ \t]*"([^"]+)"\][\s]*)?^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*;/gm)) {
      const to = m[1] ? join2(dir(file), m[1]) : [join2(childDir, `${m[2]}.rs`), join2(childDir, `${m[2]}/mod.rs`)].find((p) => known.has(p));
      if (to && known.has(to)) queue.push({ file: to, crate, path: [...path, m[2]] });
    }
  }
  /** The file of the longest module prefix of `segs`, from module `at` of `crate`. */
  const resolve = (crate: string, at: string[], segs: string[]): string | null => {
    let base: string[];
    let c = crate;
    let rest = segs;
    // Unanchored, a path may name a child module (2018 paths) or an outside crate; only a module found counts.
    let anchored = true;
    if (segs[0] === "crate") { base = []; rest = segs.slice(1); }
    else if (segs[0] === "self") { base = at; rest = segs.slice(1); }
    else if (segs[0] === "super") { base = at; while (rest[0] === "super") { base = base.slice(0, -1); rest = rest.slice(1); } }
    else if (crates.has(segs[0]) && segs[0] !== crate) { c = segs[0]; base = []; rest = segs.slice(1); }
    else { base = at; anchored = false; }
    for (let n = rest.length; n >= (anchored ? 0 : 1); n--) {
      const hit = fileOf.get([c, ...base, ...rest.slice(0, n)].join("::"));
      if (hit) return hit;
    }
    return null;
  };
  /** `a::b::{c, d::{e, f as g}, h::*}` flattened into paths. */
  const flatten = (tree: string): string[][] => {
    const out: string[][] = [];
    const walk = (s: string, prefix: string[]) => {
      s = s.trim();
      const brace = s.indexOf("{");
      if (brace === -1) { const p = s.split(/\s+as\s+/)[0].split("::").map((x) => x.trim()).filter((x) => x && x !== "*"); if (p.length || prefix.length) out.push([...prefix, ...p]); return; }
      const head = s.slice(0, brace).split("::").map((x) => x.trim()).filter(Boolean);
      const inner = s.slice(brace + 1, s.lastIndexOf("}"));
      let depth = 0, start = 0;
      for (let i = 0; i <= inner.length; i++) {
        const ch = inner[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if ((ch === "," && depth === 0) || i === inner.length) { const part = inner.slice(start, i); if (part.trim()) walk(part, [...prefix, ...head]); start = i + 1; }
      }
    };
    walk(tree, []);
    return out;
  };
  for (const f of files) {
    const mod = moduleOf.get(f);
    if (!mod) continue;
    const src = uncommented(text(f), "rust");
    for (const m of src.matchAll(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?use[ \t]+([^;]+);/gm))
      for (const segs of flatten(m[1])) { const to = resolve(mod.crate, mod.path, segs); if (to && to !== f) add(f, to); }
    for (const m of src.matchAll(/\b(crate|super|self)((?:::\w+)+)/g)) {
      const to = resolve(mod.crate, mod.path, [m[1], ...m[2].split("::").filter(Boolean)]);
      if (to && to !== f) add(f, to);
    }
  }
}

/* ── Ruby ────────────────────────────────────────────────── */

function rubyGraph(files: string[], text: (p: string) => string, known: Set<string>, add: (a: string, b: string) => void) {
  const camel = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  // Rails autoloading (Zeitwerk): app/<kind>/a/b_c.rb is A::BC; lib/a/b.rb is A::B.
  const constant = new Map<string, string>();
  /** The full names of the classes and modules a file opens, nested by indentation: `module A` around `class B` is A::B. */
  const opened = (src: string) => {
    const stack: { indent: number; name: string }[] = [];
    const out: string[] = [];
    for (const m of src.matchAll(/^([ \t]*)(?:class|module)[ \t]+([A-Z][\w:]*)/gm)) {
      const indent = m[1].length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      stack.push({ indent, name: m[2] });
      out.push(stack.map((s) => s.name).join("::"));
    }
    return out;
  };
  const scopes = new Map<string, string[]>();
  for (const f of files) {
    const m = /^(?:.*\/)?(?:app\/[^/]+|lib)\/(.+)\.rb$/.exec(f);
    if (m) constant.set(m[1].split("/").map(camel).join("::"), f);
    const names = opened(uncommented(text(f), "ruby"));
    for (const n of names) if (!constant.has(n)) constant.set(n, f);
    // Where its constants are looked up: inside each name it opens and that name's parents, innermost first, then the top.
    scopes.set(f, [...new Set(names.flatMap((n) => n.split("::").map((_, i, a) => a.slice(0, a.length - i).join("::"))))].sort((a, b) => b.length - a.length));
  }
  for (const f of files) {
    const src = uncommented(text(f), "ruby");
    for (const m of src.matchAll(/\brequire_relative[ \t(]+['"]([^'"]+)['"]/g)) {
      const p = join2(dir(f), m[1].endsWith(".rb") ? m[1] : `${m[1]}.rb`);
      if (known.has(p)) add(f, p);
    }
    // `require "a/b"` loads a/b.rb from a load path: some gem's lib/, the nearest one first.
    for (const m of src.matchAll(/\brequire[ \t(]+['"]([^'"]+)['"]/g)) {
      const tail = `${m[1].replace(/\.rb$/, "")}.rb`;
      const shared = (p: string) => { let i = 0; while (i < p.length && p[i] === f[i]) i++; return i; };
      const p = [...known].filter((x) => x === tail || x === `lib/${tail}` || x.endsWith(`/lib/${tail}`)).sort((a, b) => shared(b) - shared(a))[0];
      if (p) add(f, p);
    }
    // The name a `class`/`module` line opens is not a use of it; what it inherits from is.
    for (const m of src.replace(/^([ \t]*(?:class|module)[ \t]+)[A-Z][\w:]*/gm, "$1").matchAll(/(::)?\b([A-Z]\w*(?:::[A-Z]\w*)*)/g)) {
      const tries = m[1] ? [m[2]] : [...(scopes.get(f) ?? []).map((s) => `${s}::${m[2]}`), m[2]];
      const to = tries.map((t) => constant.get(t)).find(Boolean);
      if (to && to !== f) add(f, to);
    }
  }
}

/* ── C / C++ / Objective-C ───────────────────────────────── */

function cGraph(files: string[], text: (p: string) => string, known: Set<string>, add: (a: string, b: string) => void) {
  const all = [...known];
  const impl = new Map<string, string>();
  for (const f of files) if (/\.(c|cc|cpp|cxx|m|mm)$/.test(f)) impl.set(f.replace(/\.[^.]+$/, ""), f);
  for (const f of files) {
    for (const m of uncommented(text(f), "c").matchAll(/^[ \t]*#[ \t]*(?:include|import)[ \t]*(["<])([^">]+)[">]/gm)) {
      const spec = m[2];
      const near = join2(dir(f), spec);
      const tail = all.filter((p) => p === spec || p.endsWith(`/${spec}`));
      const to = known.has(near) ? near : known.has(spec) ? spec : tail.length === 1 || (m[1] === '"' && tail.length) ? tail.sort((a, b) => a.length - b.length)[0] : null;
      if (!to || to === f) continue;
      add(f, to);
      // What uses a header uses the file that implements it.
      const body = /\.(h|hh|hpp)$/.test(to) ? impl.get(to.replace(/\.[^.]+$/, "")) : undefined;
      if (body && body !== f) add(f, body);
    }
  }
}

/* ── Swift ───────────────────────────────────────────────── */

function swiftGraph(files: string[], text: (p: string) => string, add: (a: string, b: string) => void) {
  const decls = declared(files, text, "swift");
  const inModule = groupBy(decls);
  for (const d of decls) {
    const src = uncommented(text(d.file), "swift");
    const used = words(src);
    const imported = [...src.matchAll(/^[ \t]*(?:@testable[ \t]+)?import[ \t]+(\w+)/gm)].map((m) => m[1]).filter((m) => inModule.has(m));
    for (const s of new Set([d.scope, ...imported])) byMention(d.file, used, inModule.get(s) ?? [], add);
  }
}

/* ── Dart ────────────────────────────────────────────────── */

function dartGraph(files: string[], text: (p: string) => string, known: Set<string>, listed: string[], repo: string, add: (a: string, b: string) => void) {
  const pubs = listed
    .filter((f) => /(^|\/)pubspec\.yaml$/.test(f))
    .map((f) => ({ dir: dir(f), name: /^name:[ \t]*(\S+)/m.exec(readFileSync(join(repo, f), "utf8"))?.[1] ?? "" }));
  for (const f of files)
    for (const m of uncommented(text(f), "dart").matchAll(/^[ \t]*(?:import|export|part)[ \t]+['"]([^'"]+)['"]/gm)) {
      const pkg = /^package:([^/]+)\/(.+)$/.exec(m[1]);
      const p = pkg ? pubs.filter((x) => x.name === pkg[1]).map((x) => join2(x.dir, `lib/${pkg[2]}`))[0] : m[1].includes(":") ? undefined : join2(dir(f), m[1]);
      if (p && known.has(p)) add(f, p);
    }
}

/* ── Elixir ──────────────────────────────────────────────── */

function elixirGraph(files: string[], text: (p: string) => string, add: (a: string, b: string) => void) {
  const modules = new Map<string, string>();
  for (const f of files) for (const m of uncommented(text(f), "elixir").matchAll(/\bdefmodule[ \t]+([A-Z][\w.]*)/g)) if (!modules.has(m[1])) modules.set(m[1], f);
  for (const f of files) {
    const src = uncommented(text(f), "elixir");
    const alias = new Map<string, string>();
    for (const m of src.matchAll(/\balias[ \t]+([A-Z][\w.]*)(?:[ \t]*,[ \t]*as:[ \t]*([A-Z]\w*))?/g)) alias.set(m[2] ?? m[1].split(".").pop()!, m[1]);
    for (const m of src.matchAll(/\b([A-Z]\w*(?:\.[A-Z]\w*)*)/g)) {
      const [head, ...rest] = m[1].split(".");
      const full = alias.has(head) ? [alias.get(head)!, ...rest].join(".") : m[1];
      const to = modules.get(full);
      if (to && to !== f) add(f, to);
    }
  }
}

/* ── all of them ─────────────────────────────────────────── */

/**
 * Repo-relative edges from each code file to the code files it uses, every
 * language at once. `listed` is every file git lists (manifests included);
 * `code` the files to read.
 */
export function importGraph(repo: string, code: string[], listed: string[]): Record<string, string[]> {
  const known = new Set(listed);
  const cache = new Map<string, string>();
  const text = (p: string) => {
    let t = cache.get(p);
    if (t === undefined) {
      try { t = readFileSync(join(repo, p), "utf8"); } catch { t = ""; }
      cache.set(p, t);
    }
    return t;
  };
  const edges: Edges = new Map();
  const add = (a: string, b: string) => { if (a !== b) (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b); };
  const of = (l: Lang) => code.filter((f) => langOf(f) === l);
  const run = (l: Lang, fn: (files: string[]) => void) => { const files = of(l); if (files.length) fn(files); };

  run("ts", (fs) => tsGraph(fs, text, known, aliases(repo, listed), add));
  run("python", (fs) => pythonGraph(fs, text, known, add));
  run("jvm", (fs) => jvmGraph(fs, text, add));
  run("csharp", (fs) => csharpGraph(fs, text, add));
  run("php", (fs) => phpGraph(fs, text, known, add));
  run("go", (fs) => goGraph(fs, text, listed, repo, add));
  run("rust", (fs) => rustGraph(fs, text, known, listed, repo, add));
  run("ruby", (fs) => rubyGraph(fs, text, known, add));
  run("c", (fs) => cGraph(fs, text, known, add));
  run("swift", (fs) => swiftGraph(fs, text, add));
  run("dart", (fs) => dartGraph(fs, text, known, listed, repo, add));
  run("elixir", (fs) => elixirGraph(fs, text, add));

  const codeSet = new Set(code);
  return Object.fromEntries(
    [...edges].filter(([a]) => codeSet.has(a)).map(([a, bs]) => [a, [...bs].filter((b) => codeSet.has(b)).sort()] as const).filter(([, bs]) => bs.length).sort(([a], [b]) => a.localeCompare(b)),
  );
}
