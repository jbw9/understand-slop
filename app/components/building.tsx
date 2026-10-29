"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/state";
import { useMap } from "@/components/map-context";
import type { Progress } from "@/lib/vault";

/*
 * A map being made, shown as it is made (D69): the files being read, then a
 * box per part the code was divided into, each filling in as its author hands
 * it in and the checker accepts it, then the real picture of how the parts
 * connect drawn over those boxes. A first map takes 15–30 minutes; this is
 * what the reader watches instead of a spinner.
 */

const STAGES = [
  ["summarize", "Reading the code"],
  ["cut", "Dividing it into parts"],
  ["author", "Writing each part"],
  ["overview", "Drawing how they connect"],
  ["verify", "Checking claims against the code"],
] as const;

/** Whether the top level is the run itself rather than its picture: until the overview lands. */
export function isBuilding(progress: Progress | undefined, hasOverview: boolean): progress is Progress {
  if (!progress || progress.stage === "done") return false;
  return !hasOverview || progress.stage === "summarize" || progress.stage === "cut";
}

export function Building({ progress, onOpen }: { progress: Progress; onOpen: (path: string[]) => void }) {
  const stage = progress.stage;
  const ended = stage === "failed" || stage === "cancelled";
  return (
    <section data-pick="The map being made" className="flex flex-col gap-8">
      <Stages progress={progress} />
      {ended ? (
        <p className="max-w-[720px] text-[13.5px] leading-relaxed text-clay-ink">
          {stage === "cancelled" ? "This run was cancelled." : "This run stopped before the map was made."}
          {progress.line ? <span className="mt-1 block font-mono text-[11.5px]">{progress.line}</span> : null}
          <span className="mt-1 block text-on-surface-variant">Open Projects to run it again.</span>
        </p>
      ) : null}
      {progress.roots.length ? (
        <Skeleton progress={progress} onOpen={onOpen} />
      ) : stage === "cut" ? (
        <Dividing />
      ) : null}
      {progress.reading && !progress.roots.length ? <Reading reading={progress.reading} /> : null}
    </section>
  );
}

/** Where the run is, of the five things it does. */
export function Stages({ progress, className }: { progress: Progress; className?: string }) {
  const at = STAGES.findIndex(([k]) => k === progress.stage);
  const done = progress.stage === "done";
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px]", className)}>
      {STAGES.map(([k, label], i) => {
        const past = done || (at >= 0 && i < at);
        const now = i === at;
        return (
          <li key={k} className="flex items-center gap-2">
            {i ? <span aria-hidden className="h-px w-5 bg-border-strong" /> : null}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                now ? "border-mint-line bg-mint-success text-deep-green" : past ? "border-border-gray text-on-surface-variant" : "border-dashed border-border-gray text-faint",
              )}
              aria-current={now ? "step" : undefined}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", now ? "animate-pulse bg-deep-green" : past ? "bg-mint-line" : "bg-border-strong")} />
              {past ? `${label} ✓` : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── reading ─────────────────────────────────────────────────── */

/**
 * The code being read: every file to read as a cell under its folder, lit as
 * it is read, beside what the last few turned out to be for.
 */
function Reading({ reading }: { reading: NonNullable<Progress["reading"]> }) {
  const read = new Set(reading.read);
  const recent = new Set(reading.recent.map((r) => r.path));
  const dirs = new Map<string, string[]>();
  for (const f of reading.files) {
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
    dirs.set(dir, [...(dirs.get(dir) ?? []), f]);
  }
  const of = reading.files.length;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <Eyebrow>Reading the code</Eyebrow>
        <span className="font-mono text-[11.5px] text-faint">
          {reading.read.length} of {of} files
        </span>
      </div>
      <div className="mt-2 h-1 max-w-[720px] overflow-hidden rounded-full bg-border-gray">
        <div className="h-full bg-deep-green transition-[width] duration-300" style={{ width: `${of ? (100 * reading.read.length) / of : 0}%` }} />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="max-h-[440px] overflow-y-auto pr-2">
          {[...dirs].sort(([a], [b]) => a.localeCompare(b)).map(([dir, files]) => (
            <div key={dir} className="flex items-start gap-3 py-[3px]">
              <span className="w-[46%] shrink-0 truncate text-right font-mono text-[11px] text-faint" title={dir}>
                {dir}/
              </span>
              <span className="flex flex-wrap gap-[3px] pt-[3px]">
                {files.map((f) => (
                  <span
                    key={f}
                    title={f}
                    className={cn(
                      "size-[9px] rounded-[1.5px] transition-colors duration-500",
                      recent.has(f) ? "bg-deep-green" : read.has(f) ? "bg-mint-line" : "bg-border-gray",
                    )}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
        <ol className="flex flex-col gap-3">
          {reading.recent.map((r) => (
            <li key={r.path} className="arrive">
              <p className="truncate font-mono text-[11px] text-faint">{r.path}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-on-surface">{r.purpose}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Before the parts have names: the space they will take, waiting. */
function Dividing() {
  return (
    <div>
      <Eyebrow>Dividing it into parts</Eyebrow>
      <p className="mt-2 max-w-[720px] text-[13.5px] leading-relaxed text-on-surface-variant">
        Every file is read. The code is being divided by what someone does with it — each part one journey or feature,
        not one folder.
      </p>
      <div className="mt-5 grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="shimmer h-[74px] rounded-[3px] border border-dashed border-border-strong" />
        ))}
      </div>
    </div>
  );
}

/* ── the parts ───────────────────────────────────────────────── */

/**
 * One box per part the code was divided into, where the picture of how they
 * connect will be drawn. A part opens as soon as there is something to read:
 * its draft while it is checked, then the part itself.
 */
function Skeleton({ progress, onOpen }: { progress: Progress; onOpen: (path: string[]) => void }) {
  const { nodeAt } = useMap();
  const ready = progress.roots.filter((r) => r.status === "done").length;
  const of = progress.roots.length;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <Eyebrow>{progress.stage === "author" ? "Writing each part" : "The parts"}</Eyebrow>
        <span className="font-mono text-[11.5px] text-faint">
          {ready} of {of} ready
        </span>
      </div>
      <p className="mt-2 max-w-[720px] text-[13.5px] leading-relaxed text-on-surface-variant">
        {progress.stage === "author"
          ? "Each part is written by its own agent and checked against the code before it is accepted. Open a ready one now; the rest arrive as they pass."
          : progress.stage === "overview"
            ? "Every part is in. Now the picture of how they connect is being drawn, each arrow cited to the line where one part calls another."
            : "The parts so far."}
      </p>
      <div className="mt-5 grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {progress.roots.map((r) => {
          const node = nodeAt([r.id]);
          const open = node ? () => onOpen([r.id]) : undefined;
          const working = r.status === "drafting" || r.status === "queued";
          return (
            <button
              key={r.id}
              type="button"
              data-path={JSON.stringify([r.id])}
              onClick={open}
              disabled={!open}
              className={cn(
                "group flex min-h-[86px] flex-col rounded-[3px] border px-4 py-3 text-left transition-[background-color,border-color,opacity] duration-500",
                r.status === "done" && "border-border-strong bg-surface-container-low hover:border-deep-green",
                r.status === "drafting" && "shimmer border-border-strong",
                r.status === "drafting" && node?.draft && "border-amber-line",
                r.status === "queued" && "border-dashed border-border-gray opacity-70",
                r.status === "failed" && "border-clay-line bg-clay-surface/50",
                open ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{r.title}</span>
              {r.sub ? <span className="mt-0.5 text-[12.5px] leading-snug text-on-surface-variant">{r.sub}</span> : null}
              <span
                className={cn(
                  "mt-auto pt-2 font-mono text-[11px]",
                  r.status === "done" ? "text-deep-green" : r.status === "failed" ? "text-clay-ink" : "text-faint",
                )}
              >
                {r.status === "done"
                  ? "✓ ready — open it"
                  : r.status === "failed"
                    ? `✗ ${r.detail ?? "not accepted"}`
                    : node?.draft
                      ? `draft, being checked${r.detail?.startsWith("revising — ") ? ` · ${r.detail.slice(11)}` : ""} — open it`
                      : working && r.status === "drafting"
                        ? "writing…"
                        : "waiting"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Over a part that is still a draft: what the reader is looking at, before they take it as the map. */
export function DraftNote({ detail }: { detail?: string }) {
  return (
    <div className="max-w-[820px] rounded-[3px] border border-amber-line bg-amber-surface px-4 py-3 text-[13.5px] leading-relaxed text-amber-ink">
      <span className="font-semibold">Draft, being checked.</span> The checker found problems with this part
      {detail ? ` (${detail.replace(/^revising — /, "")})` : ""} and its author is fixing them, so what is here may
      still change. It is shown now so there is something to read while you wait.
    </div>
  );
}

/* ── the picture arriving ────────────────────────────────────── */

/**
 * When the overview lands over the boxes the reader was watching, it is drawn
 * rather than swapped in: the boxes settle, then each arrow is traced from one
 * part to the next, its label after it. Once, on arrival; a map opened later
 * just shows its picture.
 */
export function useDrawIn(root: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const svg = on ? root.current?.querySelector<SVGSVGElement>("svg.dg-nav") : null;
    if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const boxes = [...svg.children].filter((g) => g.querySelector(":scope > rect"));
    boxes.forEach((b, i) =>
      b.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 500, delay: i * 70, easing: "ease-out", fill: "backwards" }),
    );
    const start = boxes.length * 70 + 250;
    const arrows = [...svg.querySelectorAll<SVGPathElement>(":scope > g > path[marker-end]")];
    const running = arrows.map((p, i) => {
      const length = p.getTotalLength();
      const head = p.getAttribute("marker-end")!;
      const dash = `${length} ${length}`;
      // The head waits for its line: drawn at once, it would float ahead of it.
      p.removeAttribute("marker-end");
      const a = p.animate([{ strokeDasharray: dash, strokeDashoffset: length }, { strokeDasharray: dash, strokeDashoffset: 0 }], {
        duration: 650,
        delay: start + i * 160,
        easing: "ease-in-out",
        fill: "backwards",
      });
      a.onfinish = a.oncancel = () => p.setAttribute("marker-end", head);
      p.parentElement?.querySelector("text")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: start + i * 160 + 500, fill: "backwards" });
      return a;
    });
    return () => running.forEach((a) => a.cancel());
  }, [root, on]);
}
