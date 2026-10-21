"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { STATE_MEANING } from "@/lib/view";
import { Eyebrow } from "@/components/state";

/**
 * Orientation chrome: the three things the board had none of.
 *
 * Driven in Chrome, three levels deep, the screen carried no title, no
 * breadcrumb, no legend and no back control — nothing but cards on a dot grid.
 * There was no way to answer "where am I" except from memory, which is exactly
 * the failure this project exists to fix. Everything here is fixed-position
 * outside the scrolling level, so it never moves away.
 */

/**
 * Where you are, and the way back — a rail down the left edge.
 *
 * This is the sentence you say out loud when someone asks what you are looking
 * at — "taxBuddy, eligibility, the five-year rule". Reconstructing that from
 * memory under questioning is the thing that went wrong at the interview this
 * project came out of, so it is on screen permanently.
 *
 * A rail rather than a one-line breadcrumb because the levels go deep: a
 * stacked path never has to elide the middle, and each stop keeps its step
 * number, so "4 Extraction" still says where on the filer's path you went in.
 */
export function Trail({
  repo,
  meta,
  crumbs,
  onJump,
}: {
  repo: string;
  meta: string;
  /** One entry per level below the repo, outermost first. */
  crumbs: { id: string; title: string; step?: number }[];
  /** Jump to depth `n` — 0 is the repo. */
  onJump: (depth: number) => void;
}) {
  const stops = [{ id: "", title: repo, step: undefined as number | undefined }, ...crumbs];
  return (
    <nav
      aria-label="Location"
      className="flex w-[232px] shrink-0 flex-col border-r border-border-gray bg-pure-white/70 px-3 pb-4 pt-6"
    >
      <ol className="flex flex-col">
        {stops.map((c, i) => {
          const here = i === stops.length - 1;
          return (
            <li key={c.id || "repo"} className="flex gap-2.5">
              {/* The rail: a dot per level and a line to the next, so the
                  path reads as one descent rather than a list. */}
              <div className="flex w-[14px] shrink-0 flex-col items-center pt-[9px]">
                <span
                  className={cn(
                    "size-[7px] shrink-0 rounded-full",
                    here ? "bg-deep-green" : "bg-border-strong",
                  )}
                />
                {i < stops.length - 1 ? <span className="mt-1 w-px flex-1 bg-border-gray" /> : null}
              </div>
              <button
                onClick={() => onJump(i)}
                disabled={here}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "mb-1 min-w-0 flex-1 rounded-[8px] px-2 py-1 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green",
                  here ? "bg-mint-success/60" : "hover:bg-surface-container-low",
                )}
              >
                <span
                  className={cn(
                    "block truncate",
                    i === 0 ? "font-mono text-[12px]" : "text-[13px]",
                    here ? "font-semibold text-deep-green" : "text-muted-slate",
                  )}
                >
                  {c.step ? <span className="mr-1.5 font-mono text-[10.5px] text-faint">{c.step}</span> : null}
                  {c.title}
                </span>
                {i === 0 ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-faint">{meta}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Bottom padding clears Next's dev badge, which sits in this corner. */}
      <div className="mt-auto flex flex-col gap-3 pb-12">
        <Legend />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 font-mono text-[10.5px] text-faint">
          <Hint k="esc">back</Hint>
          <Hint k="0">top</Hint>
          <span>or swipe back</span>
        </div>
      </div>
    </nav>
  );
}

/**
 * What the marks mean.
 *
 * 7 of 10 root cards read `partial`, and with nothing on screen defining the
 * word the board reads as "mostly broken" rather than "honestly bounded". The
 * distinction is the whole point of the three states (D3), and it was being
 * carried by a chip nobody could decode.
 *
 * Collapsed to a single line by default so it stays quiet; the meanings are one
 * click away rather than permanently occupying the corner.
 */
export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="overflow-hidden rounded-[14px] border border-border-gray bg-pure-white/92 shadow-panel backdrop-blur">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green"
        >
          <Eyebrow>how sure</Eyebrow>
          <span className="flex items-center gap-1.5">
            <Swatch kind="derived" />
            <Swatch kind="partial" />
            <Swatch kind="inferred" />
          </span>
          <span aria-hidden className="text-[10px] text-faint">
            {open ? "▾" : "▸"}
          </span>
        </button>

        {open ? (
          <dl className="border-t border-border-gray px-3.5 py-3">
            {(["derived", "partial", "inferred"] as const).map((k) => (
              <div key={k} className="flex gap-2.5 py-1.5">
                <dt className="shrink-0 pt-[3px]">
                  <Swatch kind={k} labelled />
                </dt>
                <dd className="text-[11.5px] leading-snug text-muted-slate">
                  {STATE_MEANING[k]}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One state as a swatch. Mirrors `StateChip`'s material exactly — fill and
 * stroke vary, nothing else — so the legend and the board cannot drift apart.
 */
function Swatch({
  kind,
  labelled,
}: {
  kind: "derived" | "partial" | "inferred";
  labelled?: boolean;
}) {
  const box = cn(
    "inline-block h-[11px] w-[11px] rounded-[3px]",
    kind === "derived" && "border border-border-gray bg-pure-white",
    kind === "partial" && "border border-amber-line bg-amber-surface",
    kind === "inferred" && "border border-dashed border-border-strong bg-surface-container-low",
  );

  if (!labelled) return <span aria-hidden className={box} />;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={box} />
      <span className="font-mono text-[10px] leading-none text-on-surface">
        {kind}
      </span>
    </span>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-border-gray bg-surface px-1.5 py-0.5 text-[10px] text-muted-slate">
        {k}
      </kbd>
      {children}
    </span>
  );
}
