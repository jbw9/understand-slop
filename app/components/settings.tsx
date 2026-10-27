"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { DIALOG, Field, INPUT, Overlay } from "@/components/dialog";
import { AgentIcon, CLAUDE, useInstalled } from "@/components/agents";
import { PanelHead } from "@/components/panel";
import { cn } from "@/lib/utils";
import { followTheme, onOpenSettings, readSettings, saveSettings, useSettings, type Ground, type Settings, type Theme } from "@/lib/settings";

/**
 * Settings, as a dialog over the map. There is little to set: the theme,
 * the agent new tabs open into, where Claude Code is when it was not found by
 * itself, which model it runs, and what the map is drawn on. Every change is
 * saved as it is made, so there is nothing to confirm and nothing to undo.
 */

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const GROUNDS: { value: Ground; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "dots", label: "Dots" },
  { value: "squares", label: "Squares" },
];

type Found = { path: string; version: string | null } | null;

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  // What is on screen is what is saved: there is no draft to keep in step.
  const draft = useSettings();
  // undefined while looking.
  const [found, setFound] = useState<Found | undefined>(undefined);
  const agents = [CLAUDE, ...useInstalled()];

  const detect = useCallback((claudePath: string) => {
    setFound(undefined);
    invoke<Found>("claude_detect", { configured: claudePath.trim() || null })
      .then(setFound)
      .catch(() => setFound(null));
  }, []);

  useEffect(
    () =>
      onOpenSettings(() => {
        setOpen(true);
        detect(readSettings().claudePath);
      }),
    [detect],
  );

  // Mounted for the app's whole life, so this keeps the page on the saved theme.
  useEffect(followTheme, []);

  if (!open) return null;
  const close = () => {
    tidy();
    setOpen(false);
  };
  // Typing keeps its spaces until the field is left, so a trim never moves the caret.
  const set = (next: Partial<Settings>) => saveSettings({ ...readSettings(), ...next });
  const tidy = () => {
    const now = readSettings();
    set({ claudePath: now.claudePath.trim(), model: now.model.trim() });
  };

  return (
    <Overlay onClose={close}>
      <form
        role="dialog"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className={cn(DIALOG, "max-w-[520px]")}
      >
        <PanelHead
          title="Settings"
          note="How the app looks, which agent tabs open into, and how Claude Code runs. Changes apply as you make them."
          right={
            <button
              type="submit"
              aria-label="Close"
              title="Close (Esc)"
              className="-mr-1.5 -mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-muted-slate hover:bg-surface-container hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="m4.5 4.5 7 7m0-7-7 7" />
              </svg>
            </button>
          }
        />
        <div className="flex flex-col gap-5 px-5 py-5">
          <Field label="Theme" hint="System follows your desktop's light or dark setting.">
            <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-[8px] border border-border-gray p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.theme === t.value}
                  onClick={() => set({ theme: t.value })}
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
          <Field label="Background" hint="What the map is drawn on.">
            <div role="radiogroup" aria-label="Background" className="inline-flex rounded-[8px] border border-border-gray p-0.5">
              {GROUNDS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.ground === g.value}
                  onClick={() => set({ ground: g.value })}
                  className={cn(
                    "cursor-pointer rounded-[6px] px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.ground === g.value ? "bg-deep-green text-white" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Default agent"
            hint="What a tab opens into when the app opens one for you: Ctrl+`, Ctrl+Shift+T, the title bar, or the first in the + menu. Map context goes to Claude either way."
          >
            <div role="radiogroup" aria-label="Default agent" className="inline-flex rounded-[8px] border border-border-gray p-0.5">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.agent === a.id}
                  onClick={() => set({ agent: a.id })}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-[6px] px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.agent === a.id ? "bg-deep-green text-white" : "text-muted-slate hover:text-ink",
                  )}
                >
                  <AgentIcon id={a.id} />
                  {a.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Claude Code" hint="Leave blank to find it automatically.">
            <input
              value={draft.claudePath}
              onChange={(e) => set({ claudePath: e.target.value })}
              onBlur={() => {
                tidy();
                detect(draft.claudePath);
              }}
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
              onChange={(e) => set({ model: e.target.value })}
              onBlur={tidy}
              placeholder="default"
              spellCheck={false}
              className={INPUT}
            />
          </Field>
          <p className="text-[12px] text-faint">Claude Code changes apply to Claude tabs opened from now on.</p>
        </div>
      </form>
    </Overlay>
  );
}
