"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AgentIcon, CLAUDE } from "@/components/agents";
import { ExplainedBlock, isExplained } from "@/components/blocks";
import { DIALOG, Field, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMap } from "@/components/map-context";
import { Prose } from "@/components/state";
import { ask, section } from "@/lib/context";
import { draftPrompt, parseBlock, revisePrompt, type Exchange } from "@/lib/keep";
import { readSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { Anatomy, Origin } from "@/lib/data";

/**
 * Keeping an answer, and correcting a section.
 *
 * Both are the same gesture from the reader's side — "the map should say this"
 * — and they differ in who is right about the code. Keeping an answer adds
 * something the map never knew, marked as the reader's (lib/overlay.ts).
 * Correcting says the map is wrong about code that is right there, so it goes
 * down the path an agent's `slop-map-fix` already takes (lib/vault.ts): the
 * section is re-authored against the real file, and stays code-derived.
 *
 * Desktop only. Both need a Claude tab, and the tabs are the desktop app's.
 */

const noSubscribe = () => () => {};
const useDesktop = () => useSyncExternalStore(noSubscribe, isTauri, () => false);

/* ── the turn just finished ───────────────────────────────────── */

/** The last answer Claude gave in any tab, offered once (src-tauri/src/pty.rs). */
const ANSWERED = "slop:answered";

export const announceAnswer = (e: Exchange) =>
  window.dispatchEvent(new CustomEvent<Exchange>(ANSWERED, { detail: e }));

export function onAnswer(f: (e: Exchange) => void) {
  const on = (ev: Event) => f((ev as CustomEvent<Exchange>).detail);
  window.addEventListener(ANSWERED, on);
  return () => window.removeEventListener(ANSWERED, on);
}

/**
 * The reply Claude gave to a drafting prompt, from the same place. True when a
 * waiting dialog took it — it cancels the event — so it is not also an answer.
 */
const DRAFTED = "slop:drafted";
export const announceDraft = (said: string) =>
  !window.dispatchEvent(new CustomEvent<string>(DRAFTED, { detail: said, cancelable: true }));
const onDraft = (f: (said: string) => boolean) => {
  const on = (ev: Event) => {
    if (f((ev as CustomEvent<string>).detail)) ev.preventDefault();
  };
  window.addEventListener(DRAFTED, on);
  return () => window.removeEventListener(DRAFTED, on);
};

/* ── keep an answer ───────────────────────────────────────────── */

type Stage =
  | { at: "asking" }
  | { at: "drafting" }
  | { at: "preview"; block: Anatomy }
  | { at: "failed"; why: string };

/**
 * Offered after Claude answers: turn that answer into a block, look at it, and
 * keep it. The draft goes through the tab the reader is already talking to, so
 * nothing here holds a key or calls an API.
 */
export function KeepAnswer({
  exchange,
  path,
  onClose,
}: {
  exchange: Exchange;
  path: string[];
  onClose: () => void;
}) {
  const map = useMap();
  const where = path.length ? (map.nodeAt(path)?.title ?? map.RUN.repo) : map.RUN.repo;
  const [stage, setStage] = useState<Stage>({ at: "asking" });
  const [changes, setChanges] = useState("");
  const [saving, setSaving] = useState(false);
  // The draft reply arrives on a window event from the workspace's poll, and
  // only the request we are waiting on should be taken.
  const waiting = useRef(false);

  useEffect(
    () =>
      onDraft((said) => {
        if (!waiting.current) return false;
        waiting.current = false;
        const r = parseBlock(said);
        setStage("block" in r ? { at: "preview", block: r.block } : { at: "failed", why: r.error });
        return true;
      }),
    [],
  );

  const send = useCallback((text: string) => {
    waiting.current = true;
    setStage({ at: "drafting" });
    ask(section(map, path), text);
  }, [map, path]);

  async function keep() {
    if (stage.at !== "preview") return;
    setSaving(true);
    const origin: Origin = { by: "claude", at: new Date().toISOString(), note: exchange.asked || undefined };
    // A note carries its own origin; every other kind wears the section's.
    const block = stage.block.kind === "note" ? { ...stage.block, origin } : stage.block;
    const res = await fetch("/api/overlay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", map: map.name, kind: "block", path, block, origin }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setStage({ at: "failed", why: "That could not be saved to this project." });
      return;
    }
    onClose();
    // The map is read on the server, so the level redraws from the overlay.
    window.location.reload();
  }

  return (
    <Overlay onClose={onClose}>
      <div className={cn(DIALOG, "max-w-[720px]")}>
        <header className="border-b border-border-gray px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Keep this on the map</h2>
          <p className="mt-0.5 text-[12px] text-muted-slate">
            It goes on <span className="font-medium text-ink">{where}</span>, marked as yours — not as something read
            from the code.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {stage.at === "asking" ? (
            <>
              <div className="mb-4 rounded-[8px] border border-border-gray bg-surface-container-low px-3.5 py-3">
                <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">What Claude said</p>
                <div className="max-h-[260px] overflow-auto whitespace-pre-wrap text-[13px] leading-[1.6] text-on-surface-variant">
                  <Prose text={exchange.said} />
                </div>
              </div>
              <button type="button" className={PRIMARY} onClick={() => send(draftPrompt(where))}>
                Draw it as a block
              </button>
              <p className="mt-2 text-[12px] text-muted-slate">
                Claude picks the shape that fits — a picture, a table, or a note where sentences really are the answer.
              </p>
            </>
          ) : null}

          {stage.at === "drafting" ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-amber-ink">
              <AgentIcon id={CLAUDE.id} />◷ Drawing it…
            </p>
          ) : null}

          {stage.at === "preview" ? (
            <>
              <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">
                How it will look on the level
              </p>
              <div className="mb-4 rounded-[8px] border border-border-gray px-4 py-4">
                {isExplained(stage.block) ? (
                  <ExplainedBlock block={stage.block} />
                ) : (
                  <p className="text-[13px] text-clay-ink">This kind cannot be drawn here.</p>
                )}
              </div>
              <Field label="Not quite right?" hint="Say what to change and Claude redraws it.">
                <input
                  className={INPUT}
                  value={changes}
                  placeholder="drop the last box, it is not real"
                  onChange={(e) => setChanges(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !changes.trim()) return;
                    send(revisePrompt(stage.block, changes.trim()));
                    setChanges("");
                  }}
                />
              </Field>
            </>
          ) : null}

          {stage.at === "failed" ? <p className="py-4 text-[13px] text-clay-ink">{stage.why}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-1.5 border-t border-border-gray px-5 py-3">
          <button type="button" className={QUIET} onClick={onClose}>
            {stage.at === "preview" ? "Discard" : "Close"}
          </button>
          {stage.at === "preview" ? (
            <button type="button" className={PRIMARY} disabled={saving} onClick={keep}>
              {saving ? "Keeping…" : "Keep it"}
            </button>
          ) : null}
        </footer>
      </div>
    </Overlay>
  );
}

/* ── correct a section ────────────────────────────────────────── */

/**
 * Two honest routes, and the difference matters.
 *
 * "Say what's wrong" hands a note to the updater, which re-reads the code and
 * rewrites the section — so the result is still derived from the repository and
 * keeps its state. "Write it myself" is the reader's own words, stored in the
 * overlay and marked as theirs. Blurring the two would put a person's sentence
 * where a compiler's finding is expected.
 */
export function CorrectSection({ path, onClose }: { path: string[]; onClose: () => void }) {
  const map = useMap();
  const node = path.length ? map.nodeAt(path) : null;
  const where = node?.title ?? map.RUN.repo;
  const [route, setRoute] = useState<"tell" | "write">("tell");
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(node?.detail ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function tell() {
    setBusy(true);
    const found = await invoke<{ path: string } | null>("claude_detect", {
      configured: readSettings().claudePath || null,
    }).catch(() => null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update",
        root: map.RUN.root,
        claude: found?.path,
        turn: { corrections: [{ section: path.join(" › ") || where, note: note.trim() }] },
      }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    // Only a project of the reader's own can be re-authored; an example
    // describes some other copy of its code.
    if (!res || res.error) {
      setProblem(res?.error ?? "Could not send that.");
      return;
    }
    if (res.skipped) {
      setProblem("This map is an example, so it cannot be re-read. Import the checkout as a project to correct it.");
      return;
    }
    onClose();
  }

  async function write() {
    setBusy(true);
    const res = await fetch("/api/overlay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add",
        map: map.name,
        kind: "field",
        path,
        field: "detail",
        value: detail.trim(),
        origin: { by: "user", at: new Date().toISOString() },
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setProblem("That could not be saved to this project.");
      return;
    }
    onClose();
    window.location.reload();
  }

  return (
    <Overlay onClose={onClose}>
      <div className={cn(DIALOG, "max-w-[620px]")}>
        <header className="border-b border-border-gray px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Fix “{where}”</h2>
          <div className="mt-2.5 flex gap-1">
            {(
              [
                ["tell", "Say what's wrong"],
                ["write", "Write it myself"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setRoute(k);
                  setProblem(null);
                }}
                className={cn(
                  "cursor-pointer rounded-[6px] px-2.5 py-1 text-[12.5px]",
                  route === k ? "bg-surface-container text-ink" : "text-muted-slate hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="px-5 py-4">
          {route === "tell" ? (
            <Field
              label="What does it get wrong, and what is true?"
              hint="Claude re-reads the code for this section and rewrites it. The result stays read from the code."
            >
              <textarea
                className={cn(INPUT, "min-h-[96px] resize-y")}
                value={note}
                placeholder="the capacity check is in the edge function too, not only the table"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="What should it say?" hint="Your words, kept as yours and marked “Added by you”. No code is read.">
              <textarea
                className={cn(INPUT, "min-h-[96px] resize-y")}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            </Field>
          )}
          {problem ? <p className="mt-3 text-[12.5px] text-clay-ink">{problem}</p> : null}
        </div>

        <footer className="flex items-center justify-end gap-1.5 border-t border-border-gray px-5 py-3">
          <button type="button" className={QUIET} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={PRIMARY}
            disabled={busy || (route === "tell" ? !note.trim() : !detail.trim() || detail.trim() === node?.detail)}
            onClick={route === "tell" ? tell : write}
          >
            {busy ? "Sending…" : route === "tell" ? "Have Claude fix it" : "Save my words"}
          </button>
        </footer>
      </div>
    </Overlay>
  );
}

/** The two buttons on a level's header. Desktop only, and only for a project. */
export function FixAndKeep({ path, answer }: { path: string[]; answer: Exchange | null }) {
  const desktop = useDesktop();
  const [open, setOpen] = useState<"keep" | "fix" | null>(null);
  if (!desktop) return null;
  const quiet =
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-border-gray bg-pure-white px-2.5 py-1 font-mono text-[11px] text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-ink";
  return (
    <>
      {answer ? (
        <button type="button" className={quiet} onClick={() => setOpen("keep")} title="Turn Claude's last answer into a block on this level">
          <AgentIcon id={CLAUDE.id} />
          Keep the answer
        </button>
      ) : null}
      <button type="button" className={quiet} onClick={() => setOpen("fix")} title="Tell Claude what this gets wrong, or write it yourself">
        Fix this
      </button>
      {open === "keep" && answer ? <KeepAnswer exchange={answer} path={path} onClose={() => setOpen(null)} /> : null}
      {open === "fix" ? <CorrectSection path={path} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
