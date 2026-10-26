/**
 * The run's audit: how the map was reached, as a reader can follow it. The
 * cut's reasons for each root and for what it left out, each author's reads,
 * searches and rejected submits in order, and what the verifier questioned,
 * rewrote or marked unsure. Written beside map.json and report.json; the
 * report keeps the numbers, this keeps the reasoning they came from.
 */
import type { Node } from "@/lib/data";
import type { Authored } from "./author";
import type { Cut } from "./cut";
import type { Inventory } from "./inventory";
import type { Verdict } from "./verify";

export interface AuditInput {
  inv: Inventory;
  cut: Cut;
  /** The cut rounds sent back, each with its problems; empty when the first stood. */
  rejected: string[][];
  /** Files no root claimed after three rounds. */
  leftover: string[];
  /** True when the cut was reused from an earlier run (a --roots repair). */
  cutReused: boolean;
  authored: Record<string, Authored>;
  verdicts: Record<string, Verdict[]>;
  /** The roots this run redid, when it was a repair; the rest were kept as they were. */
  only?: string[];
  backend: string;
  models: Record<string, string>;
  seconds: number;
  checkProblems: string[];
}

const STATE: Record<string, string> = { derived: "read in the code", partial: "partly outside the repo", inferred: "a judgement" };

/** The finished tree as an outline: what each node is, how sure, and why not. */
function outline(n: Node, depth = 0): string[] {
  const pad = "  ".repeat(depth);
  const line = `${pad}- **${n.title}** — ${n.sub} _(${STATE[n.state] ?? n.state})_`;
  const unsure = n.unsure ? [`${pad}  - unsure: ${n.unsure}`] : [];
  return [line, ...unsure, ...(n.children ?? []).flatMap((c) => outline(c, depth + 1))];
}

export function auditMarkdown(a: AuditInput): string {
  const { inv, cut } = a;
  const out: string[] = [];
  const title = new Map(cut.roots.map((r) => [r.id, r.title]));

  out.push(
    `# How the map of ${inv.name} was made`,
    "",
    `Commit \`${inv.commit}\` · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${a.backend} · ${Math.round(a.seconds / 60)} min`,
    "",
    `Models: ${Object.entries(a.models).map(([k, v]) => `${k} \`${v}\``).join(", ")}.`,
    ...(a.only ? ["", `A repair run: only ${a.only.map((id) => title.get(id) ?? id).join(", ")} were redone; the other roots were kept from the map that was there.`] : []),
  );

  // 1. The cut.
  out.push("", "## 1. How the top level was cut", "", cut.about, "");
  if (a.cutReused) out.push("_The cut was reused from the previous run, so its rounds are not recorded here._", "");
  else if (a.rejected.length)
    a.rejected.forEach((p, i) => out.push(`- Round ${i + 1} was sent back: ${p.slice(0, 10).join("; ")}${p.length > 10 ? `; and ${p.length - 10} more` : ""}`));
  else out.push("- The first cut passed its checks.");
  out.push("", "| Root | Why it is a root | Owns |", "|---|---|---|");
  for (const r of cut.roots) out.push(`| ${r.title} | ${r.why.replace(/\|/g, "\\|")} | ${r.files.length} path${r.files.length === 1 ? "" : "s"} |`);
  if (cut.edges.length) out.push("", `The path through them: ${cut.edges.map((e) => `${title.get(e.from) ?? e.from} → ${title.get(e.to) ?? e.to}${e.label ? ` (${e.label})` : ""}`).join(", ")}.`);
  const roots = new Set(cut.edges.flatMap((e) => [e.from, e.to]));
  const off = cut.roots.filter((r) => !roots.has(r.id));
  if (off.length && cut.edges.length) out.push(`Off the path: ${off.map((r) => r.title).join(", ")}.`);
  if (cut.excluded.length) {
    out.push("", "Left out of the map:");
    for (const e of cut.excluded) out.push(`- \`${e.path}\` — ${e.reason}`);
  }
  if (a.leftover.length) out.push("", `${a.leftover.length} files were still unclaimed after three rounds and are listed above as left unassigned.`);

  // 2. Each root.
  out.push("", "## 2. How each root was written");
  for (const r of cut.roots) {
    const w = a.authored[r.id];
    out.push("", `### ${r.title}`, "", `_${r.sub}_`, "");
    if (a.only && !a.only.includes(r.id)) {
      out.push("Kept from the previous map; not redone in this run.");
      continue;
    }
    out.push(
      w.root
        ? `Accepted on submit ${w.submits}, after ${w.reads} reads and searches over ${w.turns + 1} turns.`
        : `**Not accepted.** It ran out of turns after ${w.submits} submits; the checker's last word: ${w.problems.slice(0, 10).join("; ") || "none recorded"}.`,
      "",
    );
    if (w.trail.length) {
      out.push("<details><summary>What the agent did, step by step</summary>", "");
      w.trail.forEach((s, i) => out.push(`${i + 1}. ${s.tool === "submit" ? "**submit**" : s.tool} ${s.what} — ${s.result}`));
      out.push("", "</details>", "");
    } else out.push("_Its steps were replayed from a cache made before steps were kept; regenerate with --fresh to record them._", "");
    if (w.root) out.push("What it settled on:", "", ...outline(w.root));
  }

  // 3. Verification.
  out.push("", "## 3. What verification changed", "", "A second model read each node against the lines it cites. Questioned claims went to a reviewer that could read the repo, which dismissed them, added the missing citation, corrected the wording, or marked the node unsure.");
  for (const r of cut.roots) {
    const v = a.verdicts[r.id];
    if (!v) continue;
    const flagged = v.filter((x) => x.flagged);
    out.push("", `### ${r.title}`, "", `${v.length} nodes checked: ${v.filter((x) => x.ok).length} passed as written, ${flagged.length} questioned, ${v.filter((x) => x.rewritten).length} rewritten, ${v.filter((x) => x.downgraded).length} marked unsure.`);
    for (const x of flagged) {
      const what = x.downgraded ? "marked unsure" : x.rewritten ? "rewritten" : "every flag dismissed";
      out.push("", `- \`${x.id}\` — ${what}`);
      for (const f of x.flags ?? []) out.push(`  - questioned: ${f}`);
      for (const c of x.claims) out.push(`  - confirmed wrong: ${c}`);
    }
  }

  // 4. The final check.
  out.push("", "## 4. The final check", "");
  if (a.checkProblems.length) {
    out.push(`${a.checkProblems.length} problems remain in the finished map:`, "");
    for (const p of a.checkProblems.slice(0, 50)) out.push(`- ${p}`);
  } else out.push("The finished map passed every check.");
  return out.join("\n") + "\n";
}
