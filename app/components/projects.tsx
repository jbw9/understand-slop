"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { openAudit } from "@/components/audit";
import { DIALOG, Field, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMaybeMap } from "@/components/map-context";
import { PanelHead } from "@/components/panel";
import { readSettings } from "@/lib/settings";
import type { Explain, Progress, Project } from "@/lib/vault";
import { cn } from "@/lib/utils";

/**
 * The project list: the reader's own projects, imported from this machine and
 * kept in the app's vault (lib/vault.ts). Starting one (a short wizard) either makes a new empty folder, or maps
 * an existing one straight away through the reader's Claude Code;
 * the list follows the run, and the map opens from here or the picker once
 * it is made.
 */

const OPEN = "slop:projects";
/** Opens the list; with a folder, ready to import it. */
export const openProjects = (root?: string) => window.dispatchEvent(new CustomEvent<string | undefined>(OPEN, { detail: root }));

type Listed = Project & { hasMap: boolean; hasAudit: boolean; stale: boolean; progress?: Progress };
interface List {
  vault: string;
  projects: Listed[];
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "Something went wrong.");
  return out;
}

/** The reader's Claude Code, as the terminal finds it; none outside the desktop app. */
async function claudePath(): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const found = await invoke<{ path: string } | null>("claude_detect", {
    configured: readSettings().claudePath || null,
  });
  if (!found) throw new Error("Claude Code was not found. Set where it is in Settings.");
  return found.path;
}

export function ProjectsDialog() {
  const router = useRouter();
  const current = useMaybeMap()?.name;
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<List | null>(null);
  const [root, setRoot] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  // Whether the wizard makes a new folder or maps an existing one; unasked yet when null.
  const [fresh, setFresh] = useState<boolean | null>(null);
  const close = useCallback(() => setOpen(false), []);

  // Which maps were ready last time, so a run finishing refreshes the picker.
  const ready = useRef<Set<string>>(new Set());
  const refresh = useCallback(async () => {
    const next: List = await fetch("/api/projects").then((r) => r.json());
    const now = new Set(next.projects.filter((p) => p.map.status === "ready").map((p) => p.id));
    if ([...now].some((id) => !ready.current.has(id))) router.refresh();
    ready.current = now;
    setList(next);
  }, [router]);

  useEffect(() => {
    const show = (e: Event) => {
      const asked = (e as CustomEvent<string | undefined>).detail;
      if (typeof asked === "string") setRoot(asked);
      setWizard(typeof asked === "string");
      setFresh(typeof asked === "string" ? false : null);
      setOpen(true);
      setError(null);
      void refresh();
    };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, [refresh]);

  // Follow a run while the list is open.
  const running = list?.projects.some((p) => p.map.status === "generating");
  useEffect(() => {
    if (!open || !running) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [open, running, refresh]);

  if (!open) return null;

  // The project the action returned, or null when it failed.
  const act = async (body: Record<string, unknown>): Promise<Partial<Project> | null> => {
    setBusy(true);
    setError(null);
    try {
      const out = await post(body);
      await refresh();
      return out ?? {};
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const dir = await pick({ directory: true, title: fresh ? "Choose where the new folder goes" : "Choose a project folder" });
    if (typeof dir === "string") setRoot(dir);
  };

  const importIt = async (explain?: Explain) => {
    try {
      const body = fresh
        ? { action: "create", root: root.trim(), name: label.trim() }
        : { action: "import", root: root.trim(), name: label.trim(), claude: await claudePath(), explain };
      const made = await act(body);
      if (made) {
        setRoot("");
        setLabel("");
        setWizard(false);
        // A map is being made: watch it build (D69).
        if (made.id && made.map?.status === "generating") openMap(made.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const regenerate = async (id: string, explain?: Explain) => {
    try {
      if (await act({ action: "regenerate", id, claude: await claudePath(), explain })) openMap(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Deleting the open project goes to the blank page (components/welcome.tsx)
  // rather than quietly opening some other project.
  const remove = async (id: string) => {
    if (!(await act({ action: "remove", id }))) return;
    if (id === current) router.push("/?none");
    else router.refresh();
  };

  // `at` is the level to open at, as chrome.tsx's goTo spells it: a finished
  // root is explorable from the list while the rest are still being made.
  const openMap = (id: string, at?: string) => {
    router.push(`/?map=${encodeURIComponent(id)}${at ? `&at=${encodeURIComponent(at)}` : ""}`);
    close();
  };

  return (
    <Overlay onClose={close}>
      <div role="dialog" aria-label="Projects" className={cn(DIALOG, "max-w-[680px]")}>
        <PanelHead
          title="Projects"
          note={list ? `Your projects stay on this machine, in ${list.vault}` : "Loading…"}
        />
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-5 py-5">
          {wizard ? (
            <NewProject
              fresh={fresh}
              setFresh={setFresh}
              root={root}
              setRoot={setRoot}
              label={label}
              setLabel={setLabel}
              busy={busy}
              error={error}
              onBrowse={isTauri() ? () => void browse() : undefined}
              onStart={(explain) => void importIt(explain)}
              onCancel={() => {
                setWizard(false);
                setFresh(null);
                setError(null);
              }}
            />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-[3px] border border-border-gray bg-surface px-4 py-3">
              <p className="text-[12.5px] text-muted-slate">Start a project from scratch, or map a folder on this machine.</p>
              <button type="button" onClick={() => setWizard(true)} className={cn(PRIMARY, "shrink-0")}>
                New project…
              </button>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Your projects</h3>
            {list?.projects.length ? (
              <ul className="flex flex-col divide-y divide-border-gray rounded-[3px] border border-border-gray">
                {list.projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    p={p}
                    current={p.id === current}
                    busy={busy}
                    onOpen={(at) => openMap(p.id, at)}
                    onRegenerate={(explain) => void regenerate(p.id, explain)}
                    onAudit={() => {
                      close();
                      openAudit(p.id);
                    }}
                    onCancel={() => void act({ action: "cancel", id: p.id })}
                    onRemove={() => void remove(p.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint">{list ? "None yet. Start one above." : "Loading…"}</p>
            )}
          </section>

        </div>
        <div className="flex justify-end border-t border-border-gray bg-surface px-5 py-3">
          <button type="button" onClick={close} className={QUIET}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  );
}

const STEPS = ["Start", "Folder", "Name", "You", "Review"] as const;

/**
 * How much the map explains (D70), from what the reader knows: someone who
 * wrote the code, or knows the field and has used it, gets the map alone; one
 * new to both gets every level explained; anyone between, a sentence or two.
 */
const levelOf = (code: number, field: number): Explain =>
  code === 2 || (code === 1 && field === 2) ? "none" : code === 0 && field === 0 ? "full" : "brief";

export const EXPLAINS: Record<Explain, { label: string; note: string }> = {
  none: { label: "No explanations", note: "The map alone: parts, pictures and the code behind each step." },
  brief: { label: "Brief explanations", note: "A sentence or two per level on what it is for, a short glossary and walkthrough." },
  full: { label: "Full explanations", note: "Every level said again in plain words, with pictures, a glossary and a walkthrough." },
};

const KNOW = [
  { q: "How well do you know this codebase?", a: ["Never opened it", "Used it or read some", "Wrote parts of it"] },
  { q: "How well do you know what this kind of software does?", a: ["New to it", "Some", "Expert"] },
] as const;
const folderName = (root: string) => root.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
const joinPath = (parent: string, name: string) => `${parent.trim().replace(/[\\/]+$/, "")}/${name}`;

/**
 * Starting a project, one question at a time: from scratch or from a folder
 * already here, where, what to call it, then what happens before anything
 * does. A new project is just an empty folder made for it; an existing one
 * is mapped, so the last step says what that costs. Folders are checked by
 * the server, so a bad one comes back on the last step with Back to fix it.
 */
function NewProject({
  fresh,
  setFresh,
  root,
  setRoot,
  label,
  setLabel,
  busy,
  error,
  onBrowse,
  onStart,
  onCancel,
}: {
  fresh: boolean | null;
  setFresh: (v: boolean) => void;
  root: string;
  setRoot: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  busy: boolean;
  error: string | null;
  onBrowse?: () => void;
  onStart: (explain?: Explain) => void;
  onCancel: () => void;
}) {
  // Opened on a folder already chosen (the titlebar's import), it starts at the folder.
  const [step, setStep] = useState(fresh === false ? 1 : 0);
  // A new folder has no code to explain, so it skips "You".
  const steps = fresh ? STEPS.filter((s) => s !== "You") : STEPS;
  const at = steps[step];
  const [know, setKnow] = useState<[number | null, number | null]>([null, null]);
  const explain = know[0] !== null && know[1] !== null ? levelOf(know[0], know[1]) : undefined;
  const name = label.trim() || (fresh ? "" : folderName(root));
  const canNext = { Start: fresh !== null, Folder: Boolean(root.trim()), Name: !fresh || Boolean(label.trim()), You: Boolean(explain), Review: true }[at];
  const last = step === steps.length - 1;
  const choose = (v: boolean) => {
    setFresh(v);
    setStep(1);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (last) onStart(fresh ? undefined : explain);
        else if (canNext) setStep(step + 1);
      }}
      className="flex flex-col gap-4 rounded-[3px] border border-border-gray bg-surface px-4 py-4"
    >
      <ol className="flex gap-3 font-mono text-[10.5px] uppercase tracking-[0.09em]">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? "text-deep-green" : i < step ? "text-on-surface-variant" : "text-faint"}>
            {i < step ? "✓" : i + 1} {s}
          </li>
        ))}
      </ol>

      {at === "Start" ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: true, title: "Start from scratch", note: "Make a new, empty folder for it." },
            { v: false, title: "Use an existing folder", note: "Map code already on this machine." },
          ].map((o) => (
            <button
              key={o.title}
              type="button"
              onClick={() => choose(o.v)}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-[2px] border bg-pure-white px-3 py-3 text-left transition-colors hover:border-deep-green",
                fresh === o.v ? "border-deep-green" : "border-border-gray",
              )}
            >
              <span className="text-[13px] font-semibold text-ink">{o.title}</span>
              <span className="text-[12px] text-muted-slate">{o.note}</span>
            </button>
          ))}
        </div>
      ) : at === "Folder" ? (
        <Field
          label={fresh ? "Where should it go?" : "Which folder?"}
          hint={fresh ? "The folder the new project is made inside." : "A project on this machine, usually a git checkout."}
        >
          <div className="flex gap-2">
            <input
              autoFocus
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={fresh ? "~/code" : "~/code/my-app"}
              spellCheck={false}
              className={INPUT}
            />
            {onBrowse ? (
              <button type="button" onClick={onBrowse} className={cn(QUIET, "shrink-0 border border-border-gray bg-pure-white")}>
                Browse…
              </button>
            ) : null}
          </div>
        </Field>
      ) : at === "You" ? (
        <div className="flex flex-col gap-4">
          {KNOW.map((k, qi) => (
            <Field key={k.q} label={k.q} hint={qi ? "Its field: what a web store, a message queue or a compiler is for." : "So the map says as much as you need, and no more."}>
              <div className="grid grid-cols-3 gap-2">
                {k.a.map((a, ai) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={know[qi] === ai}
                    onClick={() => setKnow((k) => (qi ? [k[0], ai] : [ai, k[1]]))}
                    className={cn(
                      "cursor-pointer rounded-[2px] border bg-pure-white px-3 py-2 text-left text-[12.5px] text-ink transition-colors hover:border-deep-green",
                      know[qi] === ai ? "border-deep-green" : "border-border-gray",
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>
          ))}
          {explain ? (
            <p className="text-[12px] text-muted-slate">
              <span className="font-semibold text-ink">{EXPLAINS[explain].label}.</span> {EXPLAINS[explain].note}
            </p>
          ) : null}
        </div>
      ) : at === "Name" ? (
        <Field label="What should it be called?" hint={fresh ? "Also the new folder's name." : "Blank uses the folder's name."}>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={(!fresh && folderName(root)) || "my-app"}
            spellCheck={false}
            className={INPUT}
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            <dt className="text-muted-slate">Folder</dt>
            <dd className="truncate font-mono text-ink" title={root}>
              {fresh ? joinPath(root, name) : root.trim()}
            </dd>
            <dt className="text-muted-slate">Name</dt>
            <dd className="truncate font-mono text-ink">{name}</dd>
            {explain && !fresh ? (
              <>
                <dt className="text-muted-slate">Explains</dt>
                <dd className="text-ink">{EXPLAINS[explain].label}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-[12px] text-muted-slate">
            {fresh
              ? "A new empty folder is made there, as a git checkout. There's nothing to map yet: once it has code, map it from the list below."
              : "Its map is made right away with your Claude Code — about 20 minutes for a mid-sized repo, counted against your plan's usage. You can follow it below and open each part as it finishes."}
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && last ? <p className="mr-auto text-[12.5px] text-clay-ink">{error}</p> : null}
        <button type="button" onClick={step ? () => setStep(step - 1) : onCancel} className={QUIET}>
          {step ? "Back" : "Cancel"}
        </button>
        <button type="submit" disabled={busy || !canNext} className={PRIMARY}>
          {last ? (fresh ? "Create project" : "Start mapping") : "Next"}
        </button>
      </div>
    </form>
  );
}

const minutes = (from: string) => Math.max(1, Math.round((Date.now() - Date.parse(from)) / 60000));

/** What the run is doing before any root exists; once they do, the list below says it. */
function stageLine(g?: Progress) {
  if (!g) return "";
  if (g.roots.length) return "";
  if (g.stage === "summarize") return "reading the code";
  if (g.stage === "cut") return "dividing it into parts";
  return g.line ?? "";
}

const GLYPH = { done: "✓", drafting: "◷", failed: "✗", queued: "○" } as const;

/**
 * The parts of a map being made, in the order the cut put them. A finished one
 * opens straight away: it passed the same check inside the author's submit that
 * a root of a finished map passes, so there is nothing provisional about it.
 */
function Roots({ roots, onOpen }: { roots: Progress["roots"]; onOpen: (at: string) => void }) {
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[11.5px]">
      {roots.map((r) => (
        <li key={r.id} className="flex items-baseline gap-2">
          <span className={cn("w-3 shrink-0", r.status === "done" ? "text-deep-green" : r.status === "failed" ? "text-clay-ink" : r.status === "drafting" ? "text-amber-ink" : "text-faint")}>
            {GLYPH[r.status]}
          </span>
          {r.status === "done" ? (
            <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 cursor-pointer truncate text-left text-ink hover:underline">
              {r.title}
            </button>
          ) : (
            <span className={cn("min-w-0 flex-1 truncate", r.status === "queued" ? "text-faint" : "text-on-surface-variant")}>{r.title}</span>
          )}
          <span className={cn("shrink-0", r.status === "done" ? "text-deep-green" : r.status === "failed" ? "text-clay-ink" : "text-faint")}>{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function ProjectRow({
  p,
  current,
  busy,
  onOpen,
  onRegenerate,
  onAudit,
  onCancel,
  onRemove,
}: {
  p: Listed;
  current: boolean;
  busy: boolean;
  onOpen: (at?: string) => void;
  onRegenerate: (explain: Explain) => void;
  onAudit: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  // Forgetting a project takes a second click: it deletes the map, not the code.
  const [confirm, setConfirm] = useState(false);
  // What the next run explains; changing it takes effect when the map is made again.
  const [explain, setExplain] = useState<Explain>(p.explain ?? "full");
  const { status } = p.map;

  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-semibold text-ink">{p.name}</span>
        {current ? <span className="font-mono text-[10.5px] text-deep-green">open</span> : null}
        <span className="flex-1" />
        {p.hasMap ? (
          <button type="button" onClick={() => onOpen()} className={cn(QUIET, "py-1")}>
            Open
          </button>
        ) : null}
        {p.hasAudit ? (
          <button type="button" onClick={onAudit} title="How the map was made: what the agent read and decided" className={cn(QUIET, "py-1")}>
            Audit
          </button>
        ) : null}
        {status === "generating" ? (
          <button type="button" onClick={onCancel} disabled={busy} className={cn(QUIET, "py-1")}>
            Cancel
          </button>
        ) : (
          <>
            <select
              value={explain}
              onChange={(e) => setExplain(e.target.value as Explain)}
              disabled={busy}
              title="How much the map explains, used the next time it is made"
              className="cursor-pointer rounded-[2px] border border-border-gray bg-pure-white px-1.5 py-1 text-[12px] text-on-surface-variant"
            >
              {(Object.keys(EXPLAINS) as Explain[]).map((l) => (
                <option key={l} value={l}>
                  {EXPLAINS[l].label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onRegenerate(explain)} disabled={busy} className={cn(QUIET, "py-1")}>
              {status === "ready" ? "Regenerate" : status === "empty" ? "Map it" : "Retry"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => (confirm ? onRemove() : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          disabled={busy}
          className={cn(QUIET, "py-1", confirm && "text-clay-ink")}
        >
          {confirm ? "Remove map?" : "Remove"}
        </button>
      </div>
      <p className="truncate font-mono text-[11px] text-faint" title={p.root}>
        {p.root}
      </p>
      <p
        className={cn(
          "font-mono text-[11.5px]",
          status === "failed" ? "text-clay-ink" : status === "generating" ? "text-amber-ink" : "text-muted-slate",
        )}
      >
        {status === "generating"
          ? `◷ Mapping ${p.name}… ${minutes(p.map.startedAt)} min${stageLine(p.progress) ? ` — ${stageLine(p.progress)}` : ""}`
          : status === "ready"
            ? `✓ Mapped at ${p.map.commit ?? "?"}${p.map.seconds ? ` · ${Math.round(p.map.seconds / 60)} min` : ""}${p.stale ? " · the code has changed since" : ""}`
            : status === "cancelled"
              ? "Cancelled."
              : status === "empty"
                ? "New and empty — map it once it has code."
                : "✗ Mapping failed."}
      </p>
      {status === "generating" && p.progress?.roots.length ? <Roots roots={p.progress.roots} onOpen={onOpen} /> : null}
      {status === "failed" && p.map.error ? (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-[2px] bg-clay-surface/60 px-2.5 py-2 font-mono text-[11px] text-clay-ink">
          {p.map.error}
        </pre>
      ) : null}
    </li>
  );
}
