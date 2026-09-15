"use client";

import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state";
import { rowId, type Anatomy } from "@/lib/data";

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
}

export function AnatomyView({
  owner,
  blocks,
  ctx,
}: {
  owner: string;
  blocks: Anatomy[];
  ctx: RowCtx;
}) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <Block key={i} owner={owner} block={block} ctx={ctx} />
      ))}
    </div>
  );
}

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
}: {
  owner: string;
  block: Anatomy;
  ctx: RowCtx;
}) {
  if (block.kind === "schema") {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
        <div className="flex items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5">
          <TableGlyph />
          <span className="font-mono text-[11px] font-semibold text-ink">
            {block.table}
          </span>
          <span className="ml-auto font-mono text-[10px] text-faint">
            {block.rows.length} columns
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
                data-row
                onClick={() => ctx.onTrace(id)}
                className={rowClass(
                  id,
                  ctx,
                  "flex items-center gap-2 border-b border-border-gray px-3 py-1.5 last:border-b-0",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10.5px]",
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
                <span className="min-w-0 flex-1" />
                {c.note ? (
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-right text-[10px] leading-snug",
                      c.state === "derived" ? "text-faint" : "text-amber-ink",
                    )}
                    title={c.note}
                  >
                    {c.note}
                  </span>
                ) : null}
                <StateChip state={c.state} />
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
      <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
        {block.rows.map((r) => {
          const id = rowId(owner, `${r.method} ${r.path}`);
          const isLit = ctx.lit.has(id);
          return (
            <button
              key={r.method + r.path}
              ref={ctx.anchor(id)}
              data-row
              onClick={() => ctx.onTrace(id)}
              className={rowClass(
                id,
                ctx,
                "block border-b border-border-gray px-3 py-1.5 last:border-b-0",
              )}
            >
              <span className="flex items-center gap-2">
                <Method method={r.method} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[10.5px]",
                    isLit ? "font-semibold text-deep-green" : "text-on-surface",
                  )}
                >
                  {r.path}
                </span>
                <span className="shrink-0 font-mono text-[9.5px] text-faint">
                  {r.auth}
                </span>
                <StateChip state={r.state} />
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
    // The bottom of the map. Two things are kept strictly apart: the code,
    // which is quoted verbatim from a real file at a real line, and the `why`,
    // which is synthesized. Commentary gets its own tinted band below the
    // code so it can never be misread as something the file says.
    const lines = block.code.replace(/\n$/, "").split("\n");
    const id = rowId(owner, "source");
    const isLit = ctx.lit.has(id);
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[10px] border bg-pure-white",
          isLit ? "border-deep-green" : "border-border-gray",
        )}
      >
        <button
          ref={ctx.anchor(id)}
          data-row
          onClick={() => ctx.onTrace(id)}
          className={rowClass(
            id,
            ctx,
            "flex w-full items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5",
          )}
        >
          <FileGlyph />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left font-mono text-[10.5px]",
              isLit ? "font-semibold text-deep-green" : "text-on-surface",
            )}
          >
            {block.file}
          </span>
          <span className="shrink-0 font-mono text-[9.5px] text-faint">
            :{block.start}
          </span>
        </button>
        {/* Real line numbers, counting from the file's own offset. A gutter
            that restarts at 1 is a quiet lie about where this code lives. */}
        <div className="overflow-x-auto">
          <pre className="min-w-full py-1.5 font-mono text-[10px] leading-[1.55]">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="tnum sticky left-0 shrink-0 select-none bg-pure-white pl-3 pr-2.5 text-right text-faint">
                  {block.start + i}
                </span>
                <code className="whitespace-pre pr-3 text-on-surface">
                  {line || " "}
                </code>
              </div>
            ))}
          </pre>
        </div>
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

  if (block.kind === "chips") {
    return (
      <div className="rounded-[10px] border border-border-gray bg-pure-white px-3 py-2.5">
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
                data-row
                onClick={() => ctx.onTrace(id)}
                title={c.note}
                className={cn(
                  "rounded-[6px] border px-2 py-1 font-mono text-[10px] transition-all duration-200",
                  ctx.tracing && !isLit && "opacity-55",
                  isLit
                    ? "border-deep-green bg-deep-green text-pure-white"
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

  if (block.kind === "map") {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
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
          return (
            <button
              key={m.from}
              ref={ctx.anchor(id)}
              data-row
              onClick={() => ctx.onTrace(id)}
              className={rowClass(
                id,
                ctx,
                "flex w-full items-center gap-2 border-b border-border-gray px-3 py-1.5 last:border-b-0",
              )}
            >
              <span
                className={cn(
                  "shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px]",
                  isLit
                    ? "bg-deep-green text-pure-white"
                    : "bg-surface-container text-on-surface",
                )}
              >
                {m.from}
              </span>
              {/* The arrow carries the relationship, so the text doesn't
                  have to say "becomes". */}
              <span className="shrink-0 font-mono text-[11px] text-faint">→</span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-left font-mono text-[9.5px] leading-snug",
                  m.state === "derived" ? "text-muted-slate" : "text-amber-ink",
                )}
              >
                {m.to}
              </span>
              <StateChip state={m.state} />
            </button>
          );
        })}
      </div>
    );
  }

  if (block.kind === "parts") {
    // The ratio IS the finding. Segments are sized by real weight, so a 149KB
    // block next to a 1KB one looks like what it is — no amount of prose makes
    // that land the way a length does.
    const total = block.rows.reduce((sum, p) => sum + p.weight, 0) || 1;
    return (
      <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
        <div className="flex items-center gap-2 border-b border-border-gray bg-surface px-3 py-1.5">
          <span className="font-mono text-[11px] font-semibold text-ink">
            {block.total}
          </span>
          <span className="ml-auto font-mono text-[10px] text-faint">
            {block.rows.length} parts
          </span>
        </div>
        <div className="px-3 pb-2.5 pt-2.5">
          <div className="flex h-[22px] w-full overflow-hidden rounded-[5px]">
            {block.rows.map((p) => {
              const id = rowId(owner, p.label);
              const isLit = ctx.lit.has(id);
              return (
                <button
                  key={p.label}
                  ref={ctx.anchor(id)}
                  data-row
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
                        ? // The thing being contrasted. Hatched rather than
                          // merely a lighter green, because two mints side by
                          // side read as one bar with a seam in it.
                          "bg-amber-line"
                        : "bg-mint-line",
                  )}
                />
              );
            })}
          </div>
          {/* Legend, not a table: label and size on one line each. */}
          <ul className="mt-2 flex flex-col gap-1">
            {block.rows.map((p) => {
              const id = rowId(owner, p.label);
              const isLit = ctx.lit.has(id);
              return (
                <li key={p.label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-[7px] shrink-0 rounded-[2px]",
                      isLit
                        ? "bg-deep-green"
                        : p.tone === "vary"
                          ? "bg-amber-line"
                          : "bg-mint-line",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[10px]",
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
      <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
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
                data-row
                onClick={() => ctx.onTrace(id)}
                className={rowClass(id, ctx, "flex items-center gap-2 rounded-[5px]")}
              >
                <span
                  className={cn(
                    "w-[92px] shrink-0 truncate text-left font-mono text-[10px]",
                    isLit ? "font-semibold text-deep-green" : "text-on-surface",
                  )}
                >
                  {b.label}
                </span>
                {/* The track is the scale. Without it a short bar reads as a
                    small number rather than a small share. */}
                <span className="h-[9px] min-w-0 flex-1 rounded-[3px] bg-surface-container">
                  <span
                    style={{ width: `${Math.max((b.value / max) * 100, 2)}%` }}
                    className={cn(
                      "block h-full rounded-[3px] transition-all duration-200",
                      isLit
                        ? "bg-deep-green"
                        : b.state === "derived"
                          ? "bg-mint-line"
                          : "bg-amber-line",
                    )}
                  />
                </span>
                <span className="w-[108px] shrink-0 text-right font-mono text-[9.5px] text-muted-slate">
                  {b.display}
                </span>
                <StateChip state={b.state} />
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
                      ? "border-deep-green bg-deep-green text-pure-white"
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
                data-row
                onClick={() => ctx.onTrace(id)}
                className={rowClass(
                  id,
                  ctx,
                  cn(
                    "min-w-0 flex-1 rounded-[6px] px-1.5 py-0.5",
                    i < block.rows.length - 1 && "mb-2.5",
                  ),
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[11px] font-semibold leading-tight",
                      isLit ? "text-deep-green" : "text-ink",
                    )}
                  >
                    {s.title}
                  </span>
                  <StateChip state={s.state} />
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-on-surface-variant">
                  {s.detail}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
      {block.rows.map((p) => {
        const id = rowId(owner, p.label);
        const isLit = ctx.lit.has(id);
        return (
          <button
            key={p.label}
            ref={ctx.anchor(id)}
            data-row
            onClick={() => ctx.onTrace(id)}
            className={rowClass(
              id,
              ctx,
              "flex items-start gap-3 border-b border-border-gray px-3 py-1.5 last:border-b-0",
            )}
          >
            <span
              className={cn(
                "shrink-0 font-mono text-[10.5px]",
                isLit ? "font-semibold text-deep-green" : "text-on-surface",
              )}
            >
              {p.label}
            </span>
            {/* Left-aligned: right-aligning a long value in a narrow column
                produces a ragged staircase of 3-4 wrapped lines. */}
            <span
              className={cn(
                "min-w-0 flex-1 text-left text-[10px] leading-snug",
                p.state === "derived" ? "text-muted-slate" : "text-amber-ink",
              )}
            >
              {p.value}
            </span>
            <StateChip state={p.state} />
          </button>
        );
      })}
    </div>
  );
}

function KeyTag({ k, lit }: { k: "PK" | "FK" | "UQ"; lit?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[4px] px-1 py-px font-mono text-[8.5px] font-semibold leading-none",
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
        "w-[42px] shrink-0 rounded-[4px] px-1 py-px text-center font-mono text-[8.5px] font-semibold leading-[1.4]",
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

function TableGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
      <path d="M1 4.5h10M4.5 4.5v6" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
    </svg>
  );
}
