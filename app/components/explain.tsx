"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, Prose } from "@/components/state";
import { Button } from "@/components/button";
import { Overlay, DIALOG } from "@/components/dialog";
import { AnatomyView, SourceView, type RowCtx } from "@/components/anatomy";
import { ExplainedBlock, isExplained } from "@/components/blocks";
import { useMap } from "@/components/map-context";
import { readSource } from "@/lib/source";
import type { Slice } from "@/lib/repo";
import type { Anatomy, Explainer as ExplainerData, Term, Walkthrough } from "@/lib/data";

/* ── the toggle ──────────────────────────────────────────────── */

/**
 * Whether the plain-words layer is showing. A per-reader preference, kept in
 * the browser: on by default, since the reader it serves is the one who does
 * not yet know to look for it.
 */
const KEY = "mira.explain";
const listeners = new Set<() => void>();

function readExplain(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function useExplain(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readExplain,
    () => true,
  );
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "on" : "off");
    } catch {
      /* private window: the choice lasts this page */
    }
    listeners.forEach((l) => l());
  };
  return [on, set];
}

export function ExplainToggle() {
  const [on, set] = useExplain();
  return (
    <Button
      onClick={() => set(!on)}
      aria-pressed={on}
      title={on ? "Hide the plain-words explanations" : "Show plain-words explanations for someone new to this"}
      className={on ? "border-mint-line bg-mint-success text-deep-green hover:border-mint-line hover:bg-mint-success hover:text-deep-green" : undefined}
    >
      <span aria-hidden className="text-[13px] leading-none">{on ? "◉" : "○"}</span>
      Explain
    </Button>
  );
}

/* ── one level, in plain words ───────────────────────────────── */

/**
 * An explainer's picture draws the idea, not the code, so it makes no claim to
 * be uncertain about: a row the generator left without a `state` would
 * otherwise render as "not certain".
 */
function settled(b: Anatomy): Anatomy {
  const rows = "rows" in b ? (b.rows as unknown[]).map((r) => (r && typeof r === "object" && !Array.isArray(r) ? { state: "derived", ...r } : r)) : undefined;
  return { ...b, ...(rows ? { rows } : {}), ...(b.kind === "table" ? { state: b.state ?? "derived" } : {}) } as Anatomy;
}

/**
 * The level said again for someone new to the project and its field
 * (`Node.explain`): prose that defines its words, then a picture where one
 * teaches more than the prose. Set apart by a green rule, so it reads as a
 * gloss on the level rather than more of it.
 */
export function Explainer({ owner, explain, ctx }: { owner: string; explain: ExplainerData; ctx: RowCtx }) {
  return (
    <section data-pick="In plain words" data-pick-text={explain.body} className="border-l-2 border-mint-line pl-5">
      <Eyebrow className="text-deep-green">In plain words</Eyebrow>
      <div className="max-w-[720px]">
        {explain.body.split(/\n\s*\n/).map((para, i) => (
          <p key={i} className="mt-3 text-[14.5px] leading-[1.65] text-on-surface">
            <Prose text={para} />
          </p>
        ))}
      </div>
      {(explain.blocks ?? []).map(settled).map((b, i) => (
        <div key={i} className="mt-6">
          {isExplained(b) ? (
            <div className={b.kind === "diagram" ? "" : "max-w-[1100px]"}>
              <ExplainedBlock block={b} />
            </div>
          ) : (
            <div className="max-w-[900px] [zoom:1.18]">
              <AnatomyView owner={`${owner}@explain${i}`} blocks={[b]} ctx={ctx} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/**
 * The repository level's way in: one concrete thing followed through the
 * roots, each step opening the part where it happens, and the words the map
 * leans on.
 */
export function StartHere({
  walkthrough,
  glossary,
  onOpen,
}: {
  walkthrough?: Walkthrough;
  glossary?: Term[];
  onOpen: (path: string[]) => void;
}) {
  const { nodeAt } = useMap();
  return (
    <section data-pick="Start here" className="border-l-2 border-mint-line pl-5">
      {walkthrough ? (
        <div>
          <Eyebrow className="text-deep-green">Follow one thing through</Eyebrow>
          <p className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-ink">{walkthrough.title}</p>
          <ol className="mt-4 flex max-w-[820px] flex-col">
            {walkthrough.steps.map((s, i) => {
              const last = i === walkthrough.steps.length - 1;
              const where = s.path.map((_, k) => nodeAt(s.path.slice(0, k + 1))?.title).filter(Boolean);
              return (
                <li key={i} className="flex gap-3.5">
                  <div className="flex w-[22px] shrink-0 flex-col items-center pt-[11px]">
                    <span className="flex size-[22px] items-center justify-center rounded-full border border-mint-line bg-mint-success font-mono text-[10.5px] font-semibold text-deep-green">
                      {i + 1}
                    </span>
                    {last ? null : <span className="mt-1 w-px flex-1 bg-border-strong" />}
                  </div>
                  <button
                    onClick={() => onOpen(s.path)}
                    className={cn(
                      "group min-w-0 flex-1 rounded-[3px] px-3 py-2.5 text-left transition-colors hover:bg-surface-container-low",
                      last ? "" : "mb-1",
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-[14px] font-semibold text-ink">{s.title}</span>
                      <span className="ml-auto shrink-0 truncate text-[11.5px] text-faint group-hover:text-deep-green">
                        {where.join(" › ")} ›
                      </span>
                    </span>
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-on-surface-variant">
                      <Prose text={s.detail} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {glossary?.length ? (
        <div className={walkthrough ? "mt-8" : ""}>
          <Eyebrow className="text-deep-green">Words this map uses</Eyebrow>
          <dl className="mt-3 grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-8 gap-y-3">
            {glossary.map((t) => (
              <div key={t.term}>
                <dt className="text-[13.5px] font-semibold text-ink">{t.term}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

/* ── code, opened from what explains it ──────────────────────── */

/** What the code popup shows: the thing clicked, and the lines behind it. */
export interface CodeFocus {
  heading: string;
  detail?: string;
  refs: { file: string; start: number; end: number; label?: string }[];
}

/** `file:start-end` or `file:line`, as a step's `at` cites it. */
export function parseAt(at: string): { file: string; start: number; end: number } | null {
  const m = /^(.+):(\d+)(?:-(\d+))?$/.exec(at);
  return m ? { file: m[1], start: +m[2], end: +(m[3] ?? m[2]) } : null;
}

/**
 * The lines behind one step (or one leaf), over the page. It opens with where
 * it belongs — the trail down to this level and the step's own words — so the
 * code never arrives without the sentence that explains it.
 */
export function CodePopup({
  focus,
  trail,
  owner,
  ctx,
  onClose,
}: {
  focus: CodeFocus;
  trail: string[];
  owner: string;
  ctx: RowCtx;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-label={focus.heading} className={cn(DIALOG, "max-w-[1060px]")}>
        <div className="border-b border-border-gray px-5 pb-4 pt-3.5">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-[12px] text-faint">{trail.join(" › ")}</p>
            <Button variant="ghost" size="sm" onClick={onClose} title="Close (Esc)">
              ✕
            </Button>
          </div>
          <p className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em] text-ink">{focus.heading}</p>
          {focus.detail ? (
            <p className="mt-1 max-w-[760px] text-[13.5px] leading-relaxed text-on-surface-variant">
              <Prose text={focus.detail} />
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          {focus.refs.map((r) => (
            <div key={`${r.file}:${r.start}`}>
              <p className="mb-2 flex items-baseline gap-3">
                {r.label ? <span className="text-[13.5px] text-ink">{r.label}</span> : null}
                <span className="ml-auto font-mono text-[11px] text-faint">
                  {r.file}:{r.start === r.end ? r.start : `${r.start}–${r.end}`}
                </span>
              </p>
              <CodeSlice owner={owner} file={r.file} start={r.start} end={r.end} ctx={ctx} />
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

function CodeSlice({ owner, file, start, end, ctx }: { owner: string; file: string; start: number; end: number; ctx: RowCtx }) {
  const { name: map } = useMap();
  const [slice, setSlice] = useState<Slice | null | "failed">(null);
  useEffect(() => {
    const ac = new AbortController();
    readSource({ map, file, start, end }, ac.signal)
      .then((r) => !ac.signal.aborted && setSlice("slice" in r ? r.slice : "failed"))
      .catch(() => !ac.signal.aborted && setSlice("failed"));
    return () => ac.abort();
  }, [map, file, start, end]);
  if (slice === "failed") return <p className="text-[12.5px] text-clay-ink">Could not read this file from the repository.</p>;
  if (!slice) return <p className="text-[12.5px] text-faint">Reading…</p>;
  return <SourceView owner={`${owner}@${file}:${start}`} block={{ kind: "source", file, start: slice.start, code: slice.code }} ctx={ctx} />;
}
