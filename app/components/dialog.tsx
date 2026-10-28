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
  "flex max-h-full w-full flex-col overflow-hidden rounded-[4px] border border-border-gray bg-pure-white shadow-lift";

export const INPUT =
  "w-full rounded-[2px] border border-border-gray bg-pure-white px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-deep-green focus:outline-none";

export const PRIMARY =
  "cursor-pointer rounded-[2px] bg-deep-green px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand disabled:cursor-default disabled:opacity-50";

export const QUIET =
  "cursor-pointer rounded-[2px] px-3.5 py-1.5 text-[13px] text-muted-slate hover:bg-surface-container-low hover:text-ink";

export function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="mb-2 mt-0.5 block text-[12px] text-muted-slate">{hint}</span>
      {children}
    </label>
  );
}
