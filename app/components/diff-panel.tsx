"use client";

import { useEffect, useMemo, useState } from "react";
import { DIALOG, Overlay, QUIET } from "@/components/dialog";
import { FileList, OPEN_DIFF, Pill, TINT, WORD, openDiff, useDiff } from "@/components/diff";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import type { SectionDiff, Verdict } from "@/lib/diff";

/**
 * The list of what a commit changed, and a way to each one.
 *
 * The verdicts used to sit in a bar across the top of every level, which put
 * the whole summary on a page that was only showing one of its entries: to
 * find the three sections that moved you had to already know where they were.
 * This is the changed-files list a diff is normally read through — every
 * section with a verdict, the files behind it, and a click that OPENS that
 * level. The panel routes; the level itself is still where the red and green
 * are (components/diff.tsx), which is why nothing here draws a hunk.
 *
 * Mounted once beside the other dialogs and opened by the same event that
 * turns diff mode on, so there is one way in. Leaving is `off`, below.
 */

/**
 * Asks for the panel. The same event that turns diff mode on, so one call both
 * enters the mode and opens its list — which is what a caller that has just
 * set a range (components/acts.tsx) wants.
 */
export const openDiffPanel = openDiff;

const KINDS = ["added", "removed", "changed"] as const;
type Kind = (typeof KINDS)[number];

export function DiffPanel() {
  const d = useDiff();
  const { nodeAt } = useMap();
  const [shown, setShown] = useState(false);
  const [only, setOnly] = useState<Kind | null>(null);

  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(OPEN_DIFF, on);
    return () => window.removeEventListener(OPEN_DIFF, on);
  }, []);

  const diff = d?.diff ?? null;
  const moved = useMemo(() => (diff?.sections ?? []).filter((s) => s.verdict !== "untouched"), [diff]);
  const counts = useMemo(() => KINDS.map((v) => ({ v, n: moved.filter((s) => s.verdict === v).length })), [moved]);

  if (!shown || !d) return null;
  const shownEntries = only ? moved.filter((s) => s.verdict === only) : moved;
  const select =
    "rounded-[5px] border border-border-strong bg-pure-white px-2 py-1 font-mono text-[11.5px] text-ink focus-visible:outline-2 focus-visible:outline-deep-green";

  /** The trail to a section, in the titles the reader sees rather than ids. */
  const trail = (s: SectionDiff) =>
    s.path
      .slice(0, -1)
      .map((_, i) => nodeAt(s.path.slice(0, i + 1))?.title ?? s.path[i])
      .join(" › ");

  return (
    <Overlay onClose={() => setShown(false)}>
      <div className={DIALOG + " max-w-[640px]"}>
        <header className="border-b border-border-gray px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">What changed</h2>
          <p className="mt-0.5 text-[12px] text-muted-slate">
            Pick one to open the level it is on — red is gone, green is new, there.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-faint">from</span>
              <select
                value={d.from ?? ""}
                aria-label="Compare from"
                onChange={(e) => d.setRange(e.target.value || undefined, d.to)}
                className={select}
              >
                <option value="">the map&apos;s commit</option>
                {d.commits.map((c) => (
                  <option key={c.commit} value={c.commit}>
                    {c.commit} {c.subject.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-faint">to</span>
              <select
                value={d.to ?? ""}
                aria-label="Compare to"
                onChange={(e) => d.setRange(d.from, e.target.value || undefined)}
                className={select}
              >
                <option value="">your working tree</option>
                {d.commits.map((c) => (
                  <option key={c.commit} value={c.commit}>
                    {c.commit} {c.subject.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* The counts are the filter: there is no second row of controls
              saying the same numbers twice. */}
          {counts.some((c) => c.n) ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {counts
                .filter((c) => c.n)
                .map((c) => (
                  <button
                    key={c.v}
                    type="button"
                    aria-pressed={only === c.v}
                    onClick={() => setOnly(only === c.v ? null : c.v)}
                    className="cursor-pointer rounded-[6px] focus-visible:outline-2 focus-visible:outline-deep-green"
                    style={only && only !== c.v ? { opacity: 0.45 } : undefined}
                  >
                    <Pill verdict={c.v}>
                      {c.n} {WORD[c.v]}
                    </Pill>
                  </button>
                ))}
              {only ? (
                <button type="button" onClick={() => setOnly(null)} className="cursor-pointer font-mono text-[10.5px] text-faint hover:text-ink">
                  show all
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {d.loading ? <p className="text-[13px] text-muted-slate">Reading the checkout…</p> : null}
          {d.error ? (
            <p className="text-[13px]" style={{ color: TINT.removed.ink }}>
              {d.error}
            </p>
          ) : null}
          {/* A file-level answer never pretends to be a section-level one:
              there are no sections to route to, so it says why and lists the
              files it can stand behind. */}
          {diff && !d.loading && diff.basis === "files" ? (
            <p className="text-[12.5px] leading-snug text-on-surface-variant">
              {diff.why} <FileList diff={diff} />
            </p>
          ) : null}
          {diff && !d.loading && diff.basis === "sections" && !moved.length ? (
            <p className="text-[13px] text-muted-slate">No section changed between these two.</p>
          ) : null}
          {shownEntries.length ? (
            <ul className="flex flex-col gap-1.5">
              {shownEntries.map((s) => (
                <li key={s.path.join("/")}>
                  <Entry section={s} trail={trail(s)} onOpen={() => (goTo(s.path), setShown(false))} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-1.5 border-t border-border-gray px-5 py-3">
          <button
            type="button"
            onClick={() => {
              d.off();
              setShown(false);
            }}
            className="cursor-pointer text-[12.5px] font-medium text-deep-green hover:underline"
          >
            Leave diff
          </button>
          <button type="button" className={QUIET} onClick={() => setShown(false)}>
            Close
          </button>
        </footer>
      </div>
    </Overlay>
  );
}

function Entry({ section, trail, onOpen }: { section: SectionDiff; trail: string; onOpen: () => void }) {
  const t = TINT[section.verdict as Exclude<Verdict, "untouched">];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full cursor-pointer rounded-[8px] border border-border-gray px-3 py-2 text-left hover:border-border-strong hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-deep-green"
    >
      <span className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[12px] leading-none" style={{ color: t.ink }}>
          {t.mark}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{section.title}</span>
          {trail ? <span className="block truncate text-[11.5px] text-muted-slate">{trail}</span> : null}
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: t.ink }}>
          {WORD[section.verdict]}
        </span>
      </span>
      {/* The files behind the verdict: the reason this section is listed. */}
      {section.files.length ? (
        <span className="mt-1 flex flex-col gap-0.5 pl-[18px]">
          {section.files.map((f) => (
            <span key={f.path} className="truncate font-mono text-[11px] text-on-surface-variant">
              {f.path}
              <span className="ml-1.5 text-faint">
                {f.lines.length} {f.lines.length === 1 ? "place" : "places"}
              </span>
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
