"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DIALOG, Field, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMaybeMap } from "@/components/map-context";
import { PanelHead } from "@/components/panel";
import { readSettings } from "@/lib/settings";
import type { Explain, Progress, Project } from "@/lib/vault";
import { cn } from "@/lib/utils";

/**
 * The project list: the reader's own projects, imported from this machine and
 * kept in the app's vault (lib/vault.ts). Starting one works as VS Code's Open
 * Folder does: the system's folder picker first, then one screen to confirm
 * before the map is made through the reader's Claude Code. New Project makes
 * an empty folder instead. The list follows the run, and the map opens from
 * here or the picker once it is made.
 */

const OPEN = "slop:projects";
type Mode = "open" | "new";
interface Asked {
  mode?: Mode;
  root?: string;
}
const show = (detail: Asked) => window.dispatchEvent(new CustomEvent<Asked>(OPEN, { detail }));
/** Opens the list; with a folder, ready to import it. */
export const openProjects = (root?: string) => show(root ? { mode: "open", root } : {});

/** The system's folder picker; undefined outside the desktop app, or when the reader cancels. */
async function pickFolder(title: string): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title });
  return typeof dir === "string" ? dir : undefined;
}

/**
 * Open Folder…: the picker straight away, then the confirm screen. Outside the
 * desktop app there is no picker, so the screen asks for the path instead.
 */
export async function openFolder() {
  if (!isTauri()) return show({ mode: "open" });
  const root = await pickFolder("Open a folder to map");
  if (root) show({ mode: "open", root });
}

export const newProject = () => show({ mode: "new" });

type Listed = Project & { hasMap: boolean; stale: boolean; progress?: Progress };
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
export async function claudePath(): Promise<string | undefined> {
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
  // Confirming an Open Folder or New Project; the list alone when null.
  const [mode, setMode] = useState<Mode | null>(null);
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
      const asked = (e as CustomEvent<Asked>).detail;
      setRoot(asked.root ?? "");
      setLabel("");
      setMode(asked.mode ?? null);
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
    const dir = await pickFolder(mode === "new" ? "Choose where the new folder goes" : "Open a folder to map");
    if (dir) setRoot(dir);
  };

  const start = async (explain?: Explain) => {
    try {
      const body =
        mode === "new"
          ? { action: "create", root: root.trim(), name: label.trim() }
          : { action: "import", root: root.trim(), name: label.trim(), claude: await claudePath(), explain };
      const made = await act(body);
      if (made) {
        setRoot("");
        setLabel("");
        setMode(null);
        // A map is being made: watch it build (D69).
        if (made.id && made.map?.status === "generating") openMap(made.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // `full` makes the whole map again; without it a finished map at the same
  // depth is only brought up to its code (lib/vault.ts, generate).
  const regenerate = async (id: string, explain?: Explain, full?: boolean) => {
    try {
      if (await act({ action: "regenerate", id, claude: await claudePath(), explain, ...(full ? { full: true } : {}) })) openMap(id);
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
          {mode ? (
            <StartProject
              mode={mode}
              root={root}
              setRoot={setRoot}
              label={label}
              setLabel={setLabel}
              busy={busy}
              error={error}
              onBrowse={isTauri() ? () => void browse() : undefined}
              onStart={(explain) => void start(explain)}
              onCancel={() => {
                setMode(null);
                setRoot("");
                setLabel("");
                setError(null);
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void openFolder()} className={PRIMARY}>
                Open Folder…
              </button>
              <button type="button" onClick={newProject} className={cn(QUIET, "border border-border-gray bg-pure-white")}>
                New Project…
              </button>
              <p className="ml-auto text-[12px] text-faint">Map code on this machine, or start an empty folder.</p>
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
                    onRegenerate={(explain, full) => void regenerate(p.id, explain, full)}
                    onCancel={() => void act({ action: "cancel", id: p.id })}
                    onRemove={() => void remove(p.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint">{list ? "None yet. Open a folder above." : "Loading…"}</p>
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

/**
 * How much the map explains (D70), from how well the reader says they
 * understand the repo: each stop of the slider is one level, the less they
 * know the more it says.
 */
const UNDERSTAND: { label: string; explain: Explain }[] = [
  { label: "New to it", explain: "full" },
  { label: "Read some", explain: "detailed" },
  { label: "Used it", explain: "brief" },
  { label: "Worked in it", explain: "minimal" },
  { label: "Wrote it", explain: "none" },
];

export const EXPLAINS: Record<Explain, { label: string; note: string }> = {
  none: { label: "No explanations", note: "The map alone: parts, pictures and the code behind each step." },
  minimal: { label: "Minimal explanations", note: "One line per level on what this project calls it, a few of its own words defined, a short walkthrough." },
  brief: { label: "Brief explanations", note: "A sentence or two per level on what it is for, a short glossary and walkthrough." },
  detailed: { label: "Detailed explanations", note: "A paragraph or two per level in plain words, the odd picture, a glossary and a walkthrough." },
  full: { label: "Full explanations", note: "Every level said again in plain words, with pictures, a glossary and a walkthrough." },
};

/**
 * How well the reader understands the repo, as a slider of UNDERSTAND's
 * stops. Drawn rather than a native range, which the webviews style each
 * their own way; it drags, clicks to a stop, and takes the arrow keys.
 */
function Understanding({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const last = UNDERSTAND.length - 1;
  const at = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * last);
  };
  const left = (i: number) => `${(i / last) * 100}%`;
  const explain = UNDERSTAND[value].explain;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span id="understand-q" className="text-[13px] font-semibold text-ink">
          How well do you understand this repo?
        </span>
        <span className="mt-0.5 block text-[12px] text-muted-slate">So the map says as much as you need, and no more.</span>
      </div>
      <div className="px-8">
        <div
          role="slider"
          tabIndex={0}
          aria-labelledby="understand-q"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={value}
          aria-valuetext={`${UNDERSTAND[value].label}: ${EXPLAINS[explain].label}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus();
            onChange(at(e.clientX));
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(at(e.clientX));
          }}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
            const next = e.key === "Home" ? 0 : e.key === "End" ? last : step === undefined ? null : Math.min(last, Math.max(0, value + step));
            if (next === null) return;
            e.preventDefault();
            onChange(next);
          }}
          className="group relative h-7 cursor-pointer touch-none select-none outline-none"
        >
          <div ref={track} className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-gray">
            <div className="h-full rounded-full bg-deep-green transition-[width] duration-200 ease-out" style={{ width: left(value) }} />
          </div>
          {UNDERSTAND.map((u, i) => (
            <span
              key={u.label}
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200",
                i <= value ? "bg-deep-green" : "bg-border-strong",
              )}
              style={{ left: left(i) }}
            />
          ))}
          <span
            className="absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-deep-green bg-pure-white shadow-panel transition-[left,box-shadow,transform] duration-200 ease-out group-focus-visible:shadow-[0_0_0_4px_var(--color-mint-success)] group-active:scale-110"
            style={{ left: left(value) }}
          />
        </div>
        <div className="relative h-4 select-none">
          {UNDERSTAND.map((u, i) => (
            <span
              key={u.label}
              onClick={() => onChange(i)}
              className={cn(
                "absolute top-0 -translate-x-1/2 cursor-pointer whitespace-nowrap text-[11.5px] transition-colors",
                i === value ? "font-semibold text-ink" : "text-faint hover:text-muted-slate",
              )}
              style={{ left: left(i) }}
            >
              {u.label}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-[2px] border border-border-gray bg-pure-white px-3 py-2.5">
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-deep-green">{EXPLAINS[explain].label}</span>
        <span className="mt-1 block text-[12px] text-muted-slate">{EXPLAINS[explain].note}</span>
      </div>
    </div>
  );
}

const folderName = (root: string) => root.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
const joinPath = (parent: string, name: string) => `${parent.trim().replace(/[\\/]+$/, "")}/${name}`;

/**
 * Confirming a project, on one screen: the folder (already picked when the
 * picker was there to pick it), its name, and for an existing one how much
 * the map explains and what making it costs. Folders are checked by the
 * server, so a bad one comes back here to fix.
 */
function StartProject({
  mode,
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
  mode: Mode;
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
  const fresh = mode === "new";
  const [understand, setUnderstand] = useState(2);
  const explain = UNDERSTAND[understand].explain;
  const name = label.trim() || (fresh ? "" : folderName(root));
  const ready = Boolean(root.trim()) && (!fresh || Boolean(label.trim()));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onStart(fresh ? undefined : explain);
      }}
      className="flex flex-col gap-4 rounded-[3px] border border-border-gray bg-surface px-4 py-4"
    >
      <h3 className="text-[13px] font-semibold text-ink">{fresh ? "New project" : `Map ${name || "a folder"}`}</h3>

      <Field
        label={fresh ? "Location" : "Folder"}
        hint={fresh ? `The new folder is made inside it${name ? `: ${joinPath(root || "…", name)}` : "."}` : "A project on this machine, usually a git checkout."}
      >
        <div className="flex gap-2">
          <input
            autoFocus={!root}
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder={fresh ? "~/code" : "~/code/my-app"}
            spellCheck={false}
            className={INPUT}
          />
          {onBrowse ? (
            <button type="button" onClick={onBrowse} className={cn(QUIET, "shrink-0 border border-border-gray bg-pure-white")}>
              {root ? "Change…" : "Browse…"}
            </button>
          ) : null}
        </div>
      </Field>

      <Field label="Name" hint={fresh ? "Also the new folder's name." : "Blank uses the folder's name."}>
        <input
          autoFocus={Boolean(root) && fresh}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={(!fresh && folderName(root)) || "my-app"}
          spellCheck={false}
          className={INPUT}
        />
      </Field>

      {fresh ? null : <Understanding value={understand} onChange={setUnderstand} />}

      <p className="text-[12px] text-muted-slate">
        {fresh
          ? "An empty folder is made there, as a git checkout. Map it from the list once it has code."
          : "The map is made right away with your Claude Code — about 20 minutes for a mid-sized repo, counted against your plan's usage. You can open each part as it finishes."}
      </p>

      <div className="flex items-center justify-end gap-3">
        {error ? <p className="mr-auto text-[12.5px] text-clay-ink">{error}</p> : null}
        <button type="button" onClick={onCancel} className={QUIET}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !ready} className={PRIMARY}>
          {fresh ? "Create project" : "Start mapping"}
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
  onCancel,
  onRemove,
}: {
  p: Listed;
  current: boolean;
  busy: boolean;
  onOpen: (at?: string) => void;
  onRegenerate: (explain: Explain, full?: boolean) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  // Forgetting a project takes a second click: it deletes the map, not the code.
  const [confirm, setConfirm] = useState(false);
  // So does making a finished map again from scratch: it is a whole run's time and cost.
  const [confirmFull, setConfirmFull] = useState(false);
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
            {status === "ready" ? (
              <button
                type="button"
                onClick={() => (confirmFull ? onRegenerate(explain, true) : setConfirmFull(true))}
                onBlur={() => setConfirmFull(false)}
                disabled={busy}
                title="Make the whole map again, not only what changed since it was made"
                className={cn(QUIET, "py-1", confirmFull && "text-clay-ink")}
              >
                {confirmFull ? "Rebuild all?" : "From scratch"}
              </button>
            ) : null}
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
