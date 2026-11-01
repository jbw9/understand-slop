/**
 * The project's history, told in chapters (D73): one structured answer from
 * the commit list the timeline draws (lib/history.ts), checked against it.
 *
 * Only the commits are read — subjects, dates, authors, sizes and the roots
 * each touched — never the code: a chapter names what the history shows, and
 * a commit's subject is the author's own word for it. Each chapter's ends are
 * real commits in order, so a band on the timeline sits exactly over the dots
 * it tells, and a click on it opens that range in diff mode.
 *
 * Writes <out>/story.json, and appends what it cost to report.json the way an
 * update does.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MapFile } from "@/lib/map";
import { chapterProblems, cutOf, ELSEWHERE, timelineOf, type Chapter, type Story } from "@/lib/history";
import { parseArgs } from "./args";
import { ask, bill, cacheIn, MODELS, type Message } from "./bedrock";
import { ccClose } from "./claude-code";

/** The newest commits the model is shown. A longer history is told from its recent part, and says so. */
const SHOWN = 800;

const TOOL = {
  name: "story",
  description: "The history of this repository as chapters, oldest first.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["chapters"],
    properties: {
      chapters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "from", "to", "detail", "roots"],
          properties: {
            title: { type: "string", description: "1-4 words, Title Case, what happened: 'First Map', 'Desktop App', 'Diff Mode'." },
            from: { type: "string", description: "The short sha of the chapter's first commit, exactly as listed." },
            to: { type: "string", description: "The short sha of its last commit, exactly as listed." },
            detail: { type: "string", description: "At most two plain sentences and 40 words: what changed for someone using it, and why if the subjects say." },
            roots: { type: "array", items: { type: "string" }, description: "The ids of the roots this chapter mostly shaped." },
          },
        },
      },
    },
  },
};

export async function story(args: string[]) {
  const { opt, repo: dir } = parseArgs(args);
  const repo = resolve(dir!);
  const out = opt("--out")!;
  const t0 = Date.now();
  const map: MapFile = JSON.parse(readFileSync(`${out}/map.json`, "utf8"));
  const t = timelineOf(repo, map, cutOf(out));
  cacheIn(`${out}/.cache`);
  const model = MODELS[(process.env.SLOP_STORY ?? "sonnet") as keyof typeof MODELS] ?? MODELS.sonnet;

  const shown = t.commits.slice(-SHOWN);
  const day = (iso: string) => iso.slice(0, 10);
  const lines = shown.map((c) => `${c.short} ${day(c.at)} ${c.author} +${c.added} −${c.removed} [${c.roots.map((r) => r || "elsewhere").join(",")}] ${c.subject}`);
  const prompt = [
    `# ${map.RUN.repo}: its history, oldest commit first`,
    `## The map's roots\n${t.roots.filter((r) => r.id !== ELSEWHERE).map((r) => `- ${r.id}: ${r.title}`).join("\n")}`,
    `## Commits (${shown.length}${shown.length < t.commits.length ? ` most recent of ${t.commits.length}` : ""}): sha, date, author, lines added and removed, roots touched, subject\n${lines.join("\n")}`,
    `## Task
Tell how this codebase got to where it is, as 3 to 8 chapters in order, each a run of consecutive commits that belong together: a feature arriving, a rewrite, a move to a new platform. Every listed commit falls in exactly one chapter, so the first chapter starts at the first commit and the last ends at the last. Checkpoints ("wip", merges) belong to whatever they sit inside. Name a chapter by what changed, not by when.`,
  ].join("\n\n");

  const messages: Message[] = [{ role: "user", content: prompt }];
  let chapters: Chapter[] = [];
  let problems: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await ask<{ chapters: Chapter[] }>({ model, system: "You read a repository's commit history and tell it plainly.", messages, tool: TOOL, stage: "story", maxTokens: 4000 });
    chapters = r.chapters;
    problems = chapterProblems(chapters, { ...t, commits: shown });
    if (!problems.length) break;
    messages.push({ role: "assistant", content: JSON.stringify(r) }, { role: "user", content: `Not accepted. Fix every one of these and answer again:\n- ${problems.join("\n- ")}` });
  }
  await ccClose();
  if (problems.length) {
    console.error(`story: not accepted after 3 attempts:\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }

  const usd = Math.round(Object.values(bill).reduce((a, b) => a + b.usd, 0) * 100) / 100;
  const seconds = Math.round((Date.now() - t0) / 1000);
  const told: Story = { head: t.head, chapters, at: new Date().toISOString(), usd, seconds };
  writeFileSync(`${out}/story.json`, JSON.stringify(told, null, 1) + "\n");
  if (existsSync(`${out}/report.json`)) {
    const report = JSON.parse(readFileSync(`${out}/report.json`, "utf8"));
    report.stories = [...(report.stories ?? []), { at: told.at, chapters: chapters.length, commits: shown.length, seconds, usd }];
    writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1) + "\n");
  }
  console.log(`${out}/story.json — ${chapters.length} chapters over ${shown.length} commits, $${usd}, ${seconds}s`);
}
