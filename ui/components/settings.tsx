"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { DIALOG, Field, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { PanelHead } from "@/components/panel";
import { cn } from "@/lib/utils";
import { applyTheme, followTheme, onOpenSettings, readSettings, saveSettings, type Settings, type Theme } from "@/lib/settings";

/**
 * Settings, as a dialog over the map. There is little to set: the theme,
 * where Claude Code is when it was not found by itself, and which model it
 * runs. A theme picked here shows at once, and Cancel puts the saved one back.
 */

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

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

  // Mounted for the app's whole life, so this keeps the page on the saved theme.
  useEffect(followTheme, []);

  if (!open) return null;
  const close = () => {
    applyTheme(readSettings().theme);
    setOpen(false);
  };
  const save = () => {
    saveSettings({ ...draft, claudePath: draft.claudePath.trim(), model: draft.model.trim() });
    setOpen(false);
  };

  return (
    <Overlay onClose={close}>
      <form
        role="dialog"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className={cn(DIALOG, "max-w-[520px]")}
      >
        <PanelHead title="Settings" note="How the app looks, and Claude Code as its tabs run it." />
        <div className="flex flex-col gap-5 px-5 py-5">
          <Field label="Theme" hint="System follows your desktop's light or dark setting.">
            <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-[8px] border border-border-gray p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.theme === t.value}
                  onClick={() => {
                    setDraft({ ...draft, theme: t.value });
                    applyTheme(t.value);
                  }}
                  className={cn(
                    "cursor-pointer rounded-[6px] px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.theme === t.value ? "bg-deep-green text-white" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
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
          <p className="text-[12px] text-faint">Claude Code changes apply to Claude tabs opened after saving.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-gray bg-surface px-5 py-3">
          <button
            type="button"
            onClick={close}
            className={QUIET}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={PRIMARY}
          >
            Save
          </button>
        </div>
      </form>
    </Overlay>
  );
}
