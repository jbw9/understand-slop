import { cn } from "@/lib/utils";
import type { State } from "@/lib/data";

/**
 * The three states, rendered as a material property rather than a badge.
 *
 * `derived` is the baseline and carries no mark at all — marking certainty is
 * what creates a two-tier read where anything unmarked looks like a failure.
 * `partial` gets a solid amber edge; `inferred` gets a dashed one. Same type
 * size, same height, same font across all three: only fill and stroke vary.
 */

export function StateChip({
  state,
  alarm,
  className,
}: {
  state: State;
  alarm?: boolean;
  className?: string;
}) {
  if (state === "derived") return null;

  const label = state === "partial" ? "partial" : "inferred";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-[3px]",
        "font-mono text-[10px] leading-none tracking-wide",
        state === "partial" && !alarm && "border border-amber-line bg-amber-surface text-amber-ink",
        state === "partial" && alarm && "border border-clay-line bg-clay-surface text-clay-ink",
        state === "inferred" && "border border-dashed border-border-strong bg-surface-container-low text-muted-slate",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Small uppercase section label — the eyebrow above a group of rows. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10.5px] uppercase leading-none tracking-[0.09em] text-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Monospace code identifier inline in prose. */
export function Ident({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[5px] bg-surface-container px-[5px] py-[1px] font-mono text-[0.86em] text-on-surface-variant">
      {children}
    </code>
  );
}
