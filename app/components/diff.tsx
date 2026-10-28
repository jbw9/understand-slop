"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BOX_H, layoutDiagram } from "@/lib/diagram";
import type { Anatomy } from "@/lib/data";
import type { BlockDiff, MapDiff, PartDiff, RowDiff, Verdict } from "@/lib/diff";
import { cn } from "@/lib/utils";

/**
 * Diff mode: the same level, saying what a commit did to it.
 *
 * Not a separate screen. A diff view beside the map would be a second thing to
 * learn and would lose the one property that makes this worth building — that
 * the reader already knows where everything on this level is, so a red row and
 * a green row in a place they recognise is a review they can do at a glance.
 * So every piece here DECORATES: `SectionTint` wraps a card the canvas already
 * draws, `SchemaDiff` replaces one block with the same block in two colours.
 *
 * What is gone stays on screen. The whole claim of "the old schema in red
 * beside the new in green" is that both are visible at once; a diff that only
 * shows what is now there is the file listing the reader was already able to
 * get from git.
 *
 * Red/green are `--color-diff-*` (app/globals.css), read through inline
 * `var()` rather than Tailwind classes — see the note there. They are
 * deliberately not the state families: a verdict is about a commit, a state is
 * about the analysis, and tinting one with the other's colours would claim
 * that a deleted thing was alarming.
 */

/* ── the tokens, as the only place that names them ───────────── */

export const TINT: Record<Exclude<Verdict, "untouched">, { ink: string; surface: string; line: string; mark: string }> = {
  added: { ink: "var(--color-diff-add-ink)", surface: "var(--color-diff-add-surface)", line: "var(--color-diff-add-line)", mark: "+" },
  removed: { ink: "var(--color-diff-remove-ink)", surface: "var(--color-diff-remove-surface)", line: "var(--color-diff-remove-line)", mark: "−" },
  // `changed` borrows the amber family, which already means "look here, this
  // is not settled" everywhere else on the page.
  changed: { ink: "var(--color-amber-ink)", surface: "var(--color-amber-surface)", line: "var(--color-amber-line)", mark: "~" },
};

export const WORD: Record<Verdict, string> = { added: "new", removed: "gone", changed: "changed", untouched: "unchanged" };

/* ── loading one ─────────────────────────────────────────────── */

export interface DiffState {
  /** null while off: diff mode is the presence of an answer, not a flag beside one. */
  diff: MapDiff | null;
  loading: boolean;
  error?: string;
  from?: string;
  to?: string;
  commits: { commit: string; subject: string }[];
  setRange: (from?: string, to?: string) => void;
  off: () => void;
}

const Ctx = createContext<DiffState | null>(null);

/** The open diff, or null. Any component on a level can ask without being passed it. */
export const useDiff = () => useContext(Ctx);

/** The verdict on one section, by the path the canvas navigates by. */
export function useVerdict(path: string[]): Verdict {
  const d = useDiff();
  const key = path.join("/");
  return useMemo(() => d?.diff?.sections.find((s) => s.path.join("/") === key)?.verdict ?? "untouched", [d, key]);
}

/** This level's block diffs, by index in `anatomy`. */
export function useBlockDiffs(path: string[]): Map<number, BlockDiff> {
  const d = useDiff();
  const key = path.join("/");
  return useMemo(
    () => new Map((d?.diff?.blocks ?? []).filter((b) => b.path.join("/") === key).map((b) => [b.at, b])),
    [d, key],
  );
}

/**
 * Holds the comparison for everything below it. Mounted once, around the
 * canvas; `on` turns the mode on and the provider does the fetching, so no
 * level has to know the API exists.
 */
export const OPEN_DIFF = "slop:diff";

/**
 * Anything can ask for diff mode: the title bar's button dispatches this, and
 * `DiffPanel` (components/diff-panel.tsx) opens on the same event.
 */
export const openDiff = () => window.dispatchEvent(new Event(OPEN_DIFF));

/**
 * Diff mode, owned here and asked for from anywhere — the same event-bus shape
 * Settings and Projects use, so the title bar does not have to hold state the
 * canvas is the one to read.
 *
 * The event only ever turns the mode ON. Leaving is `off`, which the panel's
 * "Leave diff" calls — one way in and one way out, rather than a flip whose
 * meaning depends on state the title bar cannot see.
 */
export function DiffMode({ map, children }: { map: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const go = () => setOn(true);
    window.addEventListener(OPEN_DIFF, go);
    return () => window.removeEventListener(OPEN_DIFF, go);
  }, []);
  return (
    <DiffProvider map={map} on={on} onOff={() => setOn(false)}>
      {children}
    </DiffProvider>
  );
}

export function DiffProvider({ map, on, onOff, children }: { map: string; on: boolean; onOff: () => void; children: React.ReactNode }) {
  const [range, setR] = useState<{ from?: string; to?: string }>({});
  const [commits, setCommits] = useState<{ commit: string; subject: string }[]>([]);
  /**
   * The answer and the question it answers, in one piece of state. `loading` is
   * then derived — whether the answer in hand is for the comparison being
   * asked about — rather than a second flag set from inside the effect, which
   * is the cascading render `react-hooks/set-state-in-effect` is about and
   * which `useInstalled` (components/agents.tsx) avoids the same way.
   */
  const [got, setGot] = useState<{ q: string; diff?: MapDiff; error?: string }>();
  const q = new URLSearchParams({ map });
  if (range.from) q.set("from", range.from);
  if (range.to) q.set("to", range.to);
  const asked = q.toString();

  useEffect(() => {
    // Nothing is cleared on the way out: `value` below hands out null while
    // off, so the last answer is simply not read, and turning the mode back on
    // re-fetches over it.
    if (!on) return;
    let live = true;
    fetch(`/api/diff?${asked}`)
      .then((r) => r.json())
      .then((j) => live && setGot(j.error ? { q: asked, error: j.error } : { q: asked, diff: j as MapDiff }))
      .catch(() => live && setGot({ q: asked, error: "Could not read the checkout." }));
    return () => {
      live = false;
    };
  }, [on, asked]);

  useEffect(() => {
    if (!on || commits.length) return;
    let live = true;
    fetch(`/api/diff?map=${encodeURIComponent(map)}&commits=1`)
      .then((r) => r.json())
      .then((j) => live && setCommits(j.commits ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [map, on, commits.length]);

  const setRange = useCallback((from?: string, to?: string) => setR({ from, to }), []);
  const here = got?.q === asked ? got : undefined;
  const value = useMemo<DiffState>(
    () => ({ diff: on ? (here?.diff ?? null) : null, loading: on && !here, error: here?.error, ...range, commits, setRange, off: onOff }),
    [on, here, range, commits, setRange, onOff],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A verdict as a word in its own colours. Shared with the diff panel. */
export function Pill({ verdict, children }: { verdict: Exclude<Verdict, "untouched">; children: React.ReactNode }) {
  const t = TINT[verdict];
  return (
    <span
      className="rounded-[6px] border px-2 py-[3px] font-mono text-[10.5px] leading-none"
      style={{ color: t.ink, background: t.surface, borderColor: t.line }}
    >
      {children}
    </span>
  );
}

/** The changed files with their line counts — the file-level answer. */
export function FileList({ diff }: { diff: MapDiff }) {
  if (!diff.files.length) return <span className="text-muted-slate">Nothing changed.</span>;
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {diff.files.map((f) => (
        <span key={f.path} className="font-mono text-[11px]">
          <span className="text-on-surface">{f.path}</span>{" "}
          <span style={{ color: TINT.added.ink }}>+{f.added}</span> <span style={{ color: TINT.removed.ink }}>−{f.removed}</span>
        </span>
      ))}
    </span>
  );
}

/* ── a section card, tinted ──────────────────────────────────── */

/**
 * Wraps a card or row the canvas already drew. `untouched` returns the child
 * untouched — a diff that restyled every card would make the three that moved
 * harder to find, not easier.
 */
export function SectionTint({ path, children }: { path: string[]; children: React.ReactNode }) {
  const verdict = useVerdict(path);
  if (verdict === "untouched") return children;
  const t = TINT[verdict];
  return (
    <div className="relative rounded-[8px]" style={{ background: t.surface, boxShadow: `inset 0 0 0 1.5px ${t.line}` }}>
      <span
        className="absolute -top-2 left-3 z-10 rounded-[5px] border px-1.5 py-[2px] font-mono text-[9.5px] uppercase leading-none tracking-[0.08em]"
        style={{ color: t.ink, background: t.surface, borderColor: t.line }}
      >
        {WORD[verdict]}
      </span>
      {/* Struck, not hidden: the reader has to be able to read what went. */}
      <div className={cn(verdict === "removed" && "opacity-70 [&_*]:line-through")}>{children}</div>
    </div>
  );
}

/**
 * The sections this level had and no longer does, listed under its own cards.
 * Nothing else on the page can show these — they are not in the tree any more
 * — so without this the one verdict a reviewer most needs is the one that
 * cannot be rendered.
 */
export function RemovedSections({ path }: { path: string[] }) {
  const d = useDiff();
  const here = (d?.diff?.sections ?? []).filter((s) => s.verdict === "removed" && s.path.length === path.length + 1 && s.path.slice(0, -1).join("/") === path.join("/"));
  if (!here.length) return null;
  const t = TINT.removed;
  return (
    <div className="mt-4 space-y-2">
      {here.map((s) => (
        <div
          key={s.id}
          className="rounded-[8px] border px-4 py-3"
          style={{ background: t.surface, borderColor: t.line }}
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] line-through" style={{ color: t.ink }}>
              {s.title}
            </span>
            <Pill verdict="removed">gone</Pill>
          </span>
          {s.files.length ? (
            <span className="mt-1 block font-mono text-[11px] text-muted-slate">{s.files.map((f) => f.path).join(", ")}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── a block, in two colours ─────────────────────────────────── */

/**
 * One block, diffed. Returns null where this block did not move, so the level
 * goes on rendering its own — the diff only ever replaces what it has
 * something to say about.
 */
export function BlockDiffView({ block, diff }: { block: Anatomy; diff: BlockDiff }) {
  if (diff.boxes && block.kind === "diagram") return <DiagramDiff block={block} boxes={diff.boxes} arrows={diff.arrows ?? []} />;
  if (diff.rows) return <RowsDiff kind={diff.kind} rows={diff.rows} block={block} />;
  return <Replaced verdict={diff.verdict} kind={diff.kind} />;
}

function Replaced({ verdict, kind }: { verdict: Verdict; kind: string }) {
  if (verdict === "untouched") return null;
  return (
    <p className="text-[12.5px] text-on-surface-variant">
      <Pill verdict={verdict as Exclude<Verdict, "untouched">}>{WORD[verdict]}</Pill>{" "}
      <span className="font-mono text-[11.5px]">{kind}</span> block
    </p>
  );
}

/**
 * A `schema` or `table`, row-wise: the dropped column red and struck, the new
 * ones green, in place among the ones that stayed. One table, not two side by
 * side — a reader comparing two tables is doing the diff themselves, which is
 * the work this is meant to have already done.
 */
function RowsDiff({ kind, rows, block }: { kind: Anatomy["kind"]; rows: RowDiff[]; block: Anatomy }) {
  const columns =
    block.kind === "schema"
      ? ["column", "type", "key", "null", "note"]
      : block.kind === "table"
        ? block.columns
        : null;
  const title = block.kind === "schema" ? block.table : block.kind === "table" ? block.caption : undefined;
  return (
    <div className="min-w-0">
      {title ? <p className="mb-2.5 font-mono text-[12.5px] font-semibold text-ink">{title}</p> : null}
      <div className="overflow-x-auto rounded-[8px] border border-border-gray bg-pure-white">
        <table className="w-full border-collapse text-left text-[13px]">
          {columns ? (
            <thead>
              <tr className="border-b border-border-gray bg-surface">
                <th className="w-7 px-2 py-2" />
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-faint">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((r, i) => {
              const t = r.verdict === "untouched" ? null : TINT[r.verdict];
              // A removed row shows what it was; everything else shows what it
              // is now, with the old cells kept beside a changed one.
              const cells = r.verdict === "removed" ? (r.before ?? []) : (r.after ?? r.before ?? []);
              return (
                <tr key={`${r.key}-${i}`} className="border-b border-border-gray last:border-0" style={t ? { background: t.surface } : undefined}>
                  <td className="px-2 py-2 align-top font-mono text-[12px] leading-snug" style={t ? { color: t.ink } : undefined}>
                    {t?.mark}
                  </td>
                  {cells.map((cell, j) => (
                    <td
                      key={j}
                      className={cn("px-3 py-2 align-top leading-snug", r.verdict === "removed" && "line-through", j === 0 && "font-medium")}
                      style={t ? { color: t.ink } : undefined}
                    >
                      {cell}
                      {/* Only a changed cell carries its old value, right where
                          the reader is already looking. */}
                      {r.verdict === "changed" && r.before?.[j] !== undefined && r.before[j] !== cell ? (
                        <span className="ml-2 line-through" style={{ color: TINT.removed.ink }}>
                          {r.before[j]}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-faint">{kind} · red went, green arrived</p>
    </div>
  );
}

/**
 * The picture, diffed: the boxes a commit took out in red, the ones it added
 * in green, on ONE diagram. Both sets are laid out together — a box that is
 * gone keeps its place in the grid, so a changed database architecture reads
 * as the old shape fading out of the new one rather than as two pictures the
 * reader has to align by eye.
 *
 * Fills and strokes are inline `var()`, which is exactly why the diff tokens
 * are declared outside `@theme` (app/globals.css).
 */
export function DiagramDiff({
  block,
  boxes,
  arrows,
  legend = "red went, green arrived",
}: {
  block: Extract<Anatomy, { kind: "diagram" }>;
  boxes: PartDiff[];
  arrows: PartDiff[];
  /** What the colours mean here: a plan's are still to come (components/plan.tsx). */
  legend?: string;
}) {
  const verdictOf = new Map(boxes.map((b) => [b.key, b.verdict]));
  const arrowOf = new Map(arrows.map((a) => [a.key, a.verdict]));
  // Boxes the `to` side added are not in this block, so they are placed after
  // the ones that are, on a row of their own.
  const extra = boxes.filter((b) => b.verdict === "added" && !block.boxes.some((x) => x.id === b.key));
  const row = Math.max(0, ...block.boxes.map((b) => b.row)) + 1;
  const whole: Extract<Anatomy, { kind: "diagram" }> = {
    ...block,
    boxes: [...block.boxes, ...extra.map((b, i) => ({ id: b.key, label: b.label ?? b.key, col: i, row }))],
  };
  const { W, H, boxes: placed, arrows: drawn } = layoutDiagram(whole);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 max-w-[1000px]">
        <span className="text-[14px] font-medium text-on-surface">{block.caption}</span>
        <span className="ml-2.5 whitespace-nowrap font-mono text-[10.5px] text-faint">{legend}</span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${block.caption} — what changed`} className="block h-auto" style={{ width: "100%", maxWidth: W * 1.35, minWidth: W * 0.7 }}>
          <defs>
            {(["added", "removed", "changed", "untouched"] as const).map((v) => (
              <marker key={v} id={`dd-${v}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M1 1.2L7 4 1 6.8z" fill={v === "untouched" ? "var(--color-wire)" : TINT[v].line} />
              </marker>
            ))}
          </defs>
          {/* `from`/`to` and not the index: the layout collapses two arrows
              between the same pair into one line, so positions do not line up
              with `block.arrows`. */}
          {drawn.map(({ d, label, from, to }, i) => {
            const v = arrowOf.get(`${from}→${to}`) ?? "untouched";
            const t = v === "untouched" ? null : TINT[v];
            return (
              <g key={i} opacity={v === "untouched" ? 0.45 : 1}>
                <path
                  d={d}
                  fill="none"
                  stroke={t?.line ?? "var(--color-wire)"}
                  strokeWidth={t ? 2 : 1.5}
                  strokeDasharray={v === "removed" ? "5 4" : undefined}
                  markerEnd={`url(#dd-${v})`}
                />
                {label ? (
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor={label.anchor}
                    fontSize="12"
                    fill={t?.ink ?? "var(--color-muted-slate)"}
                    stroke="var(--color-warm-cream)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {label.text}
                  </text>
                ) : null}
              </g>
            );
          })}
          {placed.map(({ x, y, w, b }) => {
            const v = verdictOf.get(b.id) ?? "untouched";
            const t = v === "untouched" ? null : TINT[v];
            return (
              <g key={b.id} opacity={v === "untouched" ? 0.5 : 1}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={BOX_H}
                  rx="6"
                  fill={t?.surface ?? "var(--color-pure-white)"}
                  stroke={t?.line ?? "var(--color-border-strong)"}
                  strokeWidth={t ? 2 : 1.5}
                  strokeDasharray={v === "removed" ? "5 4" : undefined}
                />
                <text
                  x={x + w / 2}
                  y={b.sub ? y + 25 : y + BOX_H / 2 + 5}
                  textAnchor="middle"
                  fontSize="14.5"
                  fontWeight="600"
                  fill={t?.ink ?? "var(--color-ink)"}
                  textDecoration={v === "removed" ? "line-through" : undefined}
                >
                  {b.label}
                </text>
                {b.sub ? (
                  <text x={x + w / 2} y={y + 43} textAnchor="middle" fontSize="12" fill="var(--color-faint)">
                    {b.sub}
                  </text>
                ) : null}
                {t ? (
                  <text x={x + w - 11} y={y + 18} textAnchor="middle" fontSize="15" fontWeight="700" fill={t.ink}>
                    {t.mark}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
