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
 * overlay; none of it lives in the camera transform, so it never pans away.
 */

/**
 * Where you are, and the way back.
 *
 * This is the sentence you say out loud when someone asks what you are looking
 * at — "taxBuddy, eligibility, the five-year rule". Reconstructing that from
 * memory under questioning is the thing that went wrong at the interview this
 * project came out of, so it is on screen permanently rather than implied by
 * the camera position.
 *
 * Every crumb is clickable and goes to that depth. The last one is where you
 * are and is not a button.
 */
export function Breadcrumb({
  repo,
  trail,
  onJump,
}: {
  repo: string;
  /** One entry per level below the root, outermost first. */
  trail: { id: string; title: string }[];
  /** Jump to depth `n` — 0 is the overview. */
  onJump: (depth: number) => void;
}) {
  return (
    <nav
      aria-label="Location"
      className="pointer-events-auto fixed left-5 top-4 z-30 flex max-w-[min(680px,60vw)] items-center gap-1.5 rounded-full border border-border-gray bg-pure-white/92 px-3 py-1.5 shadow-panel backdrop-blur"
    >
      <button
        onClick={() => onJump(0)}
        className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[11.5px] text-muted-slate transition-colors hover:bg-surface-container-low hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green"
      >
        {repo}
      </button>
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={c.id} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="shrink-0 text-[11px] text-faint">
              ›
            </span>
            {last ? (
              <span
                aria-current="page"
                className="truncate text-[12.5px] font-semibold text-ink"
              >
                {c.title}
              </span>
            ) : (
              <button
                onClick={() => onJump(i + 1)}
                className="max-w-[160px] truncate rounded-full px-2 py-0.5 text-[12.5px] text-muted-slate transition-colors hover:bg-surface-container-low hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green"
              >
                {c.title}
              </button>
            )}
          </span>
        );
      })}
      {trail.length > 0 ? (
        <kbd className="ml-1 shrink-0 rounded border border-border-gray bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint">
          esc
        </kbd>
      ) : null}
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
    <div className="pointer-events-auto fixed bottom-4 right-5 z-30">
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
                <dd className="max-w-[260px] text-[11.5px] leading-snug text-muted-slate">
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

/**
 * The keys that already worked and nothing advertised.
 *
 * Escape, `0`, `+` and `-` were all wired in the canvas and entirely
 * undiscoverable — a reader three levels deep had no way to know Escape would
 * bring them back.
 */
export function KeyHints() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-5 z-30 flex items-center gap-2.5 rounded-full border border-border-gray bg-pure-white/80 px-3 py-1.5 font-mono text-[10.5px] text-faint shadow-panel backdrop-blur">
      <Hint k="esc">back</Hint>
      <Hint k="0">fit</Hint>
      <Hint k="+ −">zoom</Hint>
      <span>drag to pan</span>
    </div>
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
