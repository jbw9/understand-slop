/**
 * A branch or a pull request as a range to diff, the way a reviewer means it:
 * what the branch did since it left its base (`git merge-base`), not
 * everything that differs between two tips. A tip-to-tip compare against a
 * main that moved on shows main's own commits as the branch's.
 *
 * Pull requests come from GitHub through the `gh` CLI when it is installed and
 * signed in; without it branches still work and the panel says why PRs do not.
 * Server only: it runs git and gh.
 */
import { execFileSync } from "node:child_process";
import { git } from "@/scripts/generate/gitdiff";

export interface Review {
  /** `pr` names a pull request; `branch` a local or remote branch against its base. */
  kind: "pr" | "branch";
  base: string;
  head: string;
  /** The merge-base the diff starts from, and the head commit it ends at. */
  from: string;
  to: string;
  number?: number;
  title?: string;
  body?: string;
  author?: string;
  url?: string;
}

export interface Branch {
  name: string;
  /** ISO 8601, its last commit's date. */
  at: string;
  subject: string;
}

export interface Pull {
  number: number;
  title: string;
  author: string;
  head: string;
  base: string;
  url: string;
}

// A desktop app's server starts with launchd's PATH, which has no Homebrew.
const PATH = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(":");

function gh(root: string, args: string[]): string | null {
  try {
    return execFileSync("gh", args, { cwd: root, encoding: "utf8", env: { ...process.env, PATH }, stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 });
  } catch {
    return null;
  }
}

/** The branch a review compares against when none is named: the remote's default, else main or master. */
export function defaultBase(root: string): string {
  const head = git(root, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").trim();
  if (head) return head;
  for (const b of ["main", "master", "origin/main", "origin/master"]) if (git(root, "rev-parse", "--verify", "--quiet", `${b}^{commit}`).trim()) return b;
  return "HEAD";
}

/** Local and remote branches, most recently committed first. */
export function branches(root: string, n = 60): Branch[] {
  return git(root, "for-each-ref", "--sort=-committerdate", `--count=${n}`, "--format=%(refname:short)%09%(committerdate:iso-strict)%09%(subject)", "refs/heads", "refs/remotes")
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(([name, at]) => name && at && !name.endsWith("/HEAD") && name !== "origin")
    .map(([name, at, subject]) => ({ name, at, subject: subject ?? "" }));
}

/** Open pull requests, or why there are none to show. */
export function pulls(root: string): { pulls: Pull[] } | { why: string } {
  const out = gh(root, ["pr", "list", "--limit", "30", "--json", "number,title,author,headRefName,baseRefName,url"]);
  if (out === null) return { why: "Pull requests need the GitHub CLI (`gh`), installed and signed in, in a checkout with a GitHub remote." };
  const raw = JSON.parse(out) as { number: number; title: string; author?: { login?: string }; headRefName: string; baseRefName: string; url: string }[];
  return { pulls: raw.map((p) => ({ number: p.number, title: p.title, author: p.author?.login ?? "", head: p.headRefName, base: p.baseRefName, url: p.url })) };
}

// A leading "-" would reach git as an option, so a name must start with a word character.
const BRANCH = /^\w[\w./-]{0,199}$/;

/**
 * `pr:<n>` or `<base>...<head>` as a range. A pull request's head and base
 * are fetched first, so the review is of the PR as GitHub has it now rather
 * than of whatever local copy is stale; the head lands in FETCH_HEAD and no
 * local branch is created or moved.
 */
export function reviewRange(root: string, spec: string): Review | { error: string } {
  const pr = /^pr:(\d{1,7})$/.exec(spec);
  if (pr) {
    const out = gh(root, ["pr", "view", pr[1], "--json", "number,title,body,author,url,baseRefName,headRefName,headRefOid"]);
    if (out === null) return { error: `Could not read pull request #${pr[1]}: the GitHub CLI (\`gh\`) must be installed, signed in, and this checkout's remote on GitHub.` };
    const p = JSON.parse(out) as { number: number; title: string; body: string; author?: { login?: string }; url: string; baseRefName: string; headRefName: string; headRefOid: string };
    if (!BRANCH.test(p.baseRefName)) return { error: `Unexpected base branch name on #${p.number}.` };
    try {
      execFileSync("git", ["-C", root, "fetch", "--no-tags", "--quiet", "origin", `+refs/heads/${p.baseRefName}:refs/remotes/origin/${p.baseRefName}`, `pull/${p.number}/head`], { stdio: "ignore", timeout: 60_000 });
    } catch {
      return { error: `Could not fetch #${p.number} from origin.` };
    }
    const base = `origin/${p.baseRefName}`;
    const from = git(root, "merge-base", base, p.headRefOid).trim();
    if (!from) return { error: `#${p.number} shares no history with ${base}.` };
    return { kind: "pr", base, head: p.headRefName, from, to: p.headRefOid, number: p.number, title: p.title, body: p.body, author: p.author?.login, url: p.url };
  }
  const range = /^(.+?)\.\.\.(.+)$/.exec(spec);
  if (!range || !BRANCH.test(range[1]) || !BRANCH.test(range[2])) return { error: `Could not read "${spec}" as a review: give pr:<number> or <base>...<branch>.` };
  const [, base, head] = range;
  const to = git(root, "rev-parse", "--verify", "--quiet", `${head}^{commit}`).trim();
  if (!to) return { error: `No branch ${head} in this checkout.` };
  const from = git(root, "merge-base", base, to).trim();
  if (!from) return { error: `${head} shares no history with ${base}.` };
  return { kind: "branch", base, head, from, to };
}
