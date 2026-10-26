"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DIALOG, Field, INPUT, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMap } from "@/components/map-context";
import { PanelHead } from "@/components/panel";
import { readSettings } from "@/lib/settings";
import type { Progress, Project } from "@/lib/vault";
import { cn } from "@/lib/utils";

/**
 * The project list: the reader's own projects, imported from this machine and
 * kept in the app's vault (lib/vault.ts), and the examples that ship with the
 * app. Importing one maps it straight away through the reader's Claude Code;
 * the list follows the run, and the map opens from here or the picker once
 * it is made.
 */

const OPEN = "slop:projects";
/** Opens the list; with a folder, ready to import it. */
export const openProjects = (root?: string) => window.dispatchEvent(new CustomEvent<string | undefined>(OPEN, { detail: root }));

type Listed = Project & { hasMap: boolean; stale: boolean; progress?: Progress };
interface List {
  vault: string;
  examples: string[];
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
  const { name: current } = useMap();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<List | null>(null);
  const [root, setRoot] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await post(body);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    const { open: pick } = await import("@tauri-apps/plugin-dialog");
    const dir = await pick({ directory: true, title: "Choose a project folder" });
    if (typeof dir === "string") setRoot(dir);
  };

  const importIt = async () => {
    try {
      const claude = await claudePath();
      if (await act({ action: "import", root: root.trim(), name: label.trim(), claude })) {
        setRoot("");
        setLabel("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const regenerate = async (id: string) => {
    try {
      await act({ action: "regenerate", id, claude: await claudePath() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void importIt();
            }}
            className="flex flex-col gap-4 rounded-[8px] border border-border-gray bg-surface px-4 py-4"
          >
            <Field label="Import a project" hint="A folder on this machine. Its map is made right away with your Claude Code — about 20 minutes for a mid-sized repo, counted against your plan's usage.">
              <div className="flex gap-2">
                <input
                  value={root}
                  onChange={(e) => setRoot(e.target.value)}
                  placeholder="~/code/my-app"
                  spellCheck={false}
                  className={INPUT}
                />
                {isTauri() ? (
                  <button type="button" onClick={() => void browse()} className={cn(QUIET, "shrink-0 border border-border-gray bg-pure-white")}>
                    Browse…
                  </button>
                ) : null}
              </div>
            </Field>
            <Field label="Name" hint="Blank uses the folder's name.">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="my-app" spellCheck={false} className={INPUT} />
            </Field>
            <div className="flex items-center justify-end gap-3">
              {error ? <p className="mr-auto text-[12.5px] text-clay-ink">{error}</p> : null}
              <button type="submit" disabled={busy || !root.trim()} className={PRIMARY}>
                Import and map it
              </button>
            </div>
          </form>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Your projects</h3>
            {list?.projects.length ? (
              <ul className="flex flex-col divide-y divide-border-gray rounded-[8px] border border-border-gray">
                {list.projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    p={p}
                    current={p.id === current}
                    busy={busy}
                    onOpen={(at) => openMap(p.id, at)}
                    onRegenerate={() => void regenerate(p.id)}
                    onCancel={() => void act({ action: "cancel", id: p.id })}
                    onRemove={() => void act({ action: "remove", id: p.id })}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint">{list ? "None yet. Import one above." : "Loading…"}</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Examples</h3>
            <div className="flex flex-wrap gap-1.5">
              {list?.examples.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openMap(id)}
                  className={cn(
                    "cursor-pointer rounded-[6px] border px-2.5 py-1 font-mono text-[11.5px]",
                    id === current
                      ? "border-mint-line bg-mint-success text-deep-green"
                      : "border-border-gray text-on-surface-variant hover:border-border-strong hover:text-ink",
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
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
  onRegenerate: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  // Forgetting a project takes a second click: it deletes the map, not the code.
  const [confirm, setConfirm] = useState(false);
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
          <button type="button" onClick={onRegenerate} disabled={busy} className={cn(QUIET, "py-1")}>
            {status === "ready" ? "Regenerate" : "Retry"}
          </button>
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
              : "✗ Mapping failed."}
      </p>
      {status === "generating" && p.progress?.roots.length ? <Roots roots={p.progress.roots} onOpen={onOpen} /> : null}
      {status === "failed" && p.map.error ? (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-[5px] bg-clay-surface/60 px-2.5 py-2 font-mono text-[11px] text-clay-ink">
          {p.map.error}
        </pre>
      ) : null}
    </li>
  );
}
