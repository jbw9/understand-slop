"use client";

import { useState } from "react";
import { Hunks, TINT, WORD, openDiff, useDiff } from "@/components/diff";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { hunksOf, type HunkLines } from "@/lib/hunks";
import type { FileChange, MapDiff, SectionDiff, Verdict } from "@/lib/diff";
import { cn } from "@/lib/utils";

/**
 * A change read the way a pull request is (D78): where it is, how big, and
 * the lines themselves — on the picture the reader is already looking at.
 * `DiffBar` says a change is being shown and steps through every place it
 * touched; a diagram tags each box with its "+N −M" and lists, under the
 * picture, each changed box opening onto its red and green lines.
 */

export type Kind = Exclude<Verdict, "untouched">;

export interface Changed {
  section: SectionDiff;
  verdict: Kind;
  added: number;
  removed: number;
  /** Each file with lines this section (or one under it) cites, and which of its hunks touch them. */
  files: { change: FileChange; only: (h: HunkLines) => boolean }[];
}

/**
 * What changed under one section, itself included: the hunks that touch the
 * lines its sections cite. A box on an overview is the way down to every
 * change beneath it, so it counts them all.
 */
export function changesUnder(diff: MapDiff, id: string): Changed | null {
  const own = diff.sections.find((s) => s.id === id);
  if (!own) return null;
  const verdict = own.verdict !== "untouched" ? own.verdict : own.inside ? "changed" : null;
  if (!verdict) return null;
  const spans = new Map<string, { s: number; e: number }[]>();
  for (const s of diff.sections) {
    if (s.verdict === "untouched" || !s.path.includes(id)) continue;
    for (const f of s.files) spans.set(f.path, [...(spans.get(f.path) ?? []), ...f.lines.map((l) => l.at ?? { s: l.s, e: l.e })]);
  }
  let added = 0;
  let removed = 0;
  const files: Changed["files"] = [];
  for (const [path, at] of spans) {
    const change = diff.files.find((c) => (c.mapped ?? c.path) === path);
    if (!change) continue;
    // A hunk counts where its old side meets a cited span — the test the
    // code popup's "What changed here" makes (components/explain.tsx).
    const only = (h: HunkLines) => {
      const old = h.lines.map((l) => l.old ?? h.oldStart);
      const lo = Math.min(...old);
      const hi = Math.max(...old);
      return at.some((sp) => lo <= sp.e && hi >= sp.s);
    };
    const hunks = hunksOf(change.diff).filter(only);
    if (!hunks.length) continue;
    for (const h of hunks) {
      for (const l of h.lines) {
        if (l.kind === "+") added++;
        else if (l.kind === "-") removed++;
      }
    }
    files.push({ change, only });
  }
  return { section: own, verdict, added, removed, files };
}

/** GitHub's five squares: how much of the change was added, how much removed. */
export function StatBlocks({ added, removed }: { added: number; removed: number }) {
  const total = added + removed;
  const green = total ? Math.round((added / total) * 5) : 0;
  return (
    <span aria-hidden className="inline-flex gap-[2px]">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="size-[7px]"
          style={{ background: !total ? "var(--color-border-gray)" : i < green ? TINT.added.ink : TINT.removed.ink }}
        />
      ))}
    </span>
  );
}

/**
 * Under a diagram: every changed box, in the picture's order, each opening
 * onto the lines that changed beneath it. Hovering a row lights its box.
 */
export function DiagramChanges({
  items,
  onHover,
  onOpen,
}: {
  items: { box: string; label: string; opens: string; ch: Changed }[];
  onHover: (box: string | null) => void;
  onOpen?: (id: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!items.length) return null;
  const flip = (box: string) => setOpen((o) => (o.has(box) ? new Set([...o].filter((x) => x !== box)) : new Set([...o, box])));
  return (
    <div className="mt-4 max-w-[1100px] overflow-hidden border border-border-gray">
      <p className="border-b border-border-gray bg-surface-container-low px-3 py-1.5 text-[12px] text-muted-slate">
        {items.length} {items.length === 1 ? "part" : "parts"} of this picture changed — open one to read its lines
      </p>
      {items.map(({ box, label, opens, ch }) => {
        const t = TINT[ch.verdict];
        const shown = open.has(box);
        return (
          <div key={box} className="border-b border-border-gray last:border-b-0" onMouseEnter={() => onHover(box)} onMouseLeave={() => onHover(null)}>
            <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-container-low">
              <button type="button" aria-expanded={shown} onClick={() => flip(box)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                <span className="w-2.5 shrink-0 text-[11px] text-faint">{shown ? "▾" : "▸"}</span>
                <span className="w-3 shrink-0 text-center font-mono text-[12px] font-bold" style={{ color: t.ink }}>
                  {t.mark}
                </span>
                <span className={cn("min-w-0 truncate text-[13px] font-semibold text-ink", ch.verdict === "removed" && "line-through")}>{label}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: t.ink }}>
                  {WORD[ch.verdict]}
                </span>
                {ch.files.length ? (
                  <span className="shrink-0 text-[11.5px] text-faint">
                    {ch.files.length} {ch.files.length === 1 ? "file" : "files"}
                  </span>
                ) : null}
              </button>
              {ch.added || ch.removed ? (
                <span className="tnum flex shrink-0 items-center gap-2 font-mono text-[11px]">
                  <span style={{ color: TINT.added.ink }}>+{ch.added}</span>
                  <span style={{ color: TINT.removed.ink }}>−{ch.removed}</span>
                  <StatBlocks added={ch.added} removed={ch.removed} />
                </span>
              ) : null}
              {onOpen && ch.verdict !== "removed" ? (
                <button type="button" onClick={() => onOpen(opens)} className="shrink-0 cursor-pointer text-[12px] text-accent hover:underline">
                  open ›
                </button>
              ) : null}
            </div>
            {shown ? (
              <div className="space-y-3 px-3 pb-3">
                {ch.files.length ? (
                  ch.files.map((f) => (
                    <div key={f.change.path}>
                      <p className="font-mono text-[11.5px] text-on-surface">{f.change.path}</p>
                      <Hunks file={f.change} only={f.only} />
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-muted-slate">
                    {ch.verdict === "added" ? "A part the map gained: it has no lines from before to set against." : ch.verdict === "removed" ? "A part the map lost." : "Its own lines held; something it holds changed. Open it to see where."}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Across the top of a level while a change is shown: what change, what the
 * colours mean, and the way to every place it touched — so the reader never
 * has to hunt the map for it.
 */
export function DiffBar({ path }: { path: string[] }) {
  const d = useDiff();
  const { nodeAt } = useMap();
  if (!d || (!d.diff && !d.loading && !d.error)) return null;
  const all = d.diff?.sections.filter((s) => s.verdict !== "untouched") ?? [];
  const here = path.join("/");
  const at = all.findIndex((s) => s.path.join("/") === here);
  const step = (k: 1 | -1) => {
    if (!all.length) return;
    const next = all[(at < 0 ? (k === 1 ? 0 : all.length - 1) : (at + k + all.length) % all.length)];
    goTo(next.verdict === "removed" ? next.path.slice(0, -1) : next.path);
  };
  const single = d.to && d.from === `${d.to}~1` ? d.commits.find((c) => c.sha === d.to || c.short === d.to) : undefined;
  const what = d.review
    ? `Reviewing ${d.review.startsWith("pr:") ? `pull request #${d.review.slice(3)}` : d.review.startsWith("turn:") ? "an agent turn" : d.review}`
    : single
      ? `${single.short} · ${single.subject}`
      : d.from || d.to
        ? `${d.from?.slice(0, 7) ?? "start"} ⇄ ${d.to?.slice(0, 7) ?? "working tree"}`
        : "";
  const title = (s: SectionDiff) => nodeAt(s.path)?.title ?? s.title;
  const btn = "cursor-pointer px-2 py-0.5 text-[12px] hover:bg-surface-container-low disabled:cursor-default disabled:opacity-40";
  return (
    <div className="sticky top-0 z-30 border-b border-border-gray bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-1 px-10 py-2">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: TINT.changed.ink }} />
          <span className="shrink-0 font-semibold text-ink">Showing changes</span>
          <span className="min-w-0 max-w-[420px] truncate text-muted-slate">{what}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
          {(["added", "changed", "removed"] as const).map((k) => (
            <span key={k} className=" border px-1.5 py-[1px] font-mono" style={{ color: TINT[k].ink, background: TINT[k].surface, borderColor: TINT[k].line }}>
              {TINT[k].mark} {WORD[k]}
            </span>
          ))}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-ink">
          {d.loading ? (
            <span className="text-[12px] text-muted-slate">Reading the change…</span>
          ) : all.length ? (
            <>
              <button type="button" className={btn} onClick={() => step(-1)}>
                ‹ Prev
              </button>
              <span className="tnum text-[12px] text-muted-slate" title={at >= 0 ? title(all[at]) : undefined}>
                {at >= 0 ? `${at + 1} of ${all.length} changed` : `${all.length} changed parts`}
              </span>
              <button type="button" className={btn} onClick={() => step(1)}>
                Next ›
              </button>
            </>
          ) : (
            <span className="text-[12px] text-muted-slate">{d.error ?? "No part of the map changed"}</span>
          )}
          <span className="mx-1 h-4 w-px bg-border-gray" />
          <button type="button" className={btn} onClick={openDiff}>
            History
          </button>
          <button type="button" className={cn(btn, "text-muted-slate")} onClick={d.off}>
            Exit
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * On a level whose own lines changed: the change itself, first, as a pull
 * request shows a file — how much, then the red and green lines. A level the
 * reader was sent to by "Next" opens onto what it was sent to see.
 */
export function HereChanges({ path }: { path: string[] }) {
  const diff = useDiff()?.diff;
  const [open, setOpen] = useState(true);
  const own = diff?.sections.find((s) => s.path.join("/") === path.join("/"));
  if (!diff || !own || own.verdict === "untouched") return null;
  const ch = changesUnder(diff, own.id);
  if (!ch) return null;
  const t = TINT[ch.verdict];
  return (
    <section className="mb-6 max-w-[1100px] overflow-hidden border" style={{ borderColor: t.line }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
        style={{ background: t.surface }}
      >
        <span className="w-2.5 text-[11px]" style={{ color: t.ink }}>
          {open ? "▾" : "▸"}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: t.ink }}>
          {ch.verdict === "added" ? "This part is new" : ch.verdict === "removed" ? "This part is gone" : "This part changed"}
        </span>
        {ch.files.length ? (
          <span className="text-[12px] text-muted-slate">
            in {ch.files.length} {ch.files.length === 1 ? "file" : "files"}
          </span>
        ) : null}
        {ch.added || ch.removed ? (
          <span className="tnum ml-auto flex items-center gap-2 font-mono text-[11.5px]">
            <span style={{ color: TINT.added.ink }}>+{ch.added}</span>
            <span style={{ color: TINT.removed.ink }}>−{ch.removed}</span>
            <StatBlocks added={ch.added} removed={ch.removed} />
          </span>
        ) : null}
      </button>
      {open && ch.files.length ? (
        <div className="space-y-3 px-3 py-3">
          {ch.files.map((f) => (
            <div key={f.change.path}>
              <p className="font-mono text-[11.5px] text-on-surface">{f.change.path}</p>
              <Hunks file={f.change} only={f.only} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
