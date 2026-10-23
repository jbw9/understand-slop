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

export interface Inventory {
  repo: string;
  name: string;
  commit: string;
  files: RepoFile[];
  readme: string;
  /** Dependency names from every manifest found, sorted. */
  deps: string[];
  /** Brand marks this repo has a real dependency for (D25). */
  marks: string[];
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

export function inventory(repo: string): Inventory {
  const listed = git(repo, "ls-files").split("\n").filter(Boolean).sort();
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
  const deps = manifests(repo, listed);
  return {
    repo,
    name: repo.replace(/\/+$/, "").split("/").pop()!,
    commit: git(repo, "rev-parse", "--short", "HEAD"),
    files,
    readme: readmeFile ? readFileSync(join(repo, readmeFile), "utf8").slice(0, 8000) : "",
    deps,
    marks: MARK_IDS.filter((m) => MARK_DEPS[m] && deps.some((d) => MARK_DEPS[m].test(d))),
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
