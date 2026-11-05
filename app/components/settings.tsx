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
  { value: "classic", label: "Classic" },
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
          right={
            <button
              type="submit"
              aria-label="Close"
              title="Close (Esc)"
              className="-mr-1.5 -mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-muted-slate hover:bg-surface-container hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="m4.5 4.5 7 7m0-7-7 7" />
              </svg>
            </button>
          }
        />
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
          <Field label="Theme" hint="Classic is the landing page's cobalt ink. Light and Dark are plain.">
            <div role="radiogroup" aria-label="Theme" className="inline-flex border border-border-gray p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.theme === t.value}
                  onClick={() => set({ theme: t.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.theme === t.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Background" hint="What the map is drawn on.">
            <div role="radiogroup" aria-label="Background" className="inline-flex border border-border-gray p-0.5">
              {GROUNDS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.ground === g.value}
                  onClick={() => set({ ground: g.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.ground === g.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
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
            <div role="radiogroup" aria-label="Default agent" className="inline-flex border border-border-gray p-0.5">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.agent === a.id}
                  onClick={() => set({ agent: a.id })}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.agent === a.id ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  <AgentIcon id={a.id} />
                  {a.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Dev server" hint="Start a project's dev server when it opens, and show the running app in a Preview tab.">
            <div role="radiogroup" aria-label="Dev server" className="inline-flex border border-border-gray p-0.5">
              {[
                { value: true, label: "Start it" },
                { value: false, label: "Leave it" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={draft.devServer === o.value}
                  onClick={() => set({ devServer: o.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.devServer === o.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {o.label}
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
                <span className="truncate text-accent">
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
                className="ml-auto shrink-0 cursor-pointer text-accent hover:underline"
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
          <Field
            label="Claude Code dictation"
            hint="Hold Control+Option (⌃⌥), or Space in a Claude tab, and speak into Claude's prompt. Transcribed by Anthropic at no cost to your usage; needs a claude.ai sign-in, not Bedrock or an API key."
          >
            <div role="radiogroup" aria-label="Claude Code dictation" className="inline-flex border border-border-gray p-0.5">
              {[
                { value: true, label: "On" },
                { value: false, label: "As in Claude Code" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={draft.voice === o.value}
                  onClick={() => set({ voice: o.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.voice === o.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Skills and web research"
            hint="Claude loads skills and searches or reads the web without asking each time, so plan mode can research freely. Plan mode still never edits files."
          >
            <div role="radiogroup" aria-label="Skills and web research" className="inline-flex border border-border-gray p-0.5">
              {[
                { value: true, label: "Without asking" },
                { value: false, label: "As in Claude Code" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={draft.research === o.value}
                  onClick={() => set({ research: o.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.research === o.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-[12px] text-faint">Claude Code changes apply to Claude tabs opened from now on.</p>
          <Field
            label="On-device dictation"
            hint="Hold Control+Option (⌃⌥) in a field in the app, or for Claude's prompt where Claude Code dictation isn't available. Runs on this machine, for any sign-in; nothing is sent anywhere."
          >
            <OnDevice />
          </Field>
          <Field
            label="Saved sign-ins"
            hint="Sites you signed in to in the Preview when Claude asked. Bluprint keeps their sign-in cookies, never your password. Forget signs you out."
          >
            <SignIns />
          </Field>
          <Field label="Media while dictating" hint="Pauses Music and Spotify, and mutes everything else, while you hold ⌃⌥; all of it comes back when you let go.">
            <div role="radiogroup" aria-label="Media while dictating" className="inline-flex border border-border-gray p-0.5">
              {[
                { value: true, label: "Quiet it" },
                { value: false, label: "Leave it" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={draft.quietMedia === o.value}
                  onClick={() => set({ quietMedia: o.value })}
                  className={cn(
                    "cursor-pointer px-3.5 py-1 text-[12.5px] transition-colors",
                    draft.quietMedia === o.value ? "bg-accent text-on-accent" : "text-muted-slate hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </form>
    </Overlay>
  );
}

type ModelStatus = { model: "missing" | "downloading" | "ready"; bytes: number; total: number; error: string | null };

/** The speech model for on-device dictation (src-tauri/src/dictate.rs): fetched once, kept until removed. */
function OnDevice() {
  const [s, setS] = useState<ModelStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const read = useCallback(() => {
    invoke<ModelStatus>("dictate_status").then(setS, (e) => setFailed(String(e)));
  }, []);
  useEffect(() => {
    read();
  }, [read]);
  // Polled only while it downloads, for the progress and for when it lands.
  useEffect(() => {
    if (s?.model !== "downloading") return;
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [s?.model, read]);
  const act = (cmd: string) => invoke(cmd).then(read, (e) => setFailed(String(e)));
  const mb = (n: number) => Math.round(n / 1e6);
  if (!s) return <span className="font-mono text-[11.5px] text-faint">{failed ?? "Looking…"}</span>;
  return (
    <div className="flex items-baseline gap-3 font-mono text-[11.5px]">
      {s.model === "ready" ? (
        <span className="text-accent">✓ Parakeet v3, {mb(s.total)} MB, on this machine</span>
      ) : s.model === "downloading" ? (
        <span className="text-ink">
          Downloading… {mb(s.bytes)} of {mb(s.total)} MB
        </span>
      ) : (
        <span className={s.error || failed ? "text-clay-ink" : "text-faint"}>
          {s.error ?? failed ?? `Needs its speech model, ${mb(s.total)} MB, downloaded once.`}
        </span>
      )}
      {s.model === "missing" ? (
        <button type="button" onClick={() => act("dictate_download")} className="ml-auto shrink-0 cursor-pointer text-accent hover:underline">
          {s.bytes ? "Resume download" : "Download"}
        </button>
      ) : (
        <button type="button" onClick={() => act("dictate_remove")} className="ml-auto shrink-0 cursor-pointer text-faint hover:text-ink">
          {s.model === "ready" ? "Remove" : "Stop"}
        </button>
      )}
    </div>
  );
}

type Kept = { global: string[]; projects: Record<string, string[]> };

/** The sign-ins the preview keeps (src-tauri/src/signins.rs): for all projects, then each project's own. */
function SignIns() {
  const [kept, setKept] = useState<Kept | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const read = useCallback(() => {
    invoke<Kept>("signin_list").then(setKept, (e) => setFailed(String(e)));
  }, []);
  useEffect(read, [read]);
  if (!kept) return <span className="font-mono text-[11.5px] text-faint">{failed ?? "Looking…"}</span>;
  const rows = [
    ...kept.global.map((site) => ({ site, root: null as string | null, where: "All projects" })),
    ...Object.entries(kept.projects).flatMap(([root, sites]) =>
      sites.map((site) => ({ site, root, where: root.split("/").filter(Boolean).pop() ?? root })),
    ),
  ];
  if (!rows.length) return <span className="font-mono text-[11.5px] text-faint">None yet.</span>;
  return (
    <ul className="flex flex-col gap-1 font-mono text-[11.5px]">
      {rows.map((r) => (
        <li key={`${r.root ?? ""}:${r.site}`} className="flex items-baseline gap-3">
          <span className="truncate text-ink">{r.site}</span>
          <span className="truncate text-faint" title={r.root ?? undefined}>
            {r.where}
          </span>
          <button
            type="button"
            onClick={() => invoke("signin_forget", { root: r.root, site: r.site }).then(read, (e) => setFailed(String(e)))}
            className="ml-auto shrink-0 cursor-pointer text-faint hover:text-ink"
          >
            Forget
          </button>
        </li>
      ))}
      {failed ? <li className="text-clay-ink">{failed}</li> : null}
    </ul>
  );
}
