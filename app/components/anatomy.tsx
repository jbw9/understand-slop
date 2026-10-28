"use client";

import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state";
import { rowId, type Anatomy } from "@/lib/data";
import { ROW_LABEL_MAX_PCT, ROW_VALUE_MIN_PX } from "@/lib/view";
import { ExplainedBlock, isExplained } from "@/components/blocks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Slice, WriteResult } from "@/lib/repo";
import { useMap } from "@/components/map-context";
import { readSource, SOURCE_URL } from "@/lib/source";
import { highlight, langOf, TOKEN_COLOR } from "@/lib/highlight";

/**
 * Level 2 renders in the SHAPE of the thing it describes, and every row is a
 * wire endpoint.
 *
 * The rows are the point. A foreign key wire lands on the exact column it
 * references, not on the card containing it — card-to-card edges say "Billing
 * relates to Database", which is true and nearly contentless. Row-to-row edges
 * answer an actual question.
 *
 * Selection follows the same model: clicking a row lights its chain and greys
 * everything else, so the eye lands on "this value here → that value there".
 */

export interface RowCtx {
  /** Registers a row element as a wire endpoint. */
  anchor: (id: string) => (el: HTMLElement | null) => void;
  /** Rows in the currently traced chain. Empty set = nothing traced. */
  lit: Set<string>;
  /** True while any trace is active, so unlit rows can recede. */
  tracing: boolean;
  onTrace: (id: string) => void;
  /**
   * The row on the open path, if the level below came from a row. Lights the
   * row you drilled through, the same way a card stays selected.
   */
  open: string | null;
  /** Drill into the level this row owns. Same gesture as opening a card. */
  onOpenRow: (id: string) => void;
}

export function AnatomyView({
  owner,
  blocks,
  ctx,
  headless,
}: {
  owner: string;
  blocks: Anatomy[];
  ctx: RowCtx;
  /** Drawn inside a row that already names the block, so its own header and frame would say it twice. */
  headless?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <Block key={i} owner={owner} block={block} ctx={ctx} headless={headless} />
      ))}
    </div>
  );
}

/**
 * Points right, and turns green when this row's card is open.
 *
 * It does NOT rotate to point down any more. Down means "expands below me",
 * which is what this used to do and is exactly the thing that crushed 700px of
 * flow into a 340px column. The card opens to the RIGHT, so the mark keeps
 * pointing that way and only changes colour.
 */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn(
        "shrink-0 transition-colors duration-200",
        open ? "text-deep-green" : "text-faint",
      )}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The label is the question; the value is the answer. The answer never gets
 * less room than the question.
 *
 * Measured failure this exists to delete: a `map` row 212px wide where the
 * label `what the code does` took 112px — 53% — and the value got 32px,
 * rendering one word per line over twelve lines. The most important comparison
 * on the card was the least readable thing on screen.
 *
 * The cause was a `shrink-0` label beside a `min-w-0 flex-1` value: the only
 * element in the row allowed to give up space was the one carrying the content.
 * A previous fix moved the state chip INSIDE the value column (see the comment
 * that survives in the `map` block), which was real but addressed the wrong
 * element — the label was still unbounded.
 *
 * Two rules from `lib/view.ts`, enforced together:
 *
 *   label ≤ ROW_LABEL_MAX_PCT (40%)   value ≥ ROW_VALUE_MIN_PX (160px)
 *
 * Below a certain row width both cannot hold at once, so rather than squeeze
 * the value under its floor the pair STACKS — label above value, each with the
 * full width. That threshold is a property of the ROW, not of the viewport: a
 * card is a fixed-width column on a canvas that pans, so a viewport breakpoint
 * would tell us nothing about the space this row actually has. Hence a
 * container query.
 *
 * The threshold below is 267px, and it is `ROW_VALUE_MIN_PX / (1 -
 * ROW_LABEL_MAX_PCT/100)` — the narrowest row on which a 40% label still
 * leaves 160px. It is written as a literal in the class strings because
 * Tailwind scans source statically: an interpolated `@min-[${n}px]:` is a
 * class name no build step ever sees, so it would compile to nothing and the
 * row would silently stay stacked at every width. The assertion keeps the
 * literal honest if either constant is ever retuned.
 */
const STACK_BELOW_PX = Math.ceil(ROW_VALUE_MIN_PX / (1 - ROW_LABEL_MAX_PCT / 100));
if (STACK_BELOW_PX !== 267) {
  throw new Error(
    `view.ts row rules changed: the @min-[267px] literals in anatomy.tsx must become @min-[${STACK_BELOW_PX}px]`,
  );
}

/**
 * Every pair row is its own query container. The row, not the card, is what
 * the rules are about — a card can be wide while a row inside a rail or an
 * indent is not.
 */
const PAIR_SCOPE = "@container";

/**
 * Side by side once the row can honour both rules; stacked when it cannot.
 *
 * The percentage cap is a MAX, not a width, so a short label keeps its natural
 * size and does not pad out to 40% leaving the value starved for no reason.
 */
// Each of these is ONE unbroken literal on purpose. Tailwind's scanner reads
// source text, not evaluated JavaScript: splitting a class list across a `+`
// hides every class after the operator, which compiles to nothing and fails
// silently — measured here, where only the one class that stayed inline in JSX
// survived into the stylesheet.
const PAIR_ROW = "flex w-full min-w-0 flex-col items-stretch gap-0.5 @min-[267px]:flex-row @min-[267px]:items-start @min-[267px]:gap-2";

/** The question side. Capped, never allowed to eat the row. */
const PAIR_LABEL = "min-w-0 text-left @min-[267px]:max-w-[40%] @min-[267px]:shrink-0";

/** The answer side. Floored, and it is the only side allowed to grow. */
const PAIR_VALUE = "w-full min-w-0 text-left @min-[267px]:w-auto @min-[267px]:flex-1 @min-[267px]:min-w-[160px]";

/** Shared row chrome: lit fill, dimmed-when-others-are-lit, click to trace. */
function rowClass(id: string, ctx: RowCtx, extra?: string) {
  const isLit = ctx.lit.has(id);
  return cn(
    "w-full text-left transition-all duration-200",
    isLit && "bg-mint-success",
    ctx.tracing && !isLit && "opacity-55",
    !ctx.tracing && "hover:bg-surface-container-low",
    extra,
  );
}

function Block({
  owner,
  block,
  ctx,
  headless,
}: {
  owner: string;
  block: Anatomy;
  ctx: RowCtx;
  headless?: boolean;
}) {
  if (block.kind === "schema") {
    return (
      <div className={headless ? "bg-pure-white" : "overflow-hidden rounded-[2px] border border-border-gray bg-pure-white"}>
        <div className={cn("flex items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5", headless && "hidden")}>
          <TableGlyph />
          <span className="font-mono text-[11px] font-semibold text-ink">
            {block.table}
          </span>
          <span className="ml-auto font-mono text-[10px] text-faint">
            {/* A schema named like a file (`map.json`) is a document's fields, not a table's columns. */}
            {block.rows.length} {/\.\w+$/.test(block.table) ? "fields" : "columns"}
          </span>
        </div>
        <div>
          {block.rows.map((c) => {
            const id = rowId(owner, c.name);
            const isLit = ctx.lit.has(id);
            return (
              <button
                key={c.name}
                ref={ctx.anchor(id)}
                data-row={id}
                onClick={() => ctx.onTrace(id)}
                className={rowClass(
                  id,
                  ctx,
                  cn(PAIR_SCOPE, "border-b border-border-gray px-3 py-1.5 last:border-b-0"),
                )}
              >
                {/* The column name, its type and its key are the question; the
                    note is the answer. The note was `truncate` against three
                    `shrink-0` siblings, so it was the one thing on the row
                    guaranteed to be cut — and it wraps now instead. */}
                <span className={PAIR_ROW}>
                  <span className={cn(PAIR_LABEL, "flex items-center gap-2")}>
                    <span
                      className={cn(
                        "min-w-0 font-mono text-[10.5px]",
                        isLit ? "font-semibold text-deep-green" : "text-on-surface",
                      )}
                    >
                      {c.name}
                      {c.nullable ? <span className="text-faint">?</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-slate">
                      {c.type}
                    </span>
                    {c.key ? <KeyTag k={c.key} lit={isLit} /> : null}
                  </span>
                  <span className={cn(PAIR_VALUE, "flex items-start gap-2")}>
                    {c.note ? (
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[10px] leading-snug @min-[267px]:text-right",
                          c.state === "derived" ? "text-faint" : "text-amber-ink",
                        )}
                      >
                        {c.note}
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1" />
                    )}
                    <StateChip state={c.state} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {block.rel?.length ? (
          <div className="border-t border-border-gray bg-surface-container-low px-3 py-2">
            {block.rel.map((r) => (
              <p
                key={r}
                className="text-[10px] leading-relaxed text-on-surface-variant"
              >
                {r}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (block.kind === "routes") {
    return (
      <div className="overflow-hidden rounded-[2px] border border-border-gray bg-pure-white">
        {block.rows.map((r) => {
          const id = rowId(owner, `${r.method} ${r.path}`);
          const isLit = ctx.lit.has(id);
          return (
            <button
              key={r.method + r.path}
              ref={ctx.anchor(id)}
              data-row={id}
              onClick={() => ctx.onTrace(id)}
              className={rowClass(
                id,
                ctx,
                cn(PAIR_SCOPE, "block border-b border-border-gray px-3 py-1.5 last:border-b-0"),
              )}
            >
              {/* The method is the label; the path is the answer, and it was
                  `truncate` — so the one string a reader needs in full was the
                  first thing cut. It wraps now, and the auth note drops to its
                  own line before the path has to give up any width. */}
              <span className={PAIR_ROW}>
                <span className={cn(PAIR_LABEL, "flex items-center gap-2")}>
                  <Method method={r.method} />
                  <span
                    className={cn(
                      "min-w-0 font-mono text-[10.5px] break-all",
                      isLit ? "font-semibold text-deep-green" : "text-on-surface",
                    )}
                  >
                    {r.path}
                  </span>
                </span>
                <span className={cn(PAIR_VALUE, "flex items-start gap-2")}>
                  <span className="min-w-0 flex-1 font-mono text-[9.5px] leading-snug text-faint @min-[267px]:text-right">
                    {r.auth}
                  </span>
                  <StateChip state={r.state} />
                </span>
              </span>
              {r.note ? (
                <span
                  className={cn(
                    "mt-0.5 block pl-[46px] text-[10px] leading-snug",
                    r.state === "derived" ? "text-faint" : "text-amber-ink",
                  )}
                >
                  {r.note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  if (block.kind === "source") {
    return <SourceView owner={owner} block={block} ctx={ctx} />;
  }

  if (isExplained(block)) return <ExplainedBlock block={block} />;

  if (block.kind === "chips") {
    return (
      <div className="rounded-[2px] border border-border-gray bg-pure-white px-3 py-2.5">
        {block.caption ? (
          <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">
            {block.caption}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {block.rows.map((c) => {
            const id = rowId(owner, c.label);
            const isLit = ctx.lit.has(id);
            return (
              <button
                key={c.label}
                ref={ctx.anchor(id)}
                data-row={id}
                onClick={() => ctx.onTrace(id)}
                title={c.note}
                className={cn(
                  "rounded-[2px] border px-2 py-1 font-mono text-[10px] transition-all duration-200",
                  ctx.tracing && !isLit && "opacity-55",
                  isLit
                    ? "border-deep-green bg-deep-green text-white"
                    : c.state === "derived"
                      ? "border-mint-line bg-mint-success text-deep-green"
                      : "border-amber-line bg-amber-surface text-amber-ink",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (block.kind === "map") return <MapRows owner={owner} block={block} ctx={ctx} />;

  if (block.kind === "parts") {
    // The ratio IS the finding. Segments are sized by real weight, so a 149KB
    // block next to a 1KB one looks like what it is — no amount of prose makes
    // that land the way a length does.
    const total = block.rows.reduce((sum, p) => sum + p.weight, 0) || 1;
    return (
      <div className="overflow-hidden rounded-[2px] border border-border-gray bg-pure-white">
        <div className="flex items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5">
          <span className="font-mono text-[11px] font-semibold text-ink">
            {block.total}
          </span>
          <span className="ml-auto font-mono text-[10px] text-faint">
            {block.rows.length} parts
          </span>
        </div>
        <div className="px-3 pb-2.5 pt-2.5">
          <div className="flex h-[22px] w-full overflow-hidden rounded-[2px]">
            {block.rows.map((p, at) => {
              const id = rowId(owner, p.label);
              const isLit = ctx.lit.has(id);
              return (
                <button
                  key={p.label}
                  ref={ctx.anchor(id)}
                  data-row={id}
                  onClick={() => ctx.onTrace(id)}
                  title={`${p.label} — ${p.display}`}
                  // Floored at 6%: a slice worth naming has to be visible, and
                  // a 1%-of-the-whole block rendered ~2px wide — present in the
                  // DOM, absent to the eye. The exact figure is in the legend;
                  // the bar's job is the contrast, not the arithmetic.
                  style={{ width: `${Math.max((p.weight / total) * 100, 6)}%` }}
                  className={cn(
                    "h-full border-r border-pure-white transition-all duration-200 last:border-r-0",
                    ctx.tracing && !isLit && "opacity-45",
                    isLit
                      ? "bg-deep-green"
                      : p.tone === "vary"
                        ? "bg-amber-line"
                        : // Alternating weights within the same family. Every
                          // "hold" slice sharing one mint made a 198px and a
                          // 33px segment read as a single bar with a hairline
                          // seam — measured, not guessed. The ratio only lands
                          // if adjacent slices are separable.
                          at % 2 === 0
                          ? "bg-deep-green/55"
                          : "bg-mint-line",
                  )}
                />
              );
            })}
          </div>
          {/* Legend, not a table: label and size on one line each. */}
          <ul className="mt-2 flex flex-col gap-1">
            {block.rows.map((p, at) => {
              const id = rowId(owner, p.label);
              const isLit = ctx.lit.has(id);
              return (
                <li key={p.label} className="flex items-center gap-2">
                  <span
                    // Same tone rule as the bar segment above, index included.
                    // A swatch is only a key if it is the colour it explains.
                    className={cn(
                      "size-[7px] shrink-0 rounded-[2px]",
                      isLit
                        ? "bg-deep-green"
                        : p.tone === "vary"
                          ? "bg-amber-line"
                          : at % 2 === 0
                            ? "bg-deep-green/55"
                            : "bg-mint-line",
                    )}
                  />
                  <span
                    className={cn(
                      // `min-w-0` so a long label wraps instead of shoving the
                      // figure past the right edge. The figure stays `shrink-0`
                      // because it is short and is the thing being compared.
                      "min-w-0 font-mono text-[10px]",
                      isLit ? "font-semibold text-deep-green" : "text-on-surface",
                    )}
                  >
                    {p.label}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-slate">
                    {p.display}
                  </span>
                  <StateChip state={p.state} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (block.kind === "bars") {
    // Comparison, not enumeration. Bars share one scale so the 250x gap
    // between an anonymous and a premium quota is visible rather than stated.
    const max = Math.max(...block.rows.map((b) => b.value), 1);
    return (
      <div className="overflow-hidden rounded-[2px] border border-border-gray bg-pure-white">
        <div className="flex items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
            {block.unit}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          {block.rows.map((b) => {
            const id = rowId(owner, b.label);
            const isLit = ctx.lit.has(id);
            return (
              <button
                key={b.label}
                ref={ctx.anchor(id)}
                data-row={id}
                onClick={() => ctx.onTrace(id)}
                className={rowClass(id, ctx, cn(PAIR_SCOPE, "rounded-[2px]"))}
              >
                {/* The label was `w-[92px]` and the figure `w-[108px]`: 200px
                    of fixed furniture either side of the bar, so on a narrow
                    card the TRACK — the only part that carries the comparison
                    — was what collapsed. Both are capped shares now, and the
                    pair stacks before the bar can be squeezed out. */}
                <span className={PAIR_ROW}>
                  <span
                    className={cn(
                      PAIR_LABEL,
                      "truncate font-mono text-[10px]",
                      isLit ? "font-semibold text-deep-green" : "text-on-surface",
                    )}
                  >
                    {b.label}
                  </span>
                  <span className={cn(PAIR_VALUE, "flex items-center gap-2")}>
                    {/* The track is the scale. Without it a short bar reads as
                        a small number rather than a small share. */}
                    <span className="h-[9px] min-w-0 flex-1 rounded-[2px] bg-surface-container">
                      <span
                        style={{ width: `${Math.max((b.value / max) * 100, 2)}%` }}
                        className={cn(
                          "block h-full rounded-[2px] transition-all duration-200",
                          isLit
                            ? "bg-deep-green"
                            : b.state === "derived"
                              ? "bg-mint-line"
                              : "bg-amber-line",
                        )}
                      />
                    </span>
                    <span className="shrink-0 text-right font-mono text-[9.5px] text-muted-slate">
                      {b.display}
                    </span>
                    <StateChip state={b.state} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (block.kind === "flow") {
    return (
      <ol className="flex flex-col">
        {block.rows.map((s, i) => {
          const id = rowId(owner, s.n);
          const isLit = ctx.lit.has(id);
          return (
            <li key={s.n} className="flex gap-2.5">
              {/* The rail: a numbered dot with a line to the next step, so the
                  sequence reads as one path rather than four cards. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-semibold transition-colors",
                    isLit
                      ? "border-deep-green bg-deep-green text-white"
                      : s.state === "derived"
                        ? "border-mint-line bg-mint-success text-deep-green"
                        : "border-amber-line bg-amber-surface text-amber-ink",
                  )}
                >
                  {s.n}
                </span>
                {i < block.rows.length - 1 ? (
                  <span className="w-px flex-1 bg-border-gray" />
                ) : null}
              </div>
              <button
                ref={ctx.anchor(id)}
                data-row={id}
                // See the map row above: the click must not reach the card.
                onClick={(e) => {
                  if (!s.under) return ctx.onTrace(id);
                  e.stopPropagation();
                  ctx.onOpenRow(id);
                }}
                className={rowClass(
                  id,
                  ctx,
                  cn(
                    "min-w-0 flex-1 rounded-[2px] px-1.5 py-0.5",
                    i < block.rows.length - 1 && "mb-2.5",
                  ),
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[11px] font-semibold leading-tight",
                      isLit || ctx.open === id ? "text-deep-green" : "text-ink",
                    )}
                  >
                    {s.title}
                  </span>
                  <StateChip state={s.state} />
                  {s.under ? (
                    <span className="ml-auto">
                      <Caret open={ctx.open === id} />
                    </span>
                  ) : null}
                </span>
                {/* A step that has somewhere to go shows its TITLE and nothing
                    else. Its `detail` is the level behind the click, and
                    printing it here painted the next level onto this one — 226
                    words on this card alone, measured, of which four paragraphs
                    were the four children it already had.

                    A step with no `under` keeps its line, because for that row
                    there is no deeper level to defer to and the sentence is the
                    whole fact. See LEVEL_WORD_BUDGET in lib/view.ts. */}
                {s.under ? null : (
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-on-surface-variant">
                    {s.detail}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return <Facts owner={owner} block={block} ctx={ctx} />;
}

function Facts({
  owner,
  block,
  ctx,
}: {
  owner: string;
  block: Extract<Anatomy, { kind: "facts" }>;
  ctx: RowCtx;
}) {

  return (
    <div className="overflow-hidden rounded-[2px] border border-border-gray bg-pure-white">
      {block.rows.map((p) => {
        const id = rowId(owner, p.label);
        const isLit = ctx.lit.has(id);
        return (
          <button
            key={p.label}
            ref={ctx.anchor(id)}
            data-row={id}
            onClick={() => ctx.onTrace(id)}
            className={rowClass(
              id,
              ctx,
              cn(PAIR_SCOPE, "border-b border-border-gray px-3 py-1.5 last:border-b-0"),
            )}
          >
            <span className={PAIR_ROW}>
              <span
                className={cn(
                  PAIR_LABEL,
                  "font-mono text-[10.5px]",
                  isLit ? "font-semibold text-deep-green" : "text-on-surface",
                )}
              >
                {p.label}
              </span>
              {/* Left-aligned: right-aligning a long value in a narrow column
                  produces a ragged staircase of 3-4 wrapped lines. */}
              <span className={cn(PAIR_VALUE, "flex items-start gap-2")}>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[10px] leading-snug",
                    p.state === "derived" ? "text-muted-slate" : "text-amber-ink",
                  )}
                >
                  {p.value}
                </span>
                <StateChip state={p.state} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The bottom of the map, read from the real repository.
 *
 * Three things are kept strictly apart, and the separation is the point:
 *
 *   the CODE       verbatim from a real file at a real line, read from disk
 *   the WHY        synthesized commentary, in its own tinted band
 *   the FINDING    when disk no longer says what the map quoted
 *
 * The fixture's text is still what renders first, so the card is readable
 * before any request finishes and readable at all if the repo is not there.
 * Once the read lands, disk wins — with a mark saying it drifted, if it did.
 * Silently swapping fresh code under a stale explanation is the exact failure
 * this project exists to study, so it is the one thing that cannot happen here.
 */
export function SourceView({
  owner,
  block,
  ctx,
}: {
  owner: string;
  block: Extract<Anatomy, { kind: "source" }>;
  ctx: RowCtx;
}) {
  const id = rowId(owner, "source");
  const isLit = ctx.lit.has(id);

  const quoted = block.code.replace(/\n$/, "");
  const end = block.start + quoted.split("\n").length - 1;

  const [slice, setSlice] = useState<Slice | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quoted);
  const [saved, setSaved] = useState<WriteResult | null>(null);
  const { name: map } = useMap();

  /**
   * One read of the repository, resolved to what the UI should show.
   *
   * Pure apart from the read: it sets no state, which is what lets the effect
   * below subscribe to it rather than call setState in its own body.
   */
  const read = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await readSource({ map, file: block.file, start: block.start, end, fixture: quoted }, signal);
        return "slice" in r ? { slice: r.slice, failed: null } : { slice: null, failed: r.refused };
      } catch {
        return { slice: null, failed: "unreachable" };
      }
    },
    [map, block.file, block.start, end, quoted],
  );

  // Aborted on unmount and whenever the block changes, so a slow response for
  // one source block can never land as the state of a different one.
  useEffect(() => {
    const ac = new AbortController();
    read(ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      setSlice(r.slice);
      setFailed(r.failed);
    });
    return () => ac.abort();
  }, [read]);

  // Disk is the truth once we have it; the fixture is the fallback.
  const shown = slice?.code ?? quoted;
  const lines = shown.split("\n");
  // Tokenized once per text, not per render: a 90-line slice re-scanned on
  // every trace or hover is work nobody asked for.
  const painted = useMemo(() => highlight(shown, langOf(block.file)), [shown, block.file]);
  const drifted = slice != null && !slice.matchesFixture;

  // Nothing is ever written without an explicit click, so this is only ever
  // reached from the save button's own handler. Never a blur, never a timer,
  // never navigation.
  async function save() {
    const res = await fetch("/api/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        map,
        file: block.file,
        start: block.start,
        end,
        code: draft,
        // What we read is what we claim is there. A write built on anything
        // else is the stale-read clobber the contract exists to refuse.
        expected: shown,
      }),
    });
    const body = (await res.json()) as WriteResult;
    setSaved(body);
    if (body.ok) {
      setEditing(false);
      // Re-read rather than trusting the draft: what is now on disk is the
      // only thing this card is allowed to show as the file's contents.
      const r = await read();
      setSlice(r.slice);
      setFailed(r.failed);
    }
  }

  return (
    <div
      data-pick={`${block.file}:${block.start}`}
      data-pick-code={`${block.file}:${block.start}-${end}`}
      className={cn(
        "overflow-hidden rounded-[2px] border bg-pure-white",
        drifted ? "border-amber-line" : isLit ? "border-deep-green" : "border-border-gray",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border-gray px-3 py-1.5",
          drifted ? "bg-amber-surface" : "bg-surface",
        )}
      >
        <button
          ref={ctx.anchor(id)}
          data-row={id}
          onClick={() => ctx.onTrace(id)}
          className={rowClass(id, ctx, "flex min-w-0 flex-1 items-center gap-2 rounded-[2px]")}
        >
          <FileGlyph />
          {/* file:line as one addressable string, not a path with a number
              stranded on the far side of the row. */}
          <span
            className={cn(
              "min-w-0 truncate text-left font-mono text-[11px]",
              isLit ? "font-semibold text-deep-green" : "text-on-surface",
            )}
          >
            {block.file}
            <span className="text-faint">:{block.start}</span>
          </span>
        </button>
        {/* "733 of 779 lines" — where this sits in the file, which a quote
            with no denominator cannot say. */}
        {slice ? (
          <span className="tnum shrink-0 font-mono text-[9.5px] text-faint">
            {block.start.toLocaleString()} of {slice.total.toLocaleString()} lines
          </span>
        ) : null}
        <CopyPath text={`${block.file}:${block.start}`} />
        {/* A static export has no repository to write to: it links to the code host instead. */}
        {SOURCE_URL ? (
          <a
            href={`${SOURCE_URL}/${block.file}#L${block.start}-L${end}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-[2px] border border-border-strong px-1.5 py-0.5 font-mono text-[9px] text-muted-slate transition-colors hover:text-on-surface"
          >
            github ↗
          </a>
        ) : (
          /* Read-only is the default. Editing is a control you go and press. */
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(shown);
              setSaved(null);
              setEditing((v) => !v);
            }}
            className={cn(
              "shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] transition-colors",
              editing
                ? "border-deep-green bg-deep-green text-white"
                : "border-border-strong text-muted-slate hover:text-on-surface",
            )}
          >
            {editing ? "cancel" : "edit"}
          </button>
        )}
      </div>

      {/* The finding, stated before the code it is about. */}
      {drifted ? (
        <p className="border-b border-amber-line bg-amber-surface px-3 py-1.5 text-[10px] leading-relaxed text-amber-ink">
          <span className="font-semibold">Drifted.</span> The file no longer says
          what the map quoted here. The code below is what is on disk now; the
          explanation under it was written about the older text.
        </p>
      ) : null}
      {failed ? (
        <p className="border-b border-border-gray bg-surface-container-low px-3 py-1.5 text-[10px] leading-relaxed text-muted-slate">
          Could not read the repository ({failed}). Showing the quote the map
          was authored with, which nothing has verified against disk.
        </p>
      ) : null}

      {editing ? (
        <div className="px-3 py-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={Math.min(lines.length + 2, 24)}
            className="w-full resize-y rounded-[2px] border border-border-strong bg-surface-container-low p-2 font-mono text-[11.5px] leading-[1.55] text-on-surface outline-none focus:border-deep-green"
          />
          {/* The diff is shown BEFORE the write, and the write needs this
              click. There is no other path to disk. */}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void save();
              }}
              disabled={draft === shown}
              className="rounded-[2px] bg-deep-green px-2 py-1 font-mono text-[10px] text-white disabled:opacity-40"
            >
              save to disk
            </button>
            <span className="font-mono text-[9.5px] text-faint">
              {draft === shown
                ? "no change"
                : `rewrites ${block.file}:${block.start}-${end}`}
            </span>
          </div>
          {draft !== shown ? <DraftDiff before={shown} after={draft} /> : null}
          {saved && !saved.ok ? (
            <p className="mt-2 text-[10px] leading-relaxed text-clay-ink">
              Refused: {saved.refused}
              {saved.refused === "stale"
                ? " — the file changed since this was read. Cancel and reopen to get the current text."
                : null}
            </p>
          ) : null}
        </div>
      ) : (
        /* Real line numbers, counting from the file's own offset. A gutter
           that restarts at 1 is a quiet lie about where this code lives.
           Coloured by lib/highlight.ts: the same reading a code editor gives,
           since this pane's whole job is to be read. */
        <div className="overflow-x-auto bg-code">
          <pre className="min-w-full py-2 font-mono text-[12.5px] leading-[1.65]">
            {painted.map((line, i) => (
              <div key={i} className="flex">
                <span className="tnum sticky left-0 shrink-0 select-none border-r border-border-gray bg-code pl-3 pr-2.5 text-right text-faint">
                  {block.start + i}
                </span>
                <code className="whitespace-pre pl-3 pr-4 text-code-plain">
                  {line.length ? (
                    line.map((t, j) => (
                      <span key={j} style={{ color: TOKEN_COLOR[t.kind] }}>
                        {t.text}
                      </span>
                    ))
                  ) : (
                    " "
                  )}
                </code>
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Commentary, in its own band, below the code, labelled. It is
          synthesized and must never be able to read as something the file
          says. */}
      {block.why ? (
        <div className="flex gap-2 border-t border-border-gray bg-surface-container-low px-3 py-2">
          <span className="mt-[3px] shrink-0 font-mono text-[9px] uppercase tracking-[0.09em] text-faint">
            why
          </span>
          <p className="text-[10px] leading-relaxed text-on-surface-variant">
            {block.why}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Line-wise diff of the pending edit, shown before anything is written. */
function DraftDiff({ before, after }: { before: string; after: string }) {
  const b = before.split("\n");
  const a = after.split("\n");
  return (
    <pre className="mt-2 overflow-x-auto rounded-[2px] border border-border-gray bg-pure-white py-1.5 font-mono text-[10.5px] leading-[1.5]">
      {b.map((l, i) => (
        <div key={`b${i}`} className="bg-clay-surface px-3 text-clay-ink">
          <span className="select-none">- </span>
          {l || " "}
        </div>
      ))}
      {a.map((l, i) => (
        <div key={`a${i}`} className="bg-mint-success px-3 text-deep-green">
          <span className="select-none">+ </span>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

/** Copies `file:line`, the string you paste into an editor or a message. */
function CopyPath({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text);
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1200);
      }}
      title={`Copy ${text}`}
      className="shrink-0 rounded-[2px] border border-border-strong px-1.5 py-0.5 font-mono text-[9px] text-muted-slate transition-colors hover:text-on-surface"
    >
      {done ? "copied" : "copy path"}
    </button>
  );
}

function KeyTag({ k, lit }: { k: "PK" | "FK" | "UQ"; lit?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[2px] px-1 py-px font-mono text-[8.5px] font-semibold leading-none",
        lit
          ? "bg-pure-white text-deep-green ring-1 ring-deep-green/45"
          : k === "PK"
            ? "bg-mint-success text-deep-green"
            : "bg-surface-container text-muted-slate",
      )}
    >
      {k}
    </span>
  );
}

const METHOD_TONE: Record<string, string> = {
  GET: "bg-surface-container text-muted-slate",
  POST: "bg-mint-success text-deep-green",
  PATCH: "bg-amber-surface text-amber-ink",
  DELETE: "bg-clay-surface text-clay-ink",
};

function Method({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "w-[42px] shrink-0 rounded-[2px] px-1 py-px text-center font-mono text-[8.5px] font-semibold leading-[1.4]",
        METHOD_TONE[method],
      )}
    >
      {method}
    </span>
  );
}

function FileGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 1.5h3.5L9 4v6.5H3z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        className="text-muted-slate"
      />
      <path d="M6.4 1.6V4.2H9" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" className="text-muted-slate" />
    </svg>
  );
}

export function TableGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
      <path d="M1 4.5h10M4.5 4.5v6" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
    </svg>
  );
}

/**
 * A `map` block as a list of names. Each row's `to` stays folded until the
 * reader asks for it, so the block reads as the set of cases first and the
 * detail of one case second, instead of a wall of arrows.
 */
function MapRows({ owner, block, ctx }: { owner: string; block: Extract<Anatomy, { kind: "map" }>; ctx: RowCtx }) {
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const toggle = (from: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (!next.delete(from)) next.add(from);
      return next;
    });
  return (
    <div className="overflow-hidden rounded-[2px] border border-border-gray bg-pure-white">
      {block.caption ? (
        <div className="border-b border-border-gray bg-surface px-3 py-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">
            {block.caption}
          </span>
        </div>
      ) : null}
      {block.rows.map((m) => {
        const id = rowId(owner, m.from);
        const isLit = ctx.lit.has(id);
        const isOpen = ctx.open === id;
        // A row with a level of its own shows its detail while that level is open.
        const expanded = shown.has(m.from) || isOpen;
        return (
          <div key={m.from} className="border-b border-border-gray last:border-b-0">
            <button
              ref={ctx.anchor(id)}
              data-row={id}
              aria-expanded={expanded}
              // The card wrapping these rows is itself clickable, and a real
              // pointer click bubbles: without stopping it here, the card's
              // handler fires on the SAME click and undoes the row's.
              onClick={(e) => {
                e.stopPropagation();
                if (m.under) return ctx.onOpenRow(id);
                toggle(m.from);
                ctx.onTrace(id);
              }}
              className={rowClass(id, ctx, "flex w-full items-start gap-2 px-3 py-1.5 text-left")}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "inline-block rounded-[2px] px-1.5 py-0.5 font-mono text-[10px]",
                    isLit || isOpen ? "bg-deep-green text-white" : "bg-surface-container text-on-surface",
                  )}
                >
                  {m.from}
                </span>
                {m.state !== "derived" ? <StateChip state={m.state} className="ml-1.5 align-[1px]" /> : null}
                {expanded ? (
                  <span
                    className={cn(
                      "mt-1.5 mb-0.5 block border-l-2 pl-2 font-mono text-[9.5px] leading-snug",
                      m.state === "derived" ? "border-border-strong text-muted-slate" : "border-amber-line text-amber-ink",
                    )}
                  >
                    {m.to}
                  </span>
                ) : null}
              </span>
              {/* Turns down when the row unfolds in place; a row that opens a
                  level points right like every other way down. */}
              <span className={cn("mt-[3px] shrink-0 transition-transform duration-200", expanded && !m.under && "rotate-90")}>
                <Caret open={expanded} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
