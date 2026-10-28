"use client";

import { useCallback, useEffect, useState } from "react";
import { DIALOG, Overlay, PRIMARY, QUIET } from "@/components/dialog";
import { useMap } from "@/components/map-context";
import { cn } from "@/lib/utils";
import type { Entry, Orphan, Version } from "@/lib/overlay";

/**
 * Everything the reader has added to this map, and every version of it.
 *
 * The map itself is the generator's and is replaced whenever the code moves,
 * so this is the one place the reader's own work is listed as work: what they
 * added, what it replaced, and a way back to any earlier state. Reverting is
 * itself recorded, so no step here loses anything.
 */

const OPEN = "slop:history";
export const openHistory = () => window.dispatchEvent(new Event(OPEN));

interface State {
  overlay: { entries: Entry[] };
  history: Version[];
  orphans: Orphan[];
}

const when = (at: string) =>
  new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** What one entry is, in the reader's terms rather than the file's. */
function says(e: Entry): string {
  const where = (e.kind === "section" ? e.parent : e.path).join(" › ") || "the repository";
  if (e.kind === "field") return `Your words for ${where}`;
  if (e.kind === "section") return `A new part under ${where}: ${e.node.title}`;
  return `A ${e.block.kind} on ${where}`;
}

export function HistoryDialog() {
  const map = useMap();
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);

  const load = useCallback(() => {
    fetch(`/api/overlay?map=${encodeURIComponent(map.name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState(d ? { overlay: d.overlay, history: d.history, orphans: d.orphans } : null))
      .catch(() => setState(null));
  }, [map.name]);

  useEffect(() => {
    if (shown) load();
  }, [shown, load]);

  if (!shown) return null;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const ok = await fetch("/api/overlay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ map: map.name, ...body }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setBusy(false);
    // The map is composed on the server, so the level redraws from the overlay.
    if (ok) window.location.reload();
  }

  const entries = state?.overlay.entries ?? [];
  const orphaned = new Set((state?.orphans ?? []).map((o) => o.id));

  return (
    <Overlay onClose={() => setShown(false)}>
      <div className={cn(DIALOG, "max-w-[620px]")}>
        <header className="border-b border-border-gray px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">What you added</h2>
          <p className="mt-0.5 text-[12px] text-muted-slate">
            Kept beside the map, never inside it — so remapping the code never writes over your work.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {state === null ? (
            <p className="text-[13px] text-muted-slate">
              Only your own imported projects keep additions. An example is read-only.
            </p>
          ) : (
            <>
              {entries.length ? (
                <ul className="mb-6 flex flex-col gap-1.5">
                  {entries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-start justify-between gap-3 rounded-[3px] border border-border-gray px-3 py-2"
                    >
                      <span className="min-w-0 text-[13px] text-ink">
                        {says(e)}
                        {orphaned.has(e.id) ? (
                          // Kept, not deleted: a remap that renamed a section
                          // must never silently destroy a note.
                          <span className="mt-0.5 block text-[11.5px] text-amber-ink">
                            The part this belonged to is gone — it is kept, but shown nowhere.
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => post({ action: "remove", id: e.id })}
                        className="shrink-0 cursor-pointer font-mono text-[11px] text-faint hover:text-clay-ink"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-6 text-[13px] text-muted-slate">
                  Nothing yet. Ask Claude about a level and keep the answer.
                </p>
              )}

              {state.history.length ? (
                <>
                  <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.09em] text-faint">
                    Earlier versions
                  </p>
                  <ul className="flex flex-col gap-1">
                    {state.history.map((v) => (
                      <li key={v.at} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 text-[12.5px] text-on-surface-variant">
                          <span className="font-mono text-[11px] text-faint">{when(v.at)}</span> · {v.label}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => post({ action: "revert", at: v.at })}
                          className="shrink-0 cursor-pointer font-mono text-[11px] text-deep-green hover:underline"
                        >
                          revert
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-1.5 border-t border-border-gray px-5 py-3">
          <button type="button" className={QUIET} onClick={() => setShown(false)}>
            Close
          </button>
          <button type="button" className={PRIMARY} onClick={load} disabled={busy}>
            Refresh
          </button>
        </footer>
      </div>
    </Overlay>
  );
}
