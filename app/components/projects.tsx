"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DIALOG, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMaybeMap } from "@/components/map-context";
import { Menu, type MenuItem } from "@/components/menu";
import { cloneUrl, repoName } from "@/lib/clone";
import { readSettings } from "@/lib/settings";
import type { Explain, Progress, Project } from "@/lib/vault";
import { cn } from "@/lib/utils";

/**
 * The project list: the reader's own projects, imported from this machine and
 * kept in the app's vault (lib/vault.ts). Starting one works as VS Code's Open
 * Folder does: the system's folder picker first, then one screen to confirm
 * before the map is made through the reader's Claude Code. New Project makes
 * an empty folder instead, or clones one from GitHub when given a repository.
 * The list follows the run, and the map opens from here or the picker once it
 * is made.
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

export async function post(body: Record<string, unknown>) {
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
  const [url, setUrl] = useState("");
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
      setLabel(asked.mode === "open" && asked.root ? folderName(asked.root) : "");
      setUrl("");
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

  // The name starts as the folder's and follows it, until the reader names it something else.
  const changeRoot = (next: string) => {
    if (mode === "open") setLabel((l) => (!l.trim() || l === folderName(root) ? folderName(next) : l));
    setRoot(next);
  };

  // A clone's name follows the repository's the same way.
  const changeUrl = (next: string) => {
    setLabel((l) => (!l.trim() || l === repoName(url) ? repoName(next) : l));
    setUrl(next);
  };

  const browse = async () => {
    const dir = await pickFolder(mode === "new" ? "Choose where the new folder goes" : "Open a folder to map");
    if (dir) changeRoot(dir);
  };

  const start = async (explain: Explain | undefined, paused: boolean) => {
    try {
      const clone = mode === "new" && Boolean(url.trim());
      const claude = (mode === "new" && !clone) || paused ? undefined : await claudePath();
      const body =
        mode === "open"
          ? { action: "import", root: root.trim(), name: label.trim(), claude, explain, paused }
          : clone
            ? { action: "clone", url: url.trim(), root: root.trim(), name: label.trim(), claude, explain, paused }
            : { action: "create", root: root.trim(), name: label.trim(), paused };
      const made = await act(body);
      if (made) {
        setRoot("");
        setLabel("");
        setUrl("");
        setMode(null);
        // A map being made opens to watch it build (D69); one without a map opens for its tabs.
        if (made.id) openMap(made.id);
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

  const home = list ? homeOf(list.vault) : undefined;

  return (
    <Overlay onClose={close}>
      <div role="dialog" aria-label="Projects" className={cn(DIALOG, "max-w-[600px]")}>
        {mode ? (
          <StartProject
            mode={mode}
            root={root}
            setRoot={changeRoot}
            label={label}
            setLabel={setLabel}
            url={url}
            setUrl={changeUrl}
            busy={busy}
            error={error}
            onBrowse={isTauri() ? () => void browse() : undefined}
            onStart={(explain, paused) => void start(explain, paused)}
            onCancel={() => {
              setMode(null);
              setRoot("");
              setLabel("");
              setUrl("");
              setError(null);
            }}
          />
        ) : (
          <>
            <header className="flex items-center gap-1.5 border-b border-border-gray px-5 py-3">
              <h2 className="flex-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">Projects</h2>
              <button type="button" onClick={newProject} className={QUIET}>
                New Project…
              </button>
              <button type="button" onClick={() => void openFolder()} className={PRIMARY}>
                Open Folder…
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto px-2 py-2">
              {list?.projects.length ? (
                <ul className="flex flex-col">
                  {list.projects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      p={p}
                      home={home}
                      current={p.id === current}
                      busy={busy}
                      onOpen={(at) => openMap(p.id, at)}
                      onRegenerate={(explain, full) => void regenerate(p.id, explain, full)}
                      onCancel={() => void act({ action: "cancel", id: p.id })}
                      onPause={(paused) => void act({ action: "pause", id: p.id, paused })}
                      onRemove={() => void remove(p.id)}
                    />
                  ))}
                </ul>
              ) : list ? (
                <div className="px-3 py-10 text-center">
                  <p className="text-[13.5px] font-medium text-ink">No projects yet</p>
                  <p className="mt-1 text-[12.5px] text-muted-slate">Open a folder of code to map it, or start a new one, empty or cloned from GitHub.</p>
                </div>
              ) : (
                <p className="px-3 py-10 text-center text-[12.5px] text-faint">Loading…</p>
              )}
            </div>
            {error ? <p className="border-t border-border-gray px-5 py-2.5 text-[12.5px] text-clay-ink">{error}</p> : null}
            <footer className="truncate border-t border-border-gray bg-surface px-5 py-2 text-[11.5px] text-faint" title={list?.vault}>
              {list ? `Kept on this machine, in ${tilde(list.vault, home)}` : " "}
            </footer>
          </>
        )}
      </div>
    </Overlay>
  );
}

/** The home folder, read off the vault's path: the browser has no other way to know it. */
const homeOf = (vault: string) => vault.match(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/)?.[1];
const tilde = (path: string, home?: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);

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
          <div ref={track} className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-border-gray">
            <div className="h-full bg-accent transition-[width] duration-200 ease-out" style={{ width: left(value) }} />
          </div>
          {UNDERSTAND.map((u, i) => (
            <span
              key={u.label}
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200",
                i <= value ? "bg-accent" : "bg-border-strong",
              )}
              style={{ left: left(i) }}
            />
          ))}
          <span
            className="absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-card shadow-panel transition-[left,box-shadow,transform] duration-200 ease-out group-focus-visible:shadow-[0_0_0_4px_var(--color-accent-surface)] group-active:scale-110"
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
      <div className="border border-border-gray bg-card px-3 py-2.5">
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-accent">{EXPLAINS[explain].label}</span>
        <span className="mt-1 block text-[12px] text-muted-slate">{EXPLAINS[explain].note}</span>
      </div>
    </div>
  );
}

const folderName = (root: string) => root.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
const joinPath = (parent: string, name: string) => `${parent.trim().replace(/[\\/]+$/, "")}/${name}`;

/**
 * Confirming a project, on one screen: for a new one the repository to clone,
 * if any, and where it goes; for an existing one the folder (already picked
 * when the picker was there to pick it); its name; and for code to map how
 * much the map explains and what making it costs. Folders and repositories
 * are checked by the server, so a bad one comes back here to fix.
 */
function StartProject({
  mode,
  root,
  setRoot,
  label,
  setLabel,
  url,
  setUrl,
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
  url: string;
  setUrl: (v: string) => void;
  busy: boolean;
  error: string | null;
  onBrowse?: () => void;
  onStart: (explain: Explain | undefined, paused: boolean) => void;
  onCancel: () => void;
}) {
  const fresh = mode === "new";
  const clone = fresh && Boolean(url.trim());
  const known = Boolean(cloneUrl(url));
  // A new empty folder has nothing to map yet: it is mapped from Projects once it has code.
  const mappable = !fresh || clone;
  const [mapped, setMapped] = useState(true);
  const [understand, setUnderstand] = useState(2);
  const explain = UNDERSTAND[understand].explain;
  const name = label.trim() || (clone ? repoName(url) : fresh ? "" : folderName(root));
  const ready = Boolean(root.trim()) && (clone ? known && Boolean(name) : !fresh || Boolean(label.trim()));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onStart(mappable && mapped ? explain : undefined, mappable && !mapped);
      }}
      className="flex min-h-0 flex-col"
    >
      <header className="flex items-center gap-1 border-b border-border-gray px-3 py-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to projects"
          className="flex size-7 cursor-pointer items-center justify-center text-[15px] text-muted-slate hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          ←
        </button>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{fresh ? "New Project" : "Open Folder"}</h2>
      </header>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
        {fresh ? (
          <label className="block">
            <span className={LABEL}>
              Clone from GitHub <span className="font-normal text-faint">optional</span>
            </span>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              spellCheck={false}
              aria-invalid={clone && !known}
              className={INPUT}
            />
            <span className={cn("mt-1.5 block text-[11.5px]", clone && !known ? "text-clay-ink" : "text-faint")}>
              {clone && !known ? "Paste its GitHub link, owner/repo, or a git address." : "Leave it empty to start an empty folder."}
            </span>
          </label>
        ) : null}

        <label className="block">
          <span className={LABEL}>{fresh ? "Location" : "Folder"}</span>
          <div className="flex gap-2">
            <input
              autoFocus={!root && !fresh}
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={fresh ? "~/code" : "~/code/my-app"}
              spellCheck={false}
              className={INPUT}
            />
            {onBrowse ? (
              <button type="button" onClick={onBrowse} className={cn(QUIET, "h-auto self-stretch border border-border-strong")}>
                {root ? "Change…" : "Browse…"}
              </button>
            ) : null}
          </div>
        </label>

        <label className="block">
          <span className={LABEL}>
            Name
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={(clone ? repoName(url) : !fresh && folderName(root)) || "my-app"}
            spellCheck={false}
            className={INPUT}
          />
          {fresh && root.trim() && name ? (
            <span className="mt-1.5 block truncate font-mono text-[11.5px] text-faint">
              {clone ? "Clones into" : "Creates"} {joinPath(root, name)}
            </span>
          ) : null}
        </label>

        {mappable ? (
          <div className="flex items-start gap-4 border-t border-border-gray pt-5">
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">Make a map</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-slate">
                {mapped
                  ? "Your Claude Code reads it now. About 20 minutes for a mid-sized repo, on your plan's usage."
                  : "It opens with just your tabs. Nothing is read or spent until you make a map."}
              </span>
            </div>
            <Switch on={mapped} onChange={setMapped} label="Make a map" />
          </div>
        ) : null}

        {mappable && mapped ? <Understanding value={understand} onChange={setUnderstand} /> : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border-gray bg-surface px-5 py-3">
        {error ? <p className="mr-auto text-[12.5px] text-clay-ink">{error}</p> : null}
        <button type="button" onClick={onCancel} className={QUIET}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !ready} className={PRIMARY}>
          {clone ? (busy ? "Cloning…" : mapped ? "Clone and map" : "Clone") : fresh ? "Create" : mapped ? "Start mapping" : "Open"}
        </button>
      </footer>
    </form>
  );
}

const LABEL = "mb-1.5 block text-[12.5px] font-semibold text-ink";

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        on ? "bg-accent" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-4 bg-card transition-transform duration-150",
          on && "translate-x-4",
        )}
      />
    </button>
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
          <span className={cn("w-3 shrink-0", r.status === "done" ? "text-accent" : r.status === "failed" ? "text-clay-ink" : r.status === "drafting" ? "text-amber-ink" : "text-faint")}>
            {GLYPH[r.status]}
          </span>
          {r.status === "done" ? (
            <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 cursor-pointer truncate text-left text-ink hover:underline">
              {r.title}
            </button>
          ) : (
            <span className={cn("min-w-0 flex-1 truncate", r.status === "queued" ? "text-faint" : "text-on-surface-variant")}>{r.title}</span>
          )}
          <span className={cn("shrink-0", r.status === "done" ? "text-accent" : r.status === "failed" ? "text-clay-ink" : "text-faint")}>{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** The row's one-word state, and its tone; the detail is in the title. */
function statusOf(p: Listed): { text: string; title?: string; tone: string } {
  const { status, commit, seconds } = p.map;
  if (status === "generating") return { text: `Mapping · ${minutes(p.map.startedAt)} min`, tone: "text-amber-ink" };
  if (status === "failed" && !p.paused) return { text: "Mapping failed", tone: "text-clay-ink" };
  if (p.paused) return p.hasMap ? { text: "Updates off", title: `The map from ${commit ?? "earlier"} is kept as it is.`, tone: "text-faint" } : { text: "No map", tone: "text-faint" };
  if (status === "ready")
    return p.stale
      ? { text: "Out of date", title: `Mapped at ${commit ?? "?"}; the code has changed since.`, tone: "text-amber-ink" }
      : { text: commit ? `Mapped · ${commit}` : "Mapped", title: seconds ? `Took ${Math.round(seconds / 60)} min` : undefined, tone: "text-faint" };
  if (status === "cancelled") return { text: "Cancelled", tone: "text-faint" };
  return { text: "Empty", title: "Map it once it has code.", tone: "text-faint" };
}

function ProjectRow({
  p,
  home,
  current,
  busy,
  onOpen,
  onRegenerate,
  onCancel,
  onPause,
  onRemove,
}: {
  p: Listed;
  home?: string;
  current: boolean;
  busy: boolean;
  onOpen: (at?: string) => void;
  onRegenerate: (explain: Explain, full?: boolean) => void;
  onCancel: () => void;
  onPause: (paused: boolean) => void;
  onRemove: () => void;
}) {
  // What opens under the row: making the map (again), or confirming removal,
  // which deletes the map but never the code.
  const [panel, setPanel] = useState<"make" | "remove" | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [understand, setUnderstand] = useState(() => Math.max(0, UNDERSTAND.findIndex((u) => u.explain === (p.explain ?? "full"))));
  const { status } = p.map;
  const generating = status === "generating";
  const openable = p.hasMap || p.paused || status === "empty";
  const s = statusOf(p);

  const items: MenuItem[] = [];
  if (openable) items.push({ label: "Open", onClick: () => onOpen() });
  if (generating) items.push({ label: "Cancel mapping", onClick: onCancel, disabled: busy });
  else {
    if (status === "ready") items.push({ label: "Update map to the code", onClick: () => onRegenerate(p.explain ?? "full"), disabled: busy });
    if (status === "failed" || status === "cancelled") items.push({ label: "Retry mapping", onClick: () => onRegenerate(p.explain ?? "full"), disabled: busy });
    items.push({ label: p.hasMap ? "Remake map…" : "Make a map…", onClick: () => setPanel("make") });
    if (p.hasMap) items.push({ label: p.paused ? "Keep the map updated" : "Stop updating the map", onClick: () => onPause(!p.paused), disabled: busy });
  }
  items.push({ label: "Remove from Projects…", onClick: () => setPanel("remove"), separated: true });

  return (
    <li className="flex flex-col">
      <div className="group flex items-center gap-3 px-3 py-2 hover:bg-surface-container">
        <button
          type="button"
          onClick={() => openable && onOpen()}
          disabled={!openable}
          className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left disabled:cursor-default"
        >
          <span className="flex max-w-full items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
            {current ? <span className="shrink-0 bg-accent-surface px-1.5 text-[10.5px] font-medium text-accent">Open</span> : null}
          </span>
          <span className="max-w-full truncate font-mono text-[11.5px] text-faint" title={p.root}>
            {tilde(p.root, home)}
          </span>
        </button>
        <span className={cn("shrink-0 text-[12px]", s.tone)} title={s.title}>
          {s.text}
        </span>
        {generating ? (
          <button type="button" onClick={onCancel} disabled={busy} className={cn(QUIET, "shrink-0")}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Actions for ${p.name}`}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 220, y: r.bottom + 4 });
          }}
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center text-[16px] leading-none text-faint hover:bg-border-gray hover:text-ink focus-visible:opacity-100",
            menu ? "bg-border-gray text-ink" : "opacity-60 group-hover:opacity-100",
          )}
        >
          ⋯
        </button>
      </div>

      {menu ? <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}

      {generating && (stageLine(p.progress) || p.progress?.roots.length) ? (
        <div className="px-3 pb-2">
          {stageLine(p.progress) ? <p className="font-mono text-[11.5px] text-amber-ink">◷ {stageLine(p.progress)}</p> : null}
          {p.progress?.roots.length ? <Roots roots={p.progress.roots} onOpen={onOpen} /> : null}
        </div>
      ) : null}

      {status === "failed" && !p.paused && p.map.error ? (
        <pre className="mx-3 mb-2 max-h-28 overflow-auto whitespace-pre-wrap bg-clay-surface/60 px-2.5 py-2 font-mono text-[11px] text-clay-ink">
          {p.map.error}
        </pre>
      ) : null}

      {panel === "make" ? (
        <div className="mx-3 mb-2 mt-1 flex flex-col gap-4 border border-border-gray bg-surface px-4 py-4">
          <Understanding value={understand} onChange={setUnderstand} />
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[12px] text-muted-slate">About 20 min with your Claude Code, on your plan.</p>
            <button type="button" onClick={() => setPanel(null)} className={cn(QUIET, "shrink-0")}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPanel(null);
                onRegenerate(UNDERSTAND[understand].explain, p.hasMap);
              }}
              className={PRIMARY}
            >
              {p.hasMap ? "Remake map" : "Make map"}
            </button>
          </div>
        </div>
      ) : null}

      {panel === "remove" ? (
        <div className="mx-3 mb-2 mt-1 flex items-center gap-2 border border-clay-line bg-clay-surface/40 px-4 py-2.5">
          <p className="mr-auto text-[12.5px] text-ink">
            Remove <span className="font-semibold">{p.name}</span>? This deletes its map, not the folder.
          </p>
          <button type="button" onClick={() => setPanel(null)} className={QUIET}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className={cn(PRIMARY, "border-clay-ink bg-clay-ink text-paper hover:border-clay-ink hover:bg-clay-ink hover:opacity-90")}
          >
            Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}
