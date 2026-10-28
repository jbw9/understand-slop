"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExplainedBlock, type Explained } from "@/components/blocks";
import { Button } from "@/components/button";
import { DiagramDiff, TINT, WORD } from "@/components/diff";
import { Eyebrow } from "@/components/state";
import type { Anatomy, DiagramArrow, DiagramBox } from "@/lib/data";
import type { PartDiff, Verdict } from "@/lib/diff";
import { fileLines, parsePlan, pieces, planChoices, type Choice, type FileLine } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * A plan Claude wrote in plan mode, as a short design doc in a tab of its own
 * (components/workspace.tsx), so it is read rather than scrolled past in the
 * terminal: a title and one sentence, the picture, then a few short sections.
 * The picture is drawn the way the map draws a diff (components/diff.tsx) —
 * a plan is a diff that has not happened yet — so what it adds is green, what
 * it changes amber and what it removes red, against the parts it leaves alone.
 *
 * It is accepted from here. Claude Code still asks in its terminal, and the
 * buttons at the foot are that question's own answers, read off the screen
 * and pressed there (lib/plan.ts): answering in either place is the same.
 */

export interface Plan {
  text: string;
  file: string | null;
  /** 1 for the first plan in this tab, counting up as Claude revises it. */
  version: number;
  /** Waiting on the user, accepted, or sent back with what to change. */
  state: "open" | "approved" | "revising";
  /** What the user asked to change, while Claude revises. */
  asked?: string;
  /** What the user asked for that this revision answers. */
  after?: string;
}

type Status = "working" | "waiting" | "done";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The question's answers while Claude Code is asking it; polled, since it is drawn by another program. */
function useChoices(read: () => string[], on: boolean) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const reader = useRef(read);
  useEffect(() => {
    reader.current = read;
  });
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const next = planChoices(reader.current());
      setChoices((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 400);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [on]);
  return on ? choices : null;
}

export function PlanView({
  plan,
  visible,
  status,
  pty,
  read,
  onAnswered,
  onShowClaude,
  inset,
}: {
  plan: Plan;
  visible: boolean;
  /** What the Claude that wrote it is doing. */
  status?: Status;
  /** That Claude's terminal; gone once its tab is closed. */
  pty?: number;
  /** Its screen, line by line (components/shell.tsx). */
  read: () => string[];
  onAnswered: (next: Pick<Plan, "state" | "asked">) => void;
  onShowClaude?: () => void;
  /** Room kept on the right for the workspace window floating over the main view. */
  inset?: string;
}) {
  const doc = useMemo(() => parsePlan(plan.text), [plan.text]);
  const choices = useChoices(read, plan.state !== "approved" && pty !== undefined);
  const [words, setWords] = useState("");
  const top = useRef<HTMLDivElement>(null);

  // A revised plan is read from its top.
  useEffect(() => {
    top.current?.scrollTo({ top: 0 });
  }, [plan.version]);

  const answer = async (c: Choice) => {
    if (pty === undefined) return;
    // Asked again at the moment of pressing: a key must never land in a
    // prompt that has moved on to something else.
    if (!planChoices(read())?.some((x) => x.n === c.n && x.input === c.input)) return;
    const said = words.replace(/\s*\n\s*/g, " ").trim();
    if (c.input && !said) return;
    await invoke("pty_write", { id: pty, data: String(c.n) });
    if (c.input) {
      // Its number opens the field; the words go in once it has.
      await sleep(250);
      await invoke("pty_write", { id: pty, data: said });
      await sleep(150);
      await invoke("pty_write", { id: pty, data: "\r" });
      setWords("");
    }
    onAnswered(c.input ? { state: "revising", asked: said } : { state: "approved" });
  };

  const { added, changed, removed } = doc.files;
  const yes = choices?.filter((c) => !c.input) ?? [];
  const change = choices?.find((c) => c.input);

  return (
    <div ref={top} className={cn("absolute inset-0 flex flex-col overflow-y-auto bg-warm-cream", !visible && "hidden")} style={{ paddingRight: inset }}>
      <article className="mx-auto w-full max-w-[920px] flex-1 px-10 pb-16 pt-9">
        <header className="mb-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Eyebrow className="text-deep-green">{plan.version > 1 ? `Plan · revision ${plan.version}` : "Plan"}</Eyebrow>
            <span className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-faint">
              {doc.steps ? <span className="tnum">{doc.steps} steps</span> : null}
              {added + changed + removed ? (
                <span className="tnum">
                  {added + changed + removed} {added + changed + removed === 1 ? "file" : "files"}
                  {(["added", "changed", "removed"] as const).map((v) =>
                    doc.files[v] ? (
                      <span key={v} className="ml-1.5 font-semibold" style={{ color: TINT[v].ink }}>
                        {TINT[v].mark}
                        {doc.files[v]}
                      </span>
                    ) : null,
                  )}
                </span>
              ) : null}
              <span className="tnum">{doc.minutes} min read</span>
            </span>
            {plan.after ? (
              <span className="min-w-0 truncate text-[12px] text-muted-slate" title={plan.after}>
                for “{plan.after}”
              </span>
            ) : null}
          </div>
          <h1 className="mt-2.5 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">{doc.title}</h1>
          {doc.lede ? <p className="mt-2.5 max-w-[720px] text-[17px] leading-relaxed text-on-surface-variant">{doc.lede}</p> : null}
        </header>
        {/* One hairline between sections, as between a level's blocks. */}
        <div className="flex flex-col [&>*+*]:mt-9 [&>*+*]:border-t [&>*+*]:border-border-gray [&>*+*]:pt-8">
          {doc.intro ? <Body text={doc.intro} /> : null}
          {doc.sections.map((s, i) => {
            const risky = /risk|watch|careful|caveat/i.test(s.title);
            return (
              <section key={i}>
                <Eyebrow className={cn("mb-3.5 block", risky && "text-clay-ink")}>{s.title}</Eyebrow>
                <Body text={s.body} />
              </section>
            );
          })}
        </div>
        {plan.file ? (
          <p className="mt-10 font-mono text-[11px] text-faint" title={plan.file}>
            {plan.file.replace(/^\/(Users|home)\/[^/]+/, "~")}
          </p>
        ) : null}
      </article>

      {/* The question, at the foot of the doc it is about. */}
      <footer className="sticky bottom-0 border-t border-border-gray bg-warm-cream/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-2.5 px-10 py-3.5">
          {plan.state === "approved" ? (
            <Line dot="bg-[#4caf50]" text={
                status === "working"
                  ? "Accepted. Claude is building it."
                  : status === "waiting"
                    ? "Accepted. Claude needs you in its tab."
                    : "Accepted, and Claude has finished."
              } action={onShowClaude} />
          ) : choices ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto flex items-center gap-2 text-[13px] font-medium text-ink">
                  <span className="size-2 rounded-full bg-[#cf3e3e]" />
                  Build this plan?
                </span>
                {yes
                  .slice(1)
                  .reverse()
                  .map((c) => (
                    <Button key={c.n} onClick={() => void answer(c)}>
                      {c.label}
                    </Button>
                  ))}
                {yes[0] ? (
                  <Button variant="primary" onClick={() => void answer(yes[0])}>
                    {yes[0].label}
                  </Button>
                ) : null}
              </div>
              {change ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void answer(change);
                  }}
                >
                  <input
                    value={words}
                    onChange={(e) => setWords(e.target.value)}
                    placeholder={`${change.label}…`}
                    className="h-8 min-w-0 flex-1 rounded-[2px] border border-border-gray bg-pure-white px-3 text-[13px] text-ink placeholder:text-faint focus:border-border-strong focus:outline-none"
                  />
                  <Button type="submit" disabled={!words.trim()}>
                    Send
                  </Button>
                </form>
              ) : null}
            </>
          ) : plan.state === "revising" || status === "working" ? (
            <Line dot="bg-[#f0c674]" text={plan.asked ? `Asked: “${plan.asked}”. Claude is revising the plan.` : "Claude is revising the plan."} action={onShowClaude} />
          ) : (
            <Line dot="bg-border-strong" text={pty === undefined ? "Claude's tab is closed." : "Not accepted yet. Claude's tab has the conversation."} action={onShowClaude} />
          )}
        </div>
      </footer>
    </div>
  );
}

function Line({ dot, text, action }: { dot: string; text: string; action?: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
      <span className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span className="mr-auto min-w-0">{text}</span>
      {action ? (
        <Button variant="ghost" onClick={action}>
          Show Claude
        </Button>
      ) : null}
    </div>
  );
}

/** A section's words and pictures, in order. */
function Body({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-6">
      {pieces(text).map((p, i) =>
        p.kind === "figure" ? (
          <Figure key={i} lang={p.lang} body={p.body} />
        ) : (
          <div key={i} className="doc-prose plan-prose max-w-[760px]">
            <Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown>
          </div>
        ),
      )}
    </div>
  );
}

/** A fence drawn as the map draws its blocks; one that does not parse is shown as written. */
function Figure({ lang, body }: { lang: string; body: string }) {
  if (lang === "files") {
    const lines = fileLines(body);
    if (lines.length) return <Files lines={lines} />;
  } else {
    const drawn = figureOf(lang, body);
    if (drawn) return drawn;
  }
  return (
    <div className="doc-prose">
      <pre>{body}</pre>
    </div>
  );
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
const objs = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

const CHANGE: Record<string, Exclude<Verdict, "untouched">> = {
  new: "added",
  added: "added",
  add: "added",
  changed: "changed",
  change: "changed",
  edit: "changed",
  edited: "changed",
  gone: "removed",
  removed: "removed",
  deleted: "removed",
};
const LEGEND = { added: "green is new", changed: "amber changes", removed: "red goes" } as const;

function figureOf(lang: string, body: string): React.ReactNode {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  if (lang === "diagram") {
    const raw = objs(v.boxes).filter((b) => str(b.id));
    if (!raw.length) return null;
    // Placed in a row when the plan left out where: still a picture. A grid
    // counted from 1 would leave an empty first column and row, drawn as room.
    const at = (n: unknown, i: number) => (typeof n === "number" ? n : i);
    const col0 = Math.min(...raw.map((b, i) => at(b.col, i)));
    const row0 = Math.min(...raw.map((b) => at(b.row, 0)));
    const boxes: (DiagramBox & { verdict: Verdict })[] = raw.map((b, i) => ({
      id: str(b.id)!,
      label: str(b.label) ?? str(b.id)!,
      sub: str(b.sub),
      col: at(b.col, i) - col0,
      row: at(b.row, 0) - row0,
      verdict: CHANGE[str(b.change)?.toLowerCase() ?? ""] ?? "untouched",
    }));
    const of = new Map(boxes.map((b) => [b.id, b.verdict]));
    const arrows: (DiagramArrow & { verdict: Verdict })[] = objs(v.arrows)
      .filter((a) => of.has(str(a.from) ?? "") && of.has(str(a.to) ?? ""))
      .map((a) => {
        const ends = [of.get(str(a.from)!), of.get(str(a.to)!)];
        // A line to something new is new, and one to something going goes with it.
        const verdict =
          CHANGE[str(a.change)?.toLowerCase() ?? ""] ?? (ends.includes("added") ? "added" : ends.includes("removed") ? "removed" : "untouched");
        return { from: str(a.from)!, to: str(a.to)!, label: str(a.label), verdict };
      });
    const block: Extract<Anatomy, { kind: "diagram" }> = { kind: "diagram", caption: str(v.caption) ?? "", boxes, arrows };
    const shown = (["added", "changed", "removed"] as const).filter((k) => boxes.some((b) => b.verdict === k) || arrows.some((a) => a.verdict === k));
    // Nothing marked as changing: drawn plainly, not as a picture of nothing happening.
    if (!shown.length) return <ExplainedBlock block={block} />;
    return (
      <DiagramDiff
        block={block}
        boxes={boxes.map((b): PartDiff => ({ key: b.id, verdict: b.verdict }))}
        arrows={arrows.map((a): PartDiff => ({ key: `${a.from}→${a.to}`, verdict: a.verdict }))}
        legend={shown.map((k) => LEGEND[k]).join(" · ")}
      />
    );
  }
  if (lang === "screen") {
    // A heading or a line of text is as often written with `text` as with
    // `label`, and a first heading is often the screen's title again.
    const title = str(v.title) ?? "";
    const items = objs(v.items)
      .filter((it) => str(it.label) ?? str(it.text))
      .filter((it, i) => !(i === 0 && it.type === "heading" && (str(it.label) ?? str(it.text)) === title))
      .map((it) => ({
        type: (["heading", "text", "field", "choice", "button", "list", "image"].includes(str(it.type) ?? "") ? str(it.type) : "text") as Extract<Explained, { kind: "screen" }>["items"][number]["type"],
        label: (str(it.label) ?? str(it.text))!,
        note: str(it.note),
      }));
    if (!items.length) return null;
    return (
      <ExplainedBlock
        block={{ kind: "screen", title: str(v.title) ?? "", caption: str(v.caption), device: v.device === "phone" ? "phone" : "web", route: str(v.route), items }}
      />
    );
  }
  if (lang === "sequence") {
    const actors = Array.isArray(v.actors) ? v.actors.map(str).filter((a): a is string => Boolean(a)) : [];
    const rows = objs(v.rows)
      .filter((r) => actors.includes(str(r.from) ?? "") && actors.includes(str(r.to) ?? ""))
      .map((r) => ({ from: str(r.from)!, to: str(r.to)!, label: str(r.label) ?? "", note: str(r.note), state: "derived" as const }));
    if (actors.length < 2 || !rows.length) return null;
    return <ExplainedBlock block={{ kind: "sequence", caption: str(v.caption), actors, rows }} />;
  }
  if (lang === "table") {
    const columns = Array.isArray(v.columns) ? v.columns.map((c) => str(c) ?? "") : [];
    const rows = Array.isArray(v.rows) ? v.rows.filter(Array.isArray).map((r: unknown[]) => r.map((c) => str(c) ?? "")) : [];
    if (!columns.length) return null;
    return <ExplainedBlock block={{ kind: "table", caption: str(v.caption), columns, rows, state: "derived" }} />;
  }
  return null;
}

/** The files a plan touches, marked as the map marks a diff. */
function Files({ lines }: { lines: FileLine[] }) {
  return (
    <ul className="max-w-[860px] overflow-hidden rounded-[3px] border border-border-gray bg-pure-white">
      {lines.map((f, i) => {
        const t = TINT[f.verdict];
        return (
          <li key={i} className="flex items-baseline gap-3 border-b border-border-gray px-4 py-2.5 last:border-b-0">
            <span aria-label={WORD[f.verdict]} className="w-3 shrink-0 text-center font-mono text-[14px] font-bold" style={{ color: t.ink }}>
              {t.mark}
            </span>
            <span className={cn("shrink-0 font-mono text-[12.5px] text-ink", f.verdict === "removed" && "line-through")}>{f.path}</span>
            {f.why ? <span className="min-w-0 text-[13.5px] leading-snug text-on-surface-variant">{f.why}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
