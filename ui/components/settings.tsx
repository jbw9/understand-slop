"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { PanelHead } from "@/components/panel";
import { onOpenSettings, readSettings, saveSettings, type Settings } from "@/lib/settings";

/**
 * Settings, as a dialog over the map. There is little to set: where Claude
 * Code is, when it was not found by itself, and which model it runs.
 */

type Found = { path: string; version: string | null } | null;

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Settings>(readSettings);
  // undefined while looking.
  const [found, setFound] = useState<Found | undefined>(undefined);

  const detect = useCallback((claudePath: string) => {
    setFound(undefined);
    invoke<Found>("claude_detect", { configured: claudePath.trim() || null })
      .then(setFound)
      .catch(() => setFound(null));
  }, []);

  useEffect(
    () =>
      onOpenSettings(() => {
        const now = readSettings();
        setDraft(now);
        setOpen(true);
        detect(now.claudePath);
      }),
    [detect],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;
  const save = () => {
    saveSettings({ claudePath: draft.claudePath.trim(), model: draft.model.trim() });
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6"
      onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <form
        role="dialog"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="w-full max-w-[520px] overflow-hidden rounded-[20px] border border-border-gray bg-pure-white shadow-lift"
      >
        <PanelHead title="Settings" note="Claude Code, as the terminal's Claude tabs run it." />
        <div className="flex flex-col gap-5 px-5 py-5">
          <Field label="Claude Code" hint="Leave blank to find it automatically.">
            <input
              value={draft.claudePath}
              onChange={(e) => setDraft({ ...draft, claudePath: e.target.value })}
              onBlur={() => detect(draft.claudePath)}
              placeholder={found?.path ?? "~/.local/bin/claude"}
              spellCheck={false}
              className={INPUT}
            />
            <div className="mt-1.5 flex items-baseline gap-3 font-mono text-[11.5px]">
              {found === undefined ? (
                <span className="text-faint">Looking…</span>
              ) : found ? (
                <span className="truncate text-deep-green">
                  ✓ {found.path}
                  {found.version ? ` (${found.version})` : ""}
                </span>
              ) : (
                <span className="text-clay-ink">
                  {draft.claudePath.trim() ? "Nothing at that path." : "Not found — install Claude Code, or enter its path."}
                </span>
              )}
              <button
                type="button"
                onClick={() => detect(draft.claudePath)}
                className="ml-auto shrink-0 cursor-pointer text-deep-green hover:underline"
              >
                Detect again
              </button>
            </div>
          </Field>
          <Field label="Model" hint="Blank uses Claude Code's default. An alias like sonnet or opus, or a full model id.">
            <input
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="default"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
          <p className="text-[12px] text-faint">Changes apply to Claude tabs opened after saving.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-gray bg-surface px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-deep-green px-3.5 py-1.5 text-[13px] font-medium text-pure-white hover:bg-brand"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  "w-full rounded-[10px] border border-border-gray bg-pure-white px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-deep-green focus:outline-none";

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="mb-2 mt-0.5 block text-[12px] text-muted-slate">{hint}</span>
      {children}
    </label>
  );
}
