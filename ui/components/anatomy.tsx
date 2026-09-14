"use client";

import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state";
import type { Anatomy, State } from "@/lib/data";

/**
 * Level 2 renders in the SHAPE of the thing it describes.
 *
 * A database capability shows columns with types and keys. An API capability
 * shows a route table. A pipeline shows ordered steps. Flattening all three
 * into one prose paragraph would throw away exactly the structure that makes
 * each of them legible at a glance.
 *
 * Every row keeps its own state, because provenance is the point: a column read
 * from a migration is derived, a relationship guessed from a naming convention
 * is inferred, and the two must never look alike.
 */

export function AnatomyView({ blocks }: { blocks: Anatomy[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: Anatomy }) {
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
        <table className="w-full border-collapse">
          <tbody>
            {block.rows.map((c) => (
              <tr
                key={c.name}
                className="border-b border-border-gray last:border-b-0"
              >
                <td className="whitespace-nowrap py-1.5 pl-3 pr-2 align-top font-mono text-[10.5px] text-on-surface">
                  {c.name}
                  {c.nullable ? <span className="text-faint">?</span> : null}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 align-top font-mono text-[10.5px] text-muted-slate">
                  {c.type}
                </td>
                <td className="w-8 py-1.5 pr-2 align-top">
                  {c.key ? <KeyTag k={c.key} /> : null}
                </td>
                <td className="py-1.5 pr-3 align-top">
                  <div className="flex items-start justify-end gap-1.5">
                    {c.note ? (
                      <span
                        className={cn(
                          "text-right text-[10px] leading-snug",
                          c.state === "derived" ? "text-faint" : "text-amber-ink",
                        )}
                      >
                        {c.note}
                      </span>
                    ) : null}
                    <StateChip state={c.state} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        {block.rows.map((r) => (
          <div
            key={r.method + r.path}
            className="border-b border-border-gray px-3 py-1.5 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <Method method={r.method} />
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-on-surface">
                {r.path}
              </span>
              <span className="shrink-0 font-mono text-[9.5px] text-faint">
                {r.auth}
              </span>
              <StateChip state={r.state} />
            </div>
            {r.note ? (
              <p
                className={cn(
                  "mt-0.5 pl-[46px] text-[10px] leading-snug",
                  r.state === "derived" ? "text-faint" : "text-amber-ink",
                )}
              >
                {r.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (block.kind === "flow") {
    return (
      <ol className="flex flex-col">
        {block.rows.map((s, i) => (
          <li key={s.n} className="flex gap-2.5">
            {/* The rail: a numbered dot with a line running to the next step,
                so the sequence reads as one path rather than four cards. */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-semibold",
                  s.state === "derived"
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
            <div className={cn("min-w-0 flex-1", i < block.rows.length - 1 && "pb-2.5")}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold leading-tight text-ink">
                  {s.title}
                </span>
                <StateChip state={s.state} />
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-on-surface-variant">
                {s.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border-gray bg-pure-white">
      {block.rows.map((p) => (
        <div
          key={p.label}
          className="flex items-start gap-3 border-b border-border-gray px-3 py-1.5 last:border-b-0"
        >
          <span className="shrink-0 font-mono text-[10.5px] text-on-surface">
            {p.label}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 text-right text-[10px] leading-snug",
              p.state === "derived" ? "text-muted-slate" : "text-amber-ink",
            )}
          >
            {p.value}
          </span>
          <StateChip state={p.state} />
        </div>
      ))}
    </div>
  );
}

function KeyTag({ k }: { k: "PK" | "FK" | "UQ" }) {
  return (
    <span
      className={cn(
        "rounded-[4px] px-1 py-px font-mono text-[8.5px] font-semibold leading-none",
        k === "PK" && "bg-mint-success text-deep-green",
        k === "FK" && "bg-surface-container text-muted-slate",
        k === "UQ" && "bg-surface-container text-muted-slate",
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

export type { State };
