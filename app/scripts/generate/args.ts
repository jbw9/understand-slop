/** The command line both entry points read: a repo directory, `--flag value` options, and bare `--flags`. */
export function parseArgs(args: string[]) {
  const opt = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
  const has = (k: string) => args.includes(k);
  const repo = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  return { repo, opt, has };
}
