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

function TableGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
      <path d="M1 4.5h10M4.5 4.5v6" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
    </svg>
  );
}
