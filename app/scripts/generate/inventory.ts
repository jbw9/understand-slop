/**
 * Stage 0 — what is in the repository, with no model involved.
 *
 * Everything the later stages are allowed to cite comes from here: the file
 * list, line counts, the manifest's dependencies, and (for TS/JS) which file
 * imports which. A model never sees a path this did not list.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import ts from "typescript";
import { MARK_IDS } from "@/components/shapes";

export interface RepoFile {
  path: string;
  lines: number;
  hash: string;
  /** Source a model should read and summarise, as opposed to config, docs or assets. */
  code: boolean;
  /** A test, fixture or story: listed and citable, never summarised or required in a root. */
  test: boolean;
  /** Outside a --scope: readable and citable, but no root owns it. */
  outside?: boolean;
}

/** What a model summarises and a root must own: source, not tests. */
export const isSource = (f: RepoFile) => f.code && !f.test;

export interface Inventory {
  repo: string;
  name: string;
  commit: string;
  /** Files that differ from the commit, new ones included: the map is read from disk, so it describes those edits, not the commit alone. */
  dirty: string[];
  files: RepoFile[];
  readme: string;
  /**
   * What the repository tells coding agents (AGENTS.md, CLAUDE.md, at any
   * depth): its conventions and rules, which say what its parts are meant to
   * be. Capped; empty when it has none.
   */
  instructions: string;
  /** Its other Markdown, with each file's first heading: the docs a section may cite for why (`Node.docs`). */
  docs: { path: string; lines: number; title: string }[];
  /** Dependency names from every manifest found, sorted. */
  deps: string[];
  /** Brand marks this repo has a real dependency for (D25). */
  marks: string[];
  /** What its screens run on, from its frameworks: a mobile app's, a browser's, or both (a mobile app beside a web one). */
  device: "phone" | "web" | "both";
  /** A map of part of a large repo: the paths it covers and what a reader of it does. */
  scope?: { paths: string[]; focus: string };
  /** TS/JS only: repo-relative imports per file. */
  imports: Record<string, string[]>;
}

const CODE = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro",
  ".py", ".go", ".rb", ".rs", ".java", ".kt", ".scala", ".swift", ".php", ".cs", ".ex", ".exs",
  ".sql", ".prisma", ".graphql", ".gql", ".proto",
]);
const SKIP = [
  /(^|\/)(node_modules|vendor|dist|build|out|coverage|\.next|\.turbo|\.git|__snapshots__|migrations\/meta)\//,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum|composer\.lock)$/,
  /\.(min\.js|map|png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|eot|mp4|mp3|wav|pdf|zip|gz|lock|snap)$/i,
  /\.d\.ts$/,
];
const TEST = /(^|\/)(tests?|__tests__|__mocks__|specs?|e2e|cypress|playwright|fixtures|stories)\/|\.(test|spec|stories|e2e)\.[a-z]+$|(^|\/)(test_[^/]+|[^/]+_test)\.(py|go)$|(^|\/)conftest\.py$/;
/** Bigger than this is generated, vendored, or a fixture — listed, never summarised. */
const MAX_BYTES = 150_000;
/** The files a repository writes for coding agents rather than for people. */
const AGENT_FILES = /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/i;
const INSTRUCTIONS_CHARS = 6000;

/** Which dependency names stand for which brand mark. */
const MARK_DEPS: Record<string, RegExp> = {
  aws: /^@aws-sdk\/|^aws-sdk$|^boto3$/,
  bedrock: /bedrock/,
  s3: /client-s3|s3-request-presigner/,
  supabase: /^@supabase\/|^supabase$/,
  openai: /^openai$/,
  postgres: /^pg$|^postgres$|^psycopg|^@neondatabase|^@vercel\/postgres|^asyncpg$/,
  nextjs: /^next$/,
  zod: /^zod$/,
  pdf: /pdf/,
  expo: /^expo$/,
  googlemaps: /google-maps|googlemaps|places-autocomplete/,
  flask: /^flask$/i,
  deno: /^deno$/,
};

function git(repo: string, ...args: string[]) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
}

// A mobile framework, by dependency or by the project files it leaves —
// not Tauri's generated mobile shell, which wraps the same web UI.
const PHONE_DEPS = /^(react-native|expo|@capacitor\/core|@ionic\/react|@ionic\/angular|nativescript)$/;
const PHONE_FILES = /(^|\/)(pubspec\.yaml|AndroidManifest\.xml|[^/]+\.xcodeproj\/project\.pbxproj)$/;
// A web front end of its own. Not react-dom: an Expo app's web build pulls it
// in; and not Flask or Django, which beside a mobile app are its API.
const WEB_DEPS = /^(next|vite|nuxt|@sveltejs\/kit|astro|@remix-run\/.+|@angular\/core|gatsby)$/;

function deviceOf(deps: string[], files: string[]): Inventory["device"] {
  const phone = deps.some((d) => PHONE_DEPS.test(d)) || files.some((f) => PHONE_FILES.test(f) && !f.includes("src-tauri/"));
  if (!phone) return "web";
  return deps.some((d) => WEB_DEPS.test(d)) ? "both" : "phone";
}

function manifests(repo: string, files: string[]): string[] {
  const deps = new Set<string>();
  for (const f of files) {
    if (f.endsWith("package.json")) {
      try {
        const p = JSON.parse(readFileSync(join(repo, f), "utf8"));
        for (const k of ["dependencies", "devDependencies", "peerDependencies"]) Object.keys(p[k] ?? {}).forEach((d) => deps.add(d));
      } catch { /* a broken manifest names nothing */ }
    } else if (/(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(f)) {
      const text = readFileSync(join(repo, f), "utf8");
      for (const m of text.matchAll(/^\s*"?([A-Za-z][\w.-]+)\s*(?:[<>=~!\[;"]|$)/gm)) deps.add(m[1].toLowerCase());
    }
  }
  return [...deps].sort();
}

/** `@/x` style aliases from the nearest tsconfig, as prefix → directory. */
function aliases(repo: string, files: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const f of files.filter((x) => /(^|\/)tsconfig[^/]*\.json$/.test(x))) {
    const cfg = ts.readConfigFile(join(repo, f), ts.sys.readFile).config;
    const base = join(dirname(f), cfg?.compilerOptions?.baseUrl ?? ".");
    for (const [k, v] of Object.entries<string[]>(cfg?.compilerOptions?.paths ?? {}))
      if (k.endsWith("/*") && v[0]?.endsWith("/*")) out.push([k.slice(0, -1), normalize(join(base, v[0].slice(0, -1))) + "/"]);
  }
  return out;
}

function resolveImport(from: string, spec: string, known: Set<string>, alias: [string, string][]): string | null {
  let base: string | null = null;
  if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else for (const [prefix, dir] of alias) if (spec.startsWith(prefix)) { base = normalize(dir + spec.slice(prefix.length)); break; }
  if (base === null) return null;
  base = base.replace(/^\.\//, "");
  const tries = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte"].flatMap((e) => [base + e, `${base}/index${e}`])];
  // `./x.js` in TS source names `./x.ts`.
  if (/\.(m?js|jsx)$/.test(base)) tries.push(base.replace(/\.(m?js|jsx)$/, ".ts"), base.replace(/\.(m?js|jsx)$/, ".tsx"));
  return tries.find((t) => known.has(t)) ?? null;
}

/**
 * The working tree as it is, files git does not know yet (not ignored)
 * included: a map is of the code on disk, committed or not.
 */
export function inventory(repo: string): Inventory {
  const untracked = git(repo, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  const listed = [...new Set([...git(repo, "ls-files").split("\n").filter(Boolean), ...untracked])].sort();
  const files: RepoFile[] = [];
  for (const path of listed) {
    if (SKIP.some((r) => r.test(path))) continue;
    const abs = join(repo, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue;
    const text = buf.toString("utf8");
    files.push({
      path,
      lines: text.split("\n").length,
      hash: createHash("sha1").update(buf).digest("hex").slice(0, 12),
      code: CODE.has(extname(path).toLowerCase()) && buf.length <= MAX_BYTES,
      test: TEST.test(path),
    });
  }

  const known = new Set(files.map((f) => f.path));
  const alias = aliases(repo, listed);
  const imports: Record<string, string[]> = {};
  for (const f of files) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(f.path) || !f.code) continue;
    const info = ts.preProcessFile(readFileSync(join(repo, f.path), "utf8"), true, true);
    const deps = info.importedFiles.map((i) => resolveImport(f.path, i.fileName, known, alias)).filter((x): x is string => x !== null);
    if (deps.length) imports[f.path] = [...new Set(deps)].sort();
  }

  const readmeFile = listed.find((f) => /^readme(\.md|\.rst|\.txt)?$/i.test(f));
  const markdown = files.filter((f) => !f.test && /\.mdx?$/i.test(f.path) && f.path !== readmeFile);
  const forAgents = markdown.filter((f) => AGENT_FILES.test(f.path));
  const instructions = forAgents
    .map((f) => `### ${f.path}\n${readFileSync(join(repo, f.path), "utf8").trim()}`)
    .join("\n\n")
    .slice(0, INSTRUCTIONS_CHARS);
  const docs = markdown
    .filter((f) => !AGENT_FILES.test(f.path))
    .map((f) => {
      const heading = readFileSync(join(repo, f.path), "utf8").match(/^#{1,3}\s+(.+)$/m);
      return { path: f.path, lines: f.lines, title: heading ? heading[1].trim() : "" };
    });
  const deps = manifests(repo, listed);
  return {
    repo,
    name: repo.replace(/\/+$/, "").split("/").pop()!,
    commit: git(repo, "rev-parse", "--short", "HEAD"),
    dirty: [...git(repo, "diff", "HEAD", "--name-only", "--relative").split("\n").filter(Boolean), ...untracked],
    files,
    readme: readmeFile ? readFileSync(join(repo, readmeFile), "utf8").slice(0, 8000) : "",
    instructions,
    docs,
    deps,
    marks: MARK_IDS.filter((m) => MARK_DEPS[m] && deps.some((d) => MARK_DEPS[m].test(d))),
    device: deviceOf(deps, listed),
    imports,
  };
}

/** A file's text with 1-indexed line numbers, the only form a model ever reads. */
export function numbered(repo: string, path: string, start = 1, end = Infinity): string {
  const lines = readFileSync(join(repo, path), "utf8").split("\n");
  const s = Math.max(1, start);
  const e = Math.min(lines.length, end);
  return lines.slice(s - 1, e).map((l, i) => `${String(s + i).padStart(5)}  ${l}`).join("\n");
}
