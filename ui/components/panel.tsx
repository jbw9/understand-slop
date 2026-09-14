import { cn } from "@/lib/utils";

/**
 * The panel/row vocabulary: a soft-radius container on the cream ground, with
 * hairline-separated rows inside it. Rows never carry their own border — the
 * separation comes from the parent, so a list of ten reads as one object.
 */

export function Panel({
  children,
  className,
  flush,
}: {
  children: React.ReactNode;
  className?: string;
  /** Remove inner padding when the panel holds edge-to-edge rows. */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[20px] border border-border-gray bg-pure-white shadow-panel",
        !flush && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  note,
  right,
  className,
}: {
  title: string;
  note?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start gap-4 border-b border-border-gray bg-surface px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {note ? (
          <p className="mt-1 text-[13px] leading-snug text-muted-slate">{note}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}

/**
 * A single fact row. `tone` tints the whole row for the states that need it —
 * used sparingly, so a tinted row actually means something.
 */
export function Row({
  children,
  tone = "plain",
  onClick,
  active,
  className,
}: {
  children: React.ReactNode;
  tone?: "plain" | "mint" | "amber" | "clay";
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border-gray px-5 py-3 text-left last:border-b-0",
        "transition-colors duration-150",
        tone === "plain" && "bg-pure-white",
        tone === "mint" && "bg-mint-success/45",
        tone === "amber" && "bg-amber-surface/70",
        tone === "clay" && "bg-clay-surface/80",
        onClick && "cursor-pointer hover:bg-surface-container-low",
        active && "bg-surface-container-low",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * The value chip — a rounded pill holding a number or short value at the right
 * edge of a row. The emphasized variant is for the figure the row is about.
 */
export function Chip({
  children,
  emphasis = "normal",
  className,
}: {
  children: React.ReactNode;
  emphasis?: "normal" | "strong" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum inline-flex shrink-0 items-center rounded-full px-3 py-[5px]",
        "font-mono text-[12.5px] leading-none",
        emphasis === "normal" &&
          "border border-border-gray bg-pure-white text-on-surface",
        emphasis === "strong" &&
          "border border-mint-line bg-mint-success text-deep-green",
        emphasis === "muted" && "text-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}
