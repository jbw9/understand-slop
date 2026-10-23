"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
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
export function Crumbs({
  repo,
  crumbs,
  onJump,
  map,
  maps,
}: {
  repo: string;
  /** The open map and every map on disk; a switcher shows when there are two. */
  map: string;
  maps: MapEntry[];
  /** One entry per level below the repo, outermost first. */
  crumbs: { id: string; title: string; step?: number }[];
  /** Jump to depth `n` — 0 is the repo. */
  onJump: (depth: number) => void;
}) {
  const router = useRouter();
  const stops = [{ id: "", title: repo, step: undefined as number | undefined }, ...crumbs];
  return (
    <nav
      aria-label="Location"
      className="sticky top-0 z-20 bg-warm-cream/85 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1220px] items-start gap-6 px-10 py-3">
        {maps.length > 1 ? (
          <label className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">map</span>
            <select
              value={map}
              // The router, not pushState: the map is read on the server.
              onChange={(e) => router.push(`?map=${encodeURIComponent(e.target.value)}`)}
              className="rounded-[7px] border border-border-strong bg-pure-white px-2 py-1 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-deep-green"
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
          </label>
        ) : null}
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
        <div className="flex shrink-0 items-center gap-3 pt-0.5 font-mono text-[10.5px] text-faint">
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
