/**
 * Server-side: the Markdown (and HTML pages) a project keeps beside its code —
 * its README, design notes, decision logs, agent instructions — for the docs reader
 * (components/docs.tsx). Paths come from git, never from the caller, so this
 * lists only what the checkout tracks or would track; the text itself is read
 * through `/api/source`, behind the same containment check as the code.
 */

import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export interface Doc {
  /** Repo-relative. */
  path: string;
  /** Its first heading, or "" when it has none. */
  title: string;
}

const MAX_DOCS = 500;
const SKIP = /(^|\/)(node_modules|vendor|dist|build|out|\.next)\//;
/** An HTML file is a doc only outside tests, fixtures and generated reports, where most HTML in a repository is. */
const NOT_DOC_HTML = /(^|\/)(tests?|__tests__|spec|fixtures?|e2e|coverage|public|static|templates?)\//i;

/** The first heading in the first few KB: enough for a title, cheap on a long log. */
function titleOf(file: string): string {
  try {
    const fd = openSync(file, "r");
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const head = buf.subarray(0, n).toString("utf8");
    return (
      head.match(/^#{1,3}\s+(.+)$/m)?.[1].trim() ??
      head.match(/<title[^>]*>([^<]+)<\/title>|<h1[^>]*>([^<]+)<\/h1>/i)?.slice(1).find(Boolean)?.trim() ??
      ""
    );
  } catch {
    return "";
  }
}

/** Root-level docs first, README leading, then the rest by path. */
const order = (a: string, b: string) => {
  const depth = (p: string) => p.split("/").length;
  const readme = (p: string) => (/(^|\/)readme\.mdx?$/i.test(p) ? 0 : 1);
  return depth(a) - depth(b) || readme(a) - readme(b) || a.localeCompare(b);
};

export function listDocs(root: string): Doc[] {
  let listed: string[];
  try {
    listed = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md", "*.mdx", "*.MD", "*.html", "*.htm"], {
      encoding: "utf8",
      maxBuffer: 16 << 20,
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0");
  } catch {
    return [];
  }
  return [...new Set(listed.filter((p) => p && !SKIP.test(p) && !(/\.html?$/i.test(p) && NOT_DOC_HTML.test(p))))]
    .sort(order)
    .slice(0, MAX_DOCS)
    .map((path) => ({ path, title: titleOf(join(root, path)) }));
}

/** A landing demo's docs: the Markdown among the files committed beside its map. */
export function demoDocs(source: Record<string, string>): Doc[] {
  return Object.keys(source)
    .filter((p) => /\.(mdx?|html?)$/i.test(p))
    .sort(order)
    .map((path) => ({ path, title: source[path].match(/^#{1,3}\s+(.+)$/m)?.[1].trim() ?? "" }));
}
