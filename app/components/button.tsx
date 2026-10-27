import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's one button. Every action on a level, in a dialog and in the
 * workspace is one of three weights, so a header with three actions reads as
 * a toolbar rather than three components that happened to land together:
 *
 * - `outline` — the default: a white face and a hairline, for actions on the
 *   page (View the code, Keep the answer).
 * - `ghost` — no face until hovered, for chrome (tab bars, the status bar).
 * - `primary` — filled green, the one thing a dialog is for.
 *
 * `tone="alarm"` recolours any of them for actions about problems.
 */
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "outline" | "ghost" | "primary";
  size?: "sm" | "md";
  tone?: "alarm";
  /** Drawn before the label. */
  icon?: React.ReactNode;
  /** A key that does the same thing, shown after the label. */
  kbd?: string;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "outline", size = "md", tone, icon, kbd, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[6px] font-sans font-medium transition-[background-color,border-color,color] duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green/70",
        "disabled:cursor-default disabled:opacity-50",
        size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
        variant === "outline" &&
          (tone === "alarm"
            ? "border border-clay-line bg-pure-white text-clay-ink hover:bg-clay-surface"
            : "border border-border-gray bg-pure-white text-on-surface-variant hover:border-border-strong hover:bg-surface-container-low hover:text-ink"),
        variant === "ghost" &&
          (tone === "alarm"
            ? "text-clay-ink hover:bg-clay-surface"
            : "text-muted-slate hover:bg-surface-container hover:text-ink"),
        variant === "primary" && "bg-deep-green text-white hover:bg-brand",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {kbd ? <Kbd className="ml-1">{kbd}</Kbd> : null}
    </button>
  );
});

/** A key, as the app writes one everywhere: in tooltips, the palette, the status bar. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border-gray bg-surface px-1 font-sans text-[10.5px] font-medium leading-none text-muted-slate",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** The `</>` mark for anything that opens code. */
export function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" />
    </svg>
  );
}
