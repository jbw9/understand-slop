import { forwardRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's one button. Every action on a level, in a dialog and in the
 * workspace is one of three weights, so a header with three actions reads as
 * a toolbar rather than three components that happened to land together:
 *
 * - `outline` — the default: a paper face and a hairline, for actions on the
 *   page (View the code, Keep the answer). On hover it fills with ink, as
 *   the landing page's buttons do.
 * - `ghost` — no face until hovered, for chrome (tab bars, the status bar).
 * - `primary` — filled with ink, the one thing a dialog is for.
 *
 * `tone="alarm"` recolours any of them for actions about problems.
 */
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "outline" | "ghost" | "primary";
  size?: "sm" | "md";
  tone?: "alarm";
  /** Drawn before the label. */
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "outline", size = "md", tone, icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap font-mono font-medium uppercase tracking-[0.04em] transition-[background-color,border-color,color] duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
        "disabled:cursor-default disabled:opacity-50",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[11.5px]",
        variant === "outline" &&
          (tone === "alarm"
            ? "border border-clay-line bg-card text-clay-ink hover:border-clay-ink hover:bg-clay-ink hover:text-paper"
            : "border border-border-strong bg-card text-ink hover:border-accent hover:bg-accent hover:text-on-accent"),
        variant === "ghost" &&
          (tone === "alarm"
            ? "text-clay-ink hover:bg-clay-surface"
            : "text-muted-slate hover:bg-surface-container hover:text-ink"),
        variant === "primary" && "border border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

const noSubscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** Whether keys are a Mac's. False on the server, so the first paint hydrates, then the truth. */
export const useMac = () => useSyncExternalStore(noSubscribe, isMac, () => false);

/**
 * A shortcut as the platform writes it: ⌘K on a Mac, Ctrl+K elsewhere. `ctrl`
 * for a key that is Control on a Mac too (⌃T in a terminal).
 */
export const keys = (mac: boolean, key: string, { ctrl = false, shift = false } = {}) =>
  mac ? `${ctrl ? "⌃" : "⌘"}${shift ? "⇧" : ""}${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;

/** A key, as the app writes one everywhere: in tooltips, the palette, the status bar. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center border border-border-gray bg-surface px-1 font-sans text-[10.5px] font-medium leading-none text-muted-slate",
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
