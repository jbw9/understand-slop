"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { goTo } from "@/components/chrome";
import { sectionTone } from "@/components/blocks";
import { TINT, openDiff, useDiff } from "@/components/diff";
import { useMap } from "@/components/map-context";
import { claudePath } from "@/components/projects";
import { Eyebrow } from "@/components/state";
import type { Chapter, Story, Timeline as Data, TimelineCommit } from "@/lib/history";

/** lib/history.ts's ELSEWHERE, the row for files no root owns; that file reads git, so it is never imported here. */
const ELSEWHERE = "";

/**
 * How the code got here (D73): every commit, as a dot on the rows of the
 * map's own top-level sections, left to right in time. It takes the level's
 * place while `?timeline` is in the URL, as the docs reader does (D66), so
 * Back and Escape close it and the level it was opened over is still there.
 *
 * It routes, as the diff panel does (D58): a dot opens what that commit did,
 * a dragged span what that stretch did, and a chapter what it covered — each
 * as diff mode on the map, never as a screen of its own (D56).
 */

export function openTimeline() {
  const q = new URLSearchParams(window.location.search);
  q.set("timeline", "");
  window.history.pushState(null, "", `?${q}`);
}

export function closeTimeline() {
  const q = new URLSearchParams(window.location.search);
  q.delete("timeline");
  window.history.pushState(null, "", q.size ? `?${q}` : window.location.pathname);
}

export const useTimelineOpen = () => useSearchParams().has("timeline");

const LABEL_W = 168;
const ROW_H = 30;
const STRIP_H = 34;
const BAND_H = 22;
const AXIS_H = 22;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
/** A label cut to about `px` wide at 11.5px sans, whole when it fits; the band's tooltip has it all. */
const fit = (text: string, px: number) => {
  const n = Math.floor(px / 6.6);
  return text.length <= n ? text : n < 2 ? "" : `${text.slice(0, n - 1)}…`;
};
const size = (c: TimelineCommit) => Math.sqrt(c.added + c.removed);

export function TimelineView() {
  const { name } = useMap();
  const diff = useDiff();
  const [got, setGot] = useState<{ timeline: Data; story: Story | null; telling: boolean } | { error: string } | null>(null);
  const [asked, setAsked] = useState(false);
  const [hover, setHover] = useState<{ c: TimelineCommit; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const telling = (got && "timeline" in got && got.telling) || asked;
  useEffect(() => {
    let live = true;
    const read = () =>
      fetch(`/api/timeline?map=${encodeURIComponent(name)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!live) return;
          setGot(j);
          if (!j.telling) setAsked(false);
        })
        .catch(() => live && setGot({ error: "Could not read the checkout's history." }));
    void read();
    // While the story is told, look again until its chapters land.
    const t = telling ? setInterval(read, 3000) : undefined;
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [name, telling]);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [got]);

  const data = got && "timeline" in got ? got.timeline : null;
  const story = got && "timeline" in got && got.story?.chapters.length ? got.story : null;
  // One step per commit, not to scale in time: work comes in bursts, and a
  // scale in days would crush a busy week into a few pixels beside empty
  // months. The dates under the axis say where the days fall.
  const scale = useMemo(() => {
    if (!data?.commits.length) return null;
    const n = data.commits.length;
    const w = Math.max(width - LABEL_W - 16, 200);
    const index = new Map(data.commits.map((c, i) => [c.sha, i]));
    const step = w / n;
    return { w, step, x: (c: TimelineCommit) => LABEL_W + (index.get(c.sha)! + 0.5) * step, at: (x: number) => Math.floor((x - LABEL_W) / step) };
  }, [data, width]);

  /** A range of commits, as diff mode on the map. */
  const show = (from: TimelineCommit, to: TimelineCommit, root?: string) => {
    diff?.setRange(`${from.sha}~1`, to.sha);
    goTo(root ? [root] : []);
    openDiff();
  };

  const tell = async () => {
    setAsked(true);
    const claude = await claudePath().catch(() => undefined);
    await fetch(`/api/timeline?map=${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify({ claude }) }).catch(() => setAsked(false));
  };

  const header = (
    <header className="mb-6 border-b border-border-gray pb-5">
      <div className="mb-4">
        <Button onClick={closeTimeline}>‹ Back to the map</Button>
      </div>
      <Eyebrow>History</Eyebrow>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.01em] text-ink">How the code got here</h1>
      {data?.commits.length ? (
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-relaxed text-on-surface-variant">
          {data.commits.length} commits{data.capped ? " (the most recent)" : ""} from {day(data.commits[0].at)} to {day(data.commits[data.commits.length - 1].at)}, on the map&apos;s
          sections, one step per commit. The bars above are each commit&apos;s size; click a dot to see what it did, or drag across a stretch.
        </p>
      ) : null}
    </header>
  );

  if (!got) return <>{header}<p className="text-[13px] text-faint">Reading the history…</p></>;
  if ("error" in got) return <>{header}<p className="text-[13px] text-clay-ink">{got.error}</p></>;
  if (!data?.commits.length || !scale) return <>{header}<p className="text-[13px] text-muted-slate">This checkout has no commits yet.</p></>;

  const bands = story ? BAND_H : 0;
  const top = bands + STRIP_H;
  const h = top + data.roots.length * ROW_H + AXIS_H;
  const byShort = new Map(data.commits.map((c) => [c.short, c]));
  const rowOf = (id: string) => data.roots.findIndex((r) => r.id === id);

  // The strip: each commit's size, so the big ones stand out of the rows.
  const most = Math.max(...data.commits.map(size), 1);
  const r = Math.max(1.5, Math.min(4.5, scale.step / 2 - 0.5));

  // A date wherever the day changes, at least 80px from the last one.
  const ticks: TimelineCommit[] = [];
  for (const c of data.commits) {
    const last = ticks[ticks.length - 1];
    if (!last || (c.at.slice(0, 10) !== last.at.slice(0, 10) && scale.x(c) - scale.x(last) >= 80)) ticks.push(c);
  }

  const inSpan = (a: number, b: number) => data.commits.slice(Math.max(0, scale.at(Math.min(a, b))), scale.at(Math.max(a, b)) + 1);
  const local = (e: React.PointerEvent) => e.clientX - (box.current?.getBoundingClientRect().left ?? 0);

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {story ? (
          <p className="text-[12.5px] text-muted-slate">
            Told in {story.chapters.length} chapters by Claude from the commit messages — click one to see what it covered.
          </p>
        ) : telling ? (
          <p className="text-[12.5px] text-muted-slate">Claude is reading the commit messages… the chapters appear here when it is done.</p>
        ) : (
          <>
            <Button onClick={tell}>Tell the story</Button>
            <p className="text-[12.5px] text-muted-slate">Claude groups the commits into chapters from their messages. One short run, usually under a minute.</p>
          </>
        )}
      </div>
      <div ref={box} className="relative w-full select-none">
        <svg
          width="100%"
          height={h}
          role="img"
          aria-label={`${data.commits.length} commits over time, by section`}
          onPointerDown={(e) => {
            const x = local(e);
            if (x < LABEL_W || (e.target as Element).closest("[data-commit], [data-chapter]")) return;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            setDrag({ a: x, b: x });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, b: Math.max(LABEL_W, Math.min(local(e), LABEL_W + scale.w)) })}
          onPointerUp={() => {
            if (!drag) return;
            const picked = Math.abs(drag.b - drag.a) > 6 ? inSpan(drag.a, drag.b) : [];
            setDrag(null);
            if (picked.length) show(picked[0], picked[picked.length - 1]);
          }}
        >
          {/* Chapters, behind everything: a band over the dots each one tells. */}
          {story?.chapters.map((ch: Chapter, i) => {
            const a = byShort.get(ch.from);
            const b = byShort.get(ch.to);
            if (!a || !b) return null;
            const x0 = scale.x(a) - scale.step / 2;
            const x1 = scale.x(b) + scale.step / 2;
            // Every other chapter shaded: the colours are the sections' own.
            return (
              <g key={ch.from} data-chapter className="cursor-pointer" onClick={() => show(a, b)}>
                <title>{`${ch.title} — ${ch.detail}`}</title>
                <rect x={x0} y={0} width={Math.max(x1 - x0, 6)} height={h - AXIS_H} fill={i % 2 ? "transparent" : "var(--color-surface-container-low)"} />
                <line x1={x0} x2={x0} y1={0} y2={h - AXIS_H} stroke="var(--color-border-gray)" />
                <text x={x0 + 5} y={15} fontSize={11.5} fontWeight={600} fill="var(--color-ink)" className="font-sans">
                  {fit(ch.title, x1 - x0 - 10)}
                </text>
              </g>
            );
          })}

          {data.commits.map((c) => {
            const bh = Math.max(1, (size(c) / most) * (STRIP_H - 8));
            return (
              <rect key={c.sha} x={scale.x(c) - Math.max(scale.step - 1, 1) / 2} y={bands + STRIP_H - 4 - bh} width={Math.max(scale.step - 1, 1)} height={bh} fill={hover?.c === c ? "var(--color-ink)" : "var(--color-wire)"} />
            );
          })}

          {data.roots.map((row, i) => {
            const y = top + i * ROW_H + ROW_H / 2;
            const tone = row.id === ELSEWHERE ? { ink: "var(--color-faint)" } : sectionTone(i);
            const born = data.commits.find((c) => c.roots.includes(row.id));
            return (
              <g key={row.id || "elsewhere"}>
                <line x1={LABEL_W} x2={LABEL_W + scale.w} y1={y} y2={y} stroke="var(--color-border-gray)" />
                <text x={0} y={y + 4} fontSize={12.5} fill={tone.ink} className="font-sans">
                  {row.title.length > 22 ? `${row.title.slice(0, 21)}…` : row.title}
                </text>
                {born && row.id !== ELSEWHERE ? (
                  <line x1={scale.x(born)} x2={scale.x(born)} y1={y - 9} y2={y + 9} stroke={tone.ink} strokeWidth={1.5}>
                    <title>{`${row.title} first appears: ${born.subject} (${day(born.at)})`}</title>
                  </line>
                ) : null}
              </g>
            );
          })}

          {data.commits.flatMap((c) =>
            c.roots.map((id) => {
              const i = rowOf(id);
              const tone = id === ELSEWHERE ? "var(--color-faint)" : sectionTone(i).ink;
              const cx = scale.x(c);
              const cy = top + i * ROW_H + ROW_H / 2;
              return (
                <circle
                  key={`${c.sha}:${id}`}
                  data-commit
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={tone}
                  fillOpacity={hover?.c === c ? 1 : 0.55}
                  stroke={hover?.c === c ? "var(--color-ink)" : "none"}
                  className="cursor-pointer"
                  onPointerEnter={() => setHover({ c, x: cx, y: cy })}
                  onPointerLeave={() => setHover((v) => (v?.c === c ? null : v))}
                  onClick={() => show(c, c, id === ELSEWHERE ? undefined : id)}
                />
              );
            }),
          )}

          {ticks.map((c) => (
            <text key={c.sha} x={scale.x(c)} y={h - 6} fontSize={10.5} fill="var(--color-faint)" textAnchor="middle" className="tnum font-sans">
              {new Date(c.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </text>
          ))}

          {drag && Math.abs(drag.b - drag.a) > 6 ? (
            <rect x={Math.min(drag.a, drag.b)} y={bands} width={Math.abs(drag.b - drag.a)} height={h - AXIS_H - bands} fill="var(--color-mint-success)" opacity={0.5} stroke="var(--color-deep-green)" />
          ) : null}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 w-[280px] rounded-[3px] border border-border-gray bg-pure-white px-3 py-2 shadow-sm"
            style={{ left: Math.min(hover.x + 12, Math.max(width - 290, 0)), top: hover.y + 12 }}
          >
            <p className="text-[12.5px] font-medium leading-snug text-ink">{hover.c.subject}</p>
            <p className="mt-0.5 text-[11px] text-muted-slate">
              {hover.c.author} · {day(hover.c.at)} · <span className="font-mono">{hover.c.short}</span>{" "}
              <span className="tnum font-mono" style={{ color: TINT.added.ink }}>
                +{hover.c.added}
              </span>{" "}
              <span className="tnum font-mono" style={{ color: TINT.removed.ink }}>
                −{hover.c.removed}
              </span>
            </p>
          </div>
        ) : null}
      </div>
      {story ? (
        <ol className="mt-6 flex max-w-[760px] flex-col gap-2.5">
          {story.chapters.map((ch, i) => {
            const a = byShort.get(ch.from);
            const b = byShort.get(ch.to);
            return (
              <li key={ch.from}>
                <button
                  type="button"
                  disabled={!a || !b}
                  onClick={() => a && b && show(a, b)}
                  className="block w-full cursor-pointer rounded-[3px] px-2 py-1.5 text-left hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-deep-green"
                >
                  <span className="text-[13.5px] font-semibold text-ink">
                    <span className="tnum mr-1.5 text-faint">{i + 1}.</span>
                    {ch.title}
                  </span>
                  <span className="ml-2 text-[11.5px] text-faint">
                    {a ? day(a.at) : ch.from} – {b ? day(b.at) : ch.to}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-on-surface-variant">{ch.detail}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </>
  );
}
