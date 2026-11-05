/**
 * What the reader typed as a repository to clone, read the way they would
 * paste it: `owner/repo`, a GitHub page's address (a branch or file view
 * included), or any https or ssh git address. Shared by the page, to name
 * the folder, and the server, which clones only what this accepts.
 */

const GITHUB = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i;
const SHORT = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;
const HTTPS = /^https:\/\/[^\s/@]+(?::\d+)?\/[^\s]+$/i;
const SSH = /^(?:ssh:\/\/[^\s]+|[\w.-]+@[\w.-]+:[^\s]+)$/;

/** The address to clone, or undefined when it is not one. */
export function cloneUrl(input: string): string | undefined {
  const s = input.trim();
  const gh = s.match(GITHUB) ?? s.match(SHORT);
  if (gh) return gh[1] === "." || gh[1] === ".." ? undefined : `https://github.com/${gh[1]}/${gh[2]}.git`;
  if (HTTPS.test(s) || SSH.test(s)) return s;
  return undefined;
}

/** The repository's own name, which the folder and project take by default. */
export function repoName(input: string): string {
  const url = cloneUrl(input);
  if (!url) return "";
  const name = url.replace(/[\\/]+$/, "").split(/[/:]/).pop() ?? "";
  return name.replace(/\.git$/i, "");
}
