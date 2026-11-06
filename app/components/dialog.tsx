"use client";

import { useEffect } from "react";

/**
 * The pieces the app's dialogs share: a dimmed layer over the map that closes
 * on Escape or a click outside (Escape stops here rather than also leaving the
 * level), and the form parts inside one.
 */
export function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A note being written over the dialog (components/review-tray.tsx) takes its own Escape.
      if ((e.target as Element | null)?.closest?.("[data-note-editor]")) return;
      // A menu open over the dialog (components/menu.tsx) closes first.
      if (document.querySelector('[role="menu"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/20 p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  );
}

export const DIALOG =
  "flex max-h-full w-full flex-col overflow-hidden border border-border-gray bg-card shadow-lift";

export const INPUT =
  "w-full border border-border-gray bg-card px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

/* A dialog's actions, drawn as Button's `primary` and `ghost` (components/button.tsx),
   so a dialog's buttons read as the rest of the app's. */
const ACTION =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.04em] transition-[background-color,border-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 disabled:cursor-default disabled:opacity-50";

export const PRIMARY = `${ACTION} border border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong`;

export const QUIET = `${ACTION} text-muted-slate hover:bg-surface-container hover:text-ink`;

/**
 * A labelled setting. `group` for one that holds buttons rather than a field:
 * a <label> passes a click on its words to the first button inside, so
 * clicking "Theme" would pick Classic.
 */
export function Field({ label, hint, group, children }: { label: string; hint: string; group?: boolean; children: React.ReactNode }) {
  const Box = group ? "div" : "label";
  return (
    <Box className="block" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="mb-2 mt-0.5 block text-[12px] text-muted-slate">{hint}</span>
      {children}
    </Box>
  );
}
