"use client";

import { isTauri } from "@tauri-apps/api/core";
import { Fragment, useMemo, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMap } from "@/components/map-context";
import type { Node } from "@/lib/data";
import type { MapEntry } from "@/lib/maps";
import { cn } from "@/lib/utils";

/**
 * Where you are, and the way back — one line across the top of the page.
 *
 * This is the sentence you say out loud when someone asks what you are looking
 * at — "explorify, Sign Up, Student Sign-Up". It used to be a 232px rail down
 * the left, which spent a whole column on two or three names and boxed the
 * page in. Now it sits on the page's own background, sticks while you scroll,
 * and WRAPS rather than eliding when the path gets deep, so no stop is ever
 * hidden — the reason the rail existed.
 */
const noSubscribe = () => () => {};

/** One stop on the way down: a level below the repo, outermost first. */
export interface Crumb {
  id: string;
  title: string;
  step?: number;
}

/**
 * Where you are: the open path, root-first, read from the URL
 * (`?at=engine&at=eng-math`), and its levels as crumbs. `[]` is the repo.
 *
 * The URL rather than state because every level is then a history entry:
 * the browser's back button and the trackpad's two-finger swipe step back
 * the way they do everywhere else, and a level can be linked or reloaded.
 * The map and the title bar both read it, so they always agree.
 */
export function useLocation(): { path: string[]; crumbs: Crumb[] } {
  const { nodeAt, stepOf } = useMap();
  const params = useSearchParams();
  // The deepest level asked for that the map still has: an update can take
  // a section away while it is open.
  const path = useMemo(() => {
    const asked = params.getAll("at");
    let n = asked.length;
    while (n && !nodeAt(asked.slice(0, n))) n--;
    return asked.slice(0, n);
  }, [params, nodeAt]);
  const crumbs = useMemo(
    () =>
      path
        .map((_, i) => nodeAt(path.slice(0, i + 1)))
        .filter((n): n is Node => n !== null)
        .map((n) => ({ id: n.id, title: n.title, step: stepOf(n.id)?.n })),
    [path, nodeAt, stepOf],
  );
  return { path, crumbs };
}

/**
 * Opens a level. Native pushState is integrated with the App Router:
 * `useSearchParams` follows it, and so does back/forward.
 */
export function goTo(next: string[]) {
  const q = new URLSearchParams();
  const now = new URLSearchParams(window.location.search);
  const map = now.get("map");
  if (map) q.set("map", map);
  // The landing page's frame stays an embed as the visitor goes deeper.
  if (now.has("embed")) q.set("embed", "");
  for (const id of next) q.append("at", id);
  window.history.pushState(null, "", q.size ? `?${q}` : window.location.pathname);
}

/**
 * The levels below the repo, each a way back up — the title bar's trail in
 * the desktop app. Clicking one opens it; the last is where you are.
 */
export function Trail({ crumbs, onJump }: { crumbs: Crumb[]; onJump: (depth: number) => void }) {
  return (
    <ol className="flex min-w-0 items-center">
      {crumbs.map((c, i) => {
        const here = i === crumbs.length - 1;
        return (
          <Fragment key={c.id}>
            <li aria-hidden className="shrink-0 px-0.5 text-[12px] text-faint">
              ›
            </li>
            <li className={cn("min-w-0", here ? "shrink-0" : "shrink")}>
              <button
                type="button"
                onClick={() => onJump(i + 1)}
                disabled={here}
                aria-current={here ? "page" : undefined}
                title={c.title}
                className={cn(
                  "block max-w-full truncate rounded-[5px] px-1.5 py-0.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-deep-green",
                  here ? "font-semibold text-ink" : "cursor-pointer text-muted-slate hover:bg-surface-container hover:text-ink",
                )}
              >
                {c.step ? <span className="mr-1 font-mono text-[10.5px] text-faint">{c.step}</span> : null}
                {c.title}
              </button>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Which map is open, and every other one to switch to: the reader's own
 * projects first, then the examples that ship with the app.
 */
export function MapSwitcher({ map, maps, className }: { map: string; maps: MapEntry[]; className?: string }) {
  const router = useRouter();
  return (
    <select
      value={map}
      aria-label="Map"
      // The router, not pushState: the map is read on the server.
      onChange={(e) => router.push(`?map=${encodeURIComponent(e.target.value)}`)}
      className={className}
    >
      {[
        { label: "Your projects", entries: maps.filter((m) => m.local) },
        { label: "Examples", entries: maps.filter((m) => !m.local) },
      ].map((g) =>
        g.entries.length ? (
          <optgroup key={g.label} label={g.label}>
            {g.entries.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ) : null,
      )}
    </select>
  );
}

export function Crumbs({
  repo,
  crumbs,
  onJump,
  map,
  maps,
}: {
  repo: string;
  /** The open map and every map on disk; outside the desktop app a switcher shows when there are two. */
  map: string;
  maps: MapEntry[];
  /** One entry per level below the repo, outermost first. */
  crumbs: { id: string; title: string; step?: number }[];
  /** Jump to depth `n` — 0 is the repo. */
  onJump: (depth: number) => void;
}) {
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const stops = [{ id: "", title: repo, step: undefined as number | undefined }, ...crumbs];
  return (
    <nav
      aria-label="Location"
      className="sticky left-0 top-0 z-20 bg-warm-cream/85 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1220px] items-start gap-6 px-10 py-3">
        {/* In the desktop app the switcher lives in the title bar. */}
        {desktop || maps.length < 2 ? null : (
          <label className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">map</span>
            <MapSwitcher
              map={map}
              maps={maps}
              className="rounded-[5px] border border-border-strong bg-pure-white px-2 py-1 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-deep-green"
            />
          </label>
        )}
        <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
          {stops.map((c, i) => {
            const here = i === stops.length - 1;
            return (
              <Fragment key={c.id || "repo"}>
                {i > 0 ? (
                  <li aria-hidden className="text-[13px] text-faint">
                    ›
                  </li>
                ) : null}
                <li>
                  <button
                    onClick={() => onJump(i)}
                    disabled={here}
                    aria-current={here ? "page" : undefined}
                    className={cn(
                      "rounded-[5px] px-1.5 py-0.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-deep-green",
                      i === 0 && "font-mono text-[12.5px]",
                      here ? "font-semibold text-ink" : "text-muted-slate hover:bg-surface-container-low hover:text-ink",
                    )}
                  >
                    {c.step ? <span className="mr-1 font-mono text-[11px] text-faint">{c.step}</span> : null}
                    {c.title}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
        <div className="hidden shrink-0 items-center gap-3 pt-0.5 font-mono text-[10.5px] text-faint sm:flex">
          <Hint k="esc">back</Hint>
          <Hint k="0">top</Hint>
        </div>
      </div>
    </nav>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded-[3px] border border-border-gray bg-surface px-1.5 py-0.5 text-[10px] text-muted-slate">
        {k}
      </kbd>
      {children}
    </span>
  );
}
