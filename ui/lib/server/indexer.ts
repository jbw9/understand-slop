import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { SymbolT } from "@/lib/schema";
import { readSignature } from "@/lib/signature";

/**
 * The machine half of a map: every function, class and method in a repo's
 * TS/JS files, quoted verbatim, read with the TypeScript compiler.
 *
 * Ids are `<file>#<name>`, a method `<file>#<Class>.<method>`. A name used
 * twice in one file is qualified by the functions around it
 * (`src/App.tsx#App.handleSave`), and one still ambiguous gets `@2`, `@3` in
 * file order. Ids never contain line numbers, so a story that points at
 * `src/lib/vault.ts#removeVault` still lands after the file shifts.
 *
 * What counts as a unit:
 *  - `function f() {}`, at any depth (a handler inside a component counts);
 *  - `const f = () => …`, `const f = function …`, and a const whose value is a
 *    call wrapping one with a block body (`useCallback((e) => { … })`,
 *    `memo(function …)`) — but not `xs.filter(v => …)` or `useMemo(…)`,
 *    which make values;
 *  - classes, by declaration or as such a const (`ViewPlugin.fromClass(class
 *    {…})`), with their methods, constructors, accessors and arrow-valued
 *    properties as `method`s whose `parent` is the class.
 * Object-literal methods are not units: they read as data more often than as
 * code someone would open.
 */

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".slop", "coverage"]);

/** The repo's TS/JS files, relative and with forward slashes. */
export function sourceFiles(dir: string): string[] {
  let all: string[];
  try {
    all = execFileSync("git", ["-C", dir, "ls-files", "-co", "--exclude-standard"], {
      encoding: "utf8",
      maxBuffer: 64 << 20,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    all = walk(dir, "");
  }
  return all.filter((f) => SOURCE.test(f) && !f.endsWith(".d.ts") && existsSync(path.join(dir, f))).sort();
}

function walk(root: string, rel: string): string[] {
  return readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(root, r);
    return e.isFile() ? [r] : [];
  });
}

/** Every file in the repo, for the header's count. */
export function fileCount(dir: string) {
  try {
    return execFileSync("git", ["-C", dir, "ls-files", "-co", "--exclude-standard"], { encoding: "utf8", maxBuffer: 64 << 20 })
      .split("\n")
      .filter(Boolean).length;
  } catch {
    return walk(dir, "").length;
  }
}

export function headCommit(dir: string) {
  try {
    const sha = execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }).trim();
    return dirty ? `${sha}+` : sha;
  } catch {
    return "no git";
  }
}

const langOf = (file: string): SymbolT["lang"] => (/x$/.test(file) ? "tsx" : "ts");

const scriptKind = (file: string) =>
  file.endsWith(".tsx") ? ts.ScriptKind.TSX
  : file.endsWith(".jsx") ? ts.ScriptKind.JSX
  : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS
  : ts.ScriptKind.TS;

/** A unit found in one file, before ids are settled. */
interface Found {
  /** The node whose text is the unit (a statement for a const). */
  node: ts.Node;
  /** Nodes a checker lookup can land on for this unit. */
  decls: ts.Node[];
  kind: SymbolT["kind"];
  /** `name`, or `Class.method` for a method. */
  short: string;
  /** `short` with every enclosing function in front: `App.handleSave`. */
  qualified: string;
  /** Index into the file's list of the class this is a method of. */
  parent: number | null;
}

/** Strip parentheses and type assertions: `(x as Foo)` reads as `x`. */
function bare(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) {
    e = e.expression;
  }
  return e;
}

const isFn = (e: ts.Expression) => ts.isArrowFunction(e) || ts.isFunctionExpression(e);

/** `xs.filter(v => …)` makes a value, not a unit: callbacks to these don't count. */
const VALUE_METHODS = new Set([
  "map", "filter", "find", "findIndex", "findLast", "some", "every", "reduce", "reduceRight",
  "flatMap", "forEach", "sort", "toSorted", "then", "catch", "finally",
]);
/** Hooks and timers whose callback computes a value or schedules work: `useMemo(() => …)` is a value. */
const VALUE_CALLS = new Set([
  "useMemo", "useState", "useRef", "useReducer", "useTransform", "useMotionValue",
  "setTimeout", "setInterval", "requestAnimationFrame", "queueMicrotask",
]);

/** What a const's value makes it, if anything: a function, a class, or a call wrapping one. */
function valueKind(init: ts.Expression | undefined): { kind: "function" | "class"; cls?: ts.ClassExpression } | null {
  if (!init) return null;
  const e = bare(init);
  if (isFn(e)) return { kind: "function" };
  if (ts.isClassExpression(e)) return { kind: "class", cls: e };
  if (ts.isCallExpression(e)) {
    const callee = bare(e.expression);
    if (ts.isPropertyAccessExpression(callee) && VALUE_METHODS.has(callee.name.text)) return null;
    const called = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : "";
    if (VALUE_CALLS.has(called)) return null;
    for (const a of e.arguments) {
      const b = bare(a);
      if (ts.isClassExpression(b)) return { kind: "class", cls: b };
      // `count((f) => f.short)` makes a value; `useCallback((e) => { … })`
      // wraps a function someone would open. A block body is the tell.
      if (isFn(b) && ts.isBlock((b as ts.ArrowFunction | ts.FunctionExpression).body)) return { kind: "function" };
    }
  }
  return null;
}

function collect(sf: ts.SourceFile): Found[] {
  const out: Found[] = [];
  const add = (f: Omit<Found, "qualified">, scope: string[]) => {
    out.push({ ...f, qualified: [...scope, f.short].join(".") });
    return out.length - 1;
  };

  const classMembers = (cls: ts.ClassLikeDeclaration, clsName: string, at: number, scope: string[]) => {
    for (const m of cls.members) {
      let name: string | null = null;
      if (ts.isConstructorDeclaration(m)) name = "constructor";
      else if (
        (ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m) ||
          (ts.isPropertyDeclaration(m) && m.initializer && isFn(bare(m.initializer)))) &&
        m.name && (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name) || ts.isStringLiteral(m.name))
      ) {
        name = m.name.text;
      }
      if (!name) continue;
      add({ node: m, decls: [m], kind: "method", short: `${clsName}.${name}`, parent: at }, scope);
      ts.forEachChild(m, (c) => visit(c, [...scope, clsName, name]));
    }
  };

  const visit = (n: ts.Node, scope: string[]): void => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      add({ node: n, decls: [n], kind: "function", short: n.name.text, parent: null }, scope);
      ts.forEachChild(n, (c) => visit(c, [...scope, n.name!.text]));
      return;
    }
    if (ts.isClassDeclaration(n) && n.name) {
      const at = add({ node: n, decls: [n], kind: "class", short: n.name.text, parent: null }, scope);
      classMembers(n, n.name.text, at, scope);
      return;
    }
    if (ts.isVariableStatement(n)) {
      const list = n.declarationList.declarations;
      for (const d of list) {
        const v = ts.isIdentifier(d.name) ? valueKind(d.initializer) : null;
        if (!v) {
          ts.forEachChild(d, (c) => visit(c, scope));
          continue;
        }
        const name = (d.name as ts.Identifier).text;
        // One declaration: quote the whole statement, `export const` and all.
        const node = list.length === 1 ? n : d;
        const at = add({ node, decls: [d, n], kind: v.kind, short: name, parent: null }, scope);
        if (v.cls) classMembers(v.cls, name, at, scope);
        else ts.forEachChild(d, (c) => visit(c, [...scope, name]));
      }
      return;
    }
    ts.forEachChild(n, (c) => visit(c, scope));
  };
  ts.forEachChild(sf, (c) => visit(c, []));
  return out;
}

/** Settle ids: the short name if it is unique in the file, else qualified, else numbered. */
function idsFor(file: string, found: Found[]): string[] {
  const count = (key: (f: Found) => string) => {
    const m = new Map<string, number>();
    for (const f of found) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
    return m;
  };
  const shorts = count((f) => f.short);
  const quals = count((f) => f.qualified);
  const seen = new Map<string, number>();
  return found.map((f) => {
    let name = shorts.get(f.short) === 1 ? f.short : f.qualified;
    if (shorts.get(f.short)! > 1 && quals.get(f.qualified)! > 1) {
      const k = (seen.get(f.qualified) ?? 0) + 1;
      seen.set(f.qualified, k);
      name = k === 1 ? f.qualified : `${f.qualified}@${k}`;
    }
    return `${file}#${name}`;
  });
}

function quote(sf: ts.SourceFile, text: string, node: ts.Node) {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const body = text.split(/\r?\n/).slice(start - 1, end).join("\n");
  return { start, end, body, signature: readSignature(body) };
}

interface FileUnits {
  ids: string[];
  found: Found[];
  symbols: [string, SymbolT][];
}

function unitsOf(file: string, sf: ts.SourceFile, text: string): FileUnits {
  const found = collect(sf);
  const ids = idsFor(file, found);
  const symbols = found.map((f, i): [string, SymbolT] => [
    ids[i],
    {
      kind: f.kind,
      lang: langOf(file),
      file,
      ...quote(sf, text, f.node),
      complete: true,
      calls: [],
      parent: f.parent === null ? null : ids[f.parent],
    },
  ]);
  return { ids, found, symbols };
}

/** One file's units, without calls — what a save re-reads to find its target. */
export function indexFile(dir: string, file: string): Record<string, SymbolT> {
  const text = readFileSync(path.join(dir, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  return Object.fromEntries(unitsOf(file, sf, text).symbols);
}

/** Compiler options from the repo's tsconfig, if it has one, so `@/` imports resolve. */
function optionsFor(dir: string): ts.CompilerOptions {
  const base: ts.CompilerOptions = { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true, skipLibCheck: true };
  const cfg = ts.findConfigFile(dir, ts.sys.fileExists, "tsconfig.json");
  if (!cfg || !path.resolve(cfg).startsWith(path.resolve(dir))) return base;
  const read = ts.readConfigFile(cfg, ts.sys.readFile);
  if (read.error) return base;
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(cfg));
  return { ...parsed.options, ...base };
}

/**
 * Index the whole repo: every unit, with `calls` — the other units each one
 * calls or renders (`<Sidebar />` counts), in order of first appearance,
 * resolved through the type checker so an import lands on the right file.
 */
export function indexRepo(dir: string): Record<string, SymbolT> {
  const files = sourceFiles(dir);
  const abs = files.map((f) => path.join(dir, f));
  const program = ts.createProgram(abs, optionsFor(dir));
  const checker = program.getTypeChecker();

  const symbols: Record<string, SymbolT> = {};
  const idOfDecl = new Map<ts.Node, string>();
  const units: { id: string; node: ts.Node; file: string }[] = [];
  /** Per file, short name → id, for when the checker can't resolve a call. */
  const byName = new Map<string, Map<string, string>>();

  files.forEach((file, i) => {
    const sf = program.getSourceFile(abs[i]);
    if (!sf) return;
    const { found, symbols: list } = unitsOf(file, sf, sf.getFullText());
    const names = new Map<string, string>();
    list.forEach(([id, s], k) => {
      symbols[id] = s;
      for (const d of found[k].decls) idOfDecl.set(d, id);
      units.push({ id, node: found[k].node, file });
      const short = found[k].short;
      if (!names.has(short)) names.set(short, id);
    });
    byName.set(file, names);
  });

  const resolve = (name: ts.Node, file: string): string | undefined => {
    let sym: ts.Symbol | undefined;
    try {
      sym = checker.getSymbolAtLocation(name);
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    } catch {
      sym = undefined;
    }
    for (const d of sym?.declarations ?? []) {
      const id = idOfDecl.get(d) ?? (ts.isVariableDeclaration(d) ? idOfDecl.get(d.parent.parent) : undefined);
      if (id) return id;
    }
    return ts.isIdentifier(name) ? byName.get(file)?.get(name.text) : undefined;
  };

  for (const u of units) {
    const calls: string[] = [];
    const seen = new Set<string>([u.id]);
    const note = (target: ts.Node) => {
      const id = resolve(target, u.file);
      if (id && !seen.has(id)) {
        seen.add(id);
        calls.push(id);
      }
    };
    const walkCalls = (n: ts.Node): void => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const callee = bare(n.expression);
        note(ts.isPropertyAccessExpression(callee) ? callee.name : callee);
      } else if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        note(n.tagName);
      }
      ts.forEachChild(n, walkCalls);
    };
    walkCalls(u.node);
    symbols[u.id].calls = calls;
  }
  return symbols;
}
