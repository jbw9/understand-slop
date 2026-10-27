/**
 * The run's audit: how the map was reached, as a reader can follow it. The
 * cut's reasons for each root and for what it left out, each author's reads,
 * searches and rejected submits in order, and what the verifier questioned,
 * rewrote or marked unsure. Written beside map.json and report.json; the
 * report keeps the numbers, this keeps the reasoning they came from.
 */
import type { Node } from "@/lib/data";
import type { Authored } from "./author";
import { OVERVIEW_ID } from "./check";
import type { Overview } from "@/lib/map";
import type { Cut } from "./cut";
import type { Inventory } from "./inventory";
import type { Overviewed } from "./overview";
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
  /** The overview as this run drew it; null when it kept the one it had. */
  drawn: Overviewed | null;
  overview?: Overview;
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
    `Commit \`${inv.commit}\`${inv.dirty.length ? `, with uncommitted edits to ${inv.dirty.slice(0, 8).map((f) => `\`${f}\``).join(", ")}${inv.dirty.length > 8 ? ` and ${inv.dirty.length - 8} more` : ""} (read as they were on disk)` : ""} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${a.backend} · ${Math.round(a.seconds / 60)} min`,
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
  if (cut.roots.length) out.push("", "| Root | Why it is a root | Owns |", "|---|---|---|");
  for (const r of cut.roots) out.push(`| ${r.title} | ${r.why.replace(/\|/g, "\\|")} | ${r.files.length} path${r.files.length === 1 ? "" : "s"} |`);
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
    }
    if (w.root) out.push("What it settled on:", "", ...outline(w.root));
  }

  // 3. The overview.
  out.push("", "## 3. How the top level was drawn", "");
  const pic = a.overview?.anatomy?.find((b) => b.kind === "diagram");
  if (!a.overview) out.push(a.drawn ? `The overview was not accepted after ${a.drawn.submits} submits; the top level lists the roots instead. Its last problems: ${a.drawn.problems.slice(0, 10).join("; ")}` : "No overview: no root was accepted.");
  else {
    if (!a.drawn) out.push("_The overview was kept from the previous run: the same roots stand._", "");
    else out.push(`Drawn after the roots, in ${a.drawn.turns + 1} turns and ${a.drawn.submits} submit${a.drawn.submits === 1 ? "" : "s"}.`, "");
    out.push(`_${a.overview.sub}_ — ${a.overview.detail ?? ""}`);
    if (pic?.kind === "diagram") {
      const label = (id: string) => pic.boxes.find((x) => x.id === id)?.label ?? id;
      if (pic.arrows.length) out.push("", "Between the roots:", "", ...pic.arrows.map((x) => `- ${label(x.from)} → ${label(x.to)}${x.label ? ` (${x.label})` : ""} — \`${x.at ?? "uncited"}\``));
      else out.push("", "No arrows: the code shows no path from one root to another.");
    }
  }

  // 4. Verification.
  out.push("", "## 4. What verification changed", "", "A second model read each node against the lines it cites and the code around them. Questioned claims went to a reviewer that could read the repo, which dismissed them, added the missing citation, corrected the wording, or marked the node unsure.");
  for (const r of [{ id: OVERVIEW_ID, title: "Overview" }, ...cut.roots]) {
    const v = a.verdicts[r.id];
    if (!v) continue;
    const flagged = v.filter((x) => x.flagged);
    const changed = v.filter((x) => x.rewritten || x.downgraded).length;
    out.push("", `### ${r.title}`, "", `${v.length} nodes checked: ${v.length - changed} kept as written, ${flagged.length} questioned, ${v.filter((x) => x.rewritten).length} rewritten, ${v.filter((x) => x.downgraded).length} marked unsure.`);
    for (const x of flagged) {
      const what = x.downgraded ? "marked unsure" : x.rewritten ? "rewritten" : "every flag dismissed";
      out.push("", `- \`${x.id}\` — ${what}`);
      // The reviewer quotes the flags it upholds, not always word for word: match on the claim.
      const upheld = new Set(x.claims.map(claimOf));
      for (const f of x.flags ?? []) out.push(`  - ${upheld.has(claimOf(f)) ? "upheld" : "dismissed"}: ${f}`);
      if (x.fixed) out.push(`  - now reads: ${x.fixed}`);
    }
  }

  // 5. The final check.
  out.push("", "## 5. The final check", "");
  if (a.checkProblems.length) {
    out.push(`${a.checkProblems.length} problems remain in the finished map:`, "");
    for (const p of a.checkProblems.slice(0, 50)) out.push(`- ${p}`);
  } else out.push("The finished map passed every check.");
  return out.join("\n") + "\n";
}

/** A flag's claim, without its verdict and reasons. */
const claimOf = (flag: string) => flag.split(" — ")[0].trim();
