"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, OriginMark, Prose } from "@/components/state";
import { SourceView, type RowCtx } from "@/components/anatomy";
import type { Anatomy, CodeRef, Issue } from "@/lib/data";
import type { Slice as RepoSlice } from "@/lib/repo";
import { useMap } from "@/components/map-context";
import { readSource } from "@/lib/source";
import { BOX_H, CUE_ROOM, layoutDiagram } from "@/lib/diagram";

/**
 * The blocks a reader learns from without opening code (round 3, D34): the
 * picture, the real values, who talks to whom, what is on screen, what a stored
 * value looks like. Typeset at reading size for the open level — unlike the
 * older anatomy blocks, which were built for a 340px card and are zoomed up.
 */

export type Explained = Extract<
  Anatomy,
  { kind: "diagram" | "table" | "sequence" | "screen" | "example" | "note" }
>;

export function isExplained(b: Anatomy): b is Explained {
  return ["diagram", "table", "sequence", "screen", "example", "note"].includes(b.kind);
}

export function ExplainedBlock({
  block,
  onOpen,
  hrefFor,
}: {
  block: Explained;
  /** Opens the part a diagram box names (D40). Absent where a block is drawn
      inside a card, which has no room to be navigated from. */
  onOpen?: (id: string) => void;
  /** That part's own URL, so a box is a real link: focusable, and openable
      in a new tab like any other. */
  hrefFor?: (id: string) => string;
}) {
  switch (block.kind) {
    case "diagram":
      return <Diagram block={block} onOpen={onOpen} hrefFor={hrefFor} />;
    case "table":
      return <Table block={block} />;
    case "sequence":
      return <Sequence block={block} />;
    case "screen":
      return <Screen block={block} />;
    case "example":
      return <Example block={block} />;
    case "note":
      return <Note block={block} />;
  }
}

function Caption({ children }: { children?: string }) {
  return children ? (
    <p className="mb-2.5 text-[13px] font-medium text-on-surface-variant">{children}</p>
  ) : null;
}

/* ── diagram ─────────────────────────────────────────────────── */

const TONE = {
  plain: { stroke: "var(--color-border-strong)", fill: "var(--color-pure-white)", ink: "var(--color-ink)", line: "var(--color-wire)" },
  good: { stroke: "var(--color-deep-green)", fill: "var(--color-mint-success)", ink: "var(--color-ink)", line: "var(--color-deep-green)" },
  warn: { stroke: "var(--color-amber-ink)", fill: "var(--color-amber-surface)", ink: "var(--color-amber-ink)", line: "var(--color-amber-ink)" },
} as const;

/** How many section hues exist. No diagram opens more parts than this. */
export const SECTION_HUES = 7;

/**
 * The colour of the Nth part a level declares. Exported so the list below the
 * picture can carry the same dot, which is the whole point: the box and the
 * index entry are the same thing seen twice.
 */
export function sectionTone(i: number) {
  const k = (i % SECTION_HUES) + 1;
  return { ink: `var(--color-sec-${k}-ink)`, surface: `var(--color-sec-${k}-surface)` };
}

/**
 * Which part each box opens, as an index into the level's parts — so a box
 * can be coloured by the SECTION it leads to rather than by the fact that it
 * leads anywhere at all.
 *
 * That fact is already carried by the corner badge (D43), so tinting every
 * live box one shared colour said a second time what the arrow said once.
 * Colour is better spent on association: a part drawn as three boxes makes
 * those three one colour, and 64 of 254 diagrams have such a part.
 */
export function sectionOrder(
  block: Extract<Anatomy, { kind: "diagram" }>,
  owns: (id: string) => boolean,
): string[] {
  const order: string[] = [];
  for (const b of block.boxes) {
    if (b.opens && owns(b.opens) && !order.includes(b.opens)) order.push(b.opens);
  }
  return order;
}

/**
 * How far past its natural size a picture may be blown up to fill the level.
 * Past roughly this the labels read as a poster rather than a diagram, and a
 * six-box state machine starts looking like a slide.
 */
const DIAGRAM_MAX_SCALE = 1.35;

/**
 * Boxes on a grid, arrows routed between them. Drawn at real pixels and never
 * scaled down: a figure whose labels shrink below reading size is decoration
 * (the measured failure in `Figure`), so a wide one scrolls instead.
 */
function Diagram({
  block,
  onOpen,
  hrefFor,
}: {
  block: Extract<Anatomy, { kind: "diagram" }>;
  onOpen?: (id: string) => void;
  hrefFor?: (id: string) => string;
}) {
  const { W, H, boxes, arrows } = layoutDiagram(block);
  // Only a picture that actually leads somewhere dims its scenery: on a
  // diagram where nothing opens, every box is equally "inert" and dimming
  // them all would just make the picture grey.
  const navigable = Boolean(onOpen) && block.boxes.some((b) => b.opens);
  // A box counts as leading into a section only where the level actually owns
  // that part — the same test `onOpen` makes before it navigates.
  const order = sectionOrder(block, (id) => Boolean(hrefFor?.(id)));
  const sectionOf = (id: string | undefined) => (id ? order.indexOf(id) : -1);

  return (
    <figure className="min-w-0">
      {/* The caption sits ABOVE the picture: it says what you are about to
          look at, which is only useful before you look. Underneath it was a
          footnote to a diagram the reader had already tried to decode. */}
      <figcaption className="mb-3 max-w-[1000px]">
        <span className="text-[14px] font-medium text-on-surface">{block.caption}</span>
        {navigable ? (
          <span className="ml-2.5 whitespace-nowrap font-mono text-[10.5px] text-faint">
            colours match the parts below
          </span>
        ) : null}
      </figcaption>
      {/* No frame: the picture is the level, not an illustration pasted onto
          it (D41). A border here drew a box around the one thing that should
          read as the page itself. */}
      <div className="overflow-x-auto">
        {/* Grows into the width the level has, up to DIAGRAM_MAX_SCALE — the
            picture is the main thing on the page (D40) and was rendering at
            its natural size inside a column half again as wide, which is the
            smallness zoom (D45) was invented to work around. Still never
            below 70%, where the labels stop being readable. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={block.caption}
          className={navigable ? "dg-nav block h-auto" : "block h-auto"}
          style={{ width: "100%", maxWidth: W * DIAGRAM_MAX_SCALE, minWidth: W * 0.7 }}
        >
          <defs>
            {(["plain", "good", "warn"] as const).map((t) => (
              <marker
                key={t}
                id={`dg-${t}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M1 1.2L7 4 1 6.8z" fill={TONE[t].line} />
              </marker>
            ))}
          </defs>
          {arrows.map(({ d, tone, label }, i) => (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={TONE[tone].line}
                strokeWidth="1.5"
                strokeDasharray={tone === "warn" ? "5 4" : undefined}
                markerEnd={`url(#dg-${tone})`}
              />
              {label ? (
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={label.anchor}
                  fontSize="12"
                  fill="var(--color-muted-slate)"
                  stroke="var(--color-warm-cream)"
                  strokeWidth="4"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {label.text}
                </text>
              ) : null}
            </g>
          ))}
          {boxes.map(({ x, y, w, b }) => {
            // Live only where the author named the part this box belongs to.
            const go = b.opens && onOpen ? () => onOpen(b.opens!) : undefined;
            const authored = b.tone && b.tone !== "plain";
            // An authored tone still wins: `good` and `warn` are claims about
            // the code, and a section hue is only an index.
            const sec = authored ? -1 : sectionOf(b.opens);
            const t = TONE[b.tone ?? "plain"];
            const fill = sec >= 0 ? sectionTone(sec).surface : t.fill;
            const stroke = sec >= 0 ? sectionTone(sec).ink : t.stroke;
            const ink = sec >= 0 ? sectionTone(sec).ink : t.ink;
            return (
              <Box
                key={b.id}
                live={Boolean(go)}
                href={b.opens ? hrefFor?.(b.opens) : undefined}
                onActivate={go}
                label={b.label}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={BOX_H}
                  rx="6"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="1.5"
                  strokeDasharray={b.tone === "warn" ? "5 4" : undefined}
                />
                {/* The label centres in the space left of the badge, so a
                    long one never runs under it. */}
                <text
                  x={x + (w - (b.opens ? CUE_ROOM : 0)) / 2}
                  y={b.sub ? y + 25 : y + BOX_H / 2 + 5}
                  textAnchor="middle"
                  fontSize="14.5"
                  fontWeight="600"
                  fill={ink}
                >
                  {b.label}
                </text>
                {b.sub ? (
                  <text x={x + w / 2} y={y + 43} textAnchor="middle" fontSize="12" fill="var(--color-faint)">
                    {b.sub}
                  </text>
                ) : null}
                {/* The cue that this box goes somewhere. A filled disc in the
                    corner rather than a bare character: at rest a lone "›"
                    read as decoration, so the click was only discoverable by
                    hovering (D43). */}
                {go ? (
                  <g className="dg-cue" aria-hidden>
                    {/* Green, the accent that means "this does something"
                        everywhere else on the page. It is deliberately NOT
                        the section hue: the badge answers "can I open this",
                        the tint answers "what does it belong to", and those
                        are different questions. */}
                    <circle cx={x + w - 15} cy={y + 15} r="8.5" fill="var(--color-deep-green)" />
                    <text
                      x={x + w - 15}
                      y={y + 19}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--color-pure-white)"
                    >
                      ›
                    </text>
                  </g>
                ) : null}
              </Box>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/**
 * One diagram box. A box that opens a part is an <a> so that focus, Enter and
 * a screen reader all work: Chrome refuses focus to an SVG <g>, tabIndex or
 * not, which would have left the picture mouse-only. An inert box is a plain
 * <g> and announces nothing extra.
 */
function Box({
  live,
  href,
  onActivate,
  label,
  children,
}: {
  live: boolean;
  /** A real destination, so the link focuses and Enter fires natively. */
  href?: string;
  onActivate?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!live) return <g data-pick={label}>{children}</g>;
  return (
    <a
      data-pick={label}
      className="dg-live"
      href={href}
      aria-label={`${label} — open this part`}
      onClick={(e) => {
        // Left-click navigates in place; cmd/ctrl-click and the context menu
        // keep the browser's own behaviour, because the href is real.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onActivate?.();
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
    >
      {children}
    </a>
  );
}

/* ── table ───────────────────────────────────────────────────── */

const TABLE_ROWS_FOLDED = 12;

function Table({ block }: { block: Extract<Anatomy, { kind: "table" }> }) {
  const [all, setAll] = useState(false);
  const rows = all ? block.rows : block.rows.slice(0, TABLE_ROWS_FOLDED);
  return (
    <div className="min-w-0">
      <Caption>{block.caption}</Caption>
      <div className="overflow-x-auto rounded-[8px] border border-border-gray bg-pure-white">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-border-gray bg-surface">
              {block.columns.map((c) => (
                <th key={c} className="px-4 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-faint">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                data-pick={r[0]}
                data-pick-text={block.columns.map((c, j) => `${c}: ${r[j] ?? ""}`).join("\n")}
                className="border-b border-border-gray last:border-0"
              >
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-4 py-2 align-top leading-snug",
                      j === 0 ? "font-medium text-ink" : "text-on-surface-variant",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.rows.length > TABLE_ROWS_FOLDED ? (
        <button
          onClick={() => setAll((v) => !v)}
          className="mt-2 text-[12.5px] font-medium text-deep-green hover:underline"
        >
          {all ? "Show fewer" : `Show all ${block.rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

/* ── sequence ────────────────────────────────────────────────── */

/**
 * Who talks to whom, top to bottom. One column per actor with a faint line
 * down from it; each message is an arrow between two of those lines, numbered,
 * with its words on top. A message to itself is a note on that actor's line.
 */
/**
 * A colour per actor, by position in `actors`. Assigned rather than authored:
 * which participant is which is already in the data, and an author choosing
 * hues per sequence would drift between levels of the same map.
 */
function actorTone(i: number) {
  const k = (i % 4) + 1;
  return { ink: `var(--color-actor-${k})`, surface: `var(--color-actor-${k}-surface)` };
}

function Sequence({ block }: { block: Extract<Anatomy, { kind: "sequence" }> }) {
  const n = block.actors.length;
  const centre = (a: string) => ((block.actors.indexOf(a) + 0.5) / n) * 100;
  const toneOfActor = (a: string) => actorTone(block.actors.indexOf(a));
  return (
    <div className="min-w-0">
      <Caption>{block.caption}</Caption>
      <div className="overflow-x-auto rounded-[8px] border border-border-gray bg-pure-white/80 px-4 pb-4 pt-3">
        <div className="relative" style={{ minWidth: n * 150 }}>
          {/* lifelines */}
          {block.actors.map((a) => (
            <span
              key={a}
              aria-hidden
              className="absolute bottom-0 top-9 border-l border-dashed opacity-45"
              style={{ left: `${centre(a)}%`, borderColor: toneOfActor(a).ink }}
            />
          ))}
          <div className="relative flex">
            {block.actors.map((a) => {
              const t = toneOfActor(a);
              return (
                <div key={a} className="flex flex-1 justify-center">
                  <span
                    className="rounded-[5px] border px-3 py-1.5 text-[13px] font-semibold"
                    style={{ borderColor: t.ink, background: t.surface, color: t.ink }}
                  >
                    {a}
                  </span>
                </div>
              );
            })}
          </div>
          <ol className="relative mt-3">
            {block.rows.map((m, i) => {
              const a = centre(m.from);
              const b = centre(m.to);
              const self = m.from === m.to;
              const left = Math.min(a, b);
              const width = Math.abs(b - a);
              const warn = m.state !== "derived";
              return (
                <li
                  key={i}
                  data-pick={m.label}
                  data-pick-text={`${m.from} → ${m.to}: ${m.label}${m.note ? ` (${m.note})` : ""}`}
                  className="relative h-[76px]"
                >
                  <span className="absolute bottom-[14px] left-0 font-mono text-[10.5px] text-faint">{i + 1}</span>
                  {self ? (
                    <div
                      className="absolute top-[8px] -translate-x-1/2 rounded-[5px] border border-border-gray bg-surface-container-low px-2.5 py-1.5 text-center text-[12.5px] text-on-surface"
                      style={{ left: `${a}%`, maxWidth: `${100 / n}%` }}
                    >
                      {m.label}
                      {m.note ? <span className="block text-[11.5px] text-faint">{m.note}</span> : null}
                    </div>
                  ) : (
                    <div className="absolute bottom-[18px]" style={{ left: `${left}%`, width: `${width}%` }}>
                      <p className="line-clamp-2 px-3 text-center text-[12.5px] leading-tight text-on-surface" title={m.label}>
                        {m.label}
                      </p>
                      {/* The line is the SENDER's colour, so a reply reads as
                          coming back without reading its label. A message the
                          map is unsure of keeps amber and its dashes: doubt
                          outranks identity. */}
                      <div
                        className={cn("relative mt-1.5 h-0 border-t-[1.5px]", warn && "border-dashed")}
                        style={{ borderTopColor: warn ? "var(--color-amber-ink)" : toneOfActor(m.from).ink }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -top-[6px] size-0 border-y-[5px] border-y-transparent",
                            a < b ? "right-0 border-l-[8px]" : "left-0 border-r-[8px]",
                          )}
                          style={{
                            [a < b ? "borderLeftColor" : "borderRightColor"]:
                              warn ? "var(--color-amber-ink)" : toneOfActor(m.from).ink,
                          }}
                        />
                      </div>
                      {m.note ? (
                        <p className="truncate px-3 pt-1 text-center text-[11.5px] text-faint" title={m.note}>
                          {m.note}
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ── screen ──────────────────────────────────────────────────── */

/**
 * What the user sees, top to bottom, in the frame of what it runs on — a
 * phone, or a browser window for a web page — with what each thing does
 * written beside it rather than on top of it, a line running from the thing
 * to its note. A real capture has no coordinates for where each item landed,
 * and a narrow page puts the notes under the screen; both fall back to numbers.
 */
function Screen({ block }: { block: Extract<Anatomy, { kind: "screen" }> }) {
  const noted = block.items.map((it, i) => ({ ...it, i })).filter((it) => it.note);
  const num = new Map(noted.map((it, k) => [it.i, k + 1]));
  const [box, paths] = useCallouts(!block.shot && noted.length > 0);
  // Numbers until the lines are measured, and wherever they cannot be drawn.
  const n = (i: number) => (paths ? undefined : num.get(i));
  return (
    <div className="min-w-0">
      <Caption>{block.caption}</Caption>
      <div ref={box} className="relative flex flex-wrap items-start gap-6">
        {block.shot ? (
          // The real screen, captured from the app's own web build with
          // sample data (D37). Numbered callouts sit beside it, not on it:
          // the capture has no coordinates for where each item landed.
          <figure className="w-[300px] shrink-0">
            {/* A bezel, and a blank strip above and below the capture: the web
                build has no status bar, so without them the rounded corners
                cut into the app's own title and tab bar. */}
            <div className="rounded-[44px] bg-bezel p-[9px] shadow-panel">
              <div className="overflow-hidden rounded-[36px] bg-white">
                <div className="flex h-8 items-center justify-center">
                  <div className="h-[18px] w-[84px] rounded-full bg-night" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- a static capture at its own size; next/image adds nothing here */}
                <img src={block.shot} alt={block.title} className="block h-auto w-full" />
                <div className="flex h-6 items-center justify-center">
                  <div className="h-[4px] w-24 rounded-full bg-night/80" />
                </div>
              </div>
            </div>
            <figcaption className="mt-2 text-center font-mono text-[10.5px] text-faint">
              the real screen · sample data
            </figcaption>
          </figure>
        ) : block.device !== "phone" ? (
          // A web page: a browser window, its address bar showing the route.
          <div className="w-[440px] max-w-full shrink-0 overflow-hidden rounded-[10px] border-[1.5px] border-border-strong bg-pure-white shadow-panel">
            <div className="flex items-center gap-3 border-b border-border-gray bg-surface-container px-3 py-2">
              <div className="flex shrink-0 gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-[9px] rounded-full bg-border-strong" />
                ))}
              </div>
              {/* Empty without a route: the title is just below, and an older map has none. */}
              <p className="h-[22px] min-w-0 flex-1 truncate rounded-[5px] bg-pure-white px-2.5 py-1 font-mono text-[11px] leading-[14px] text-muted-slate">
                {block.route}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 pb-5 pt-4">
              <p className="mb-1 text-[13px] font-semibold text-ink">{block.title}</p>
              {block.items.map((it, i) => (
                <div key={i} data-pick={it.label} data-thing={num.get(i)}>
                  <ScreenThing type={it.type} label={it.label} n={n(i)} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-[280px] shrink-0 rounded-[30px] border-[1.5px] border-border-strong bg-pure-white p-3 shadow-panel">
            <div className="mx-auto mb-3 h-[5px] w-16 rounded-full bg-surface-container" />
            <p className="mb-3 px-2 text-center text-[13px] font-semibold text-ink">{block.title}</p>
            <div className="flex flex-col gap-2 px-2 pb-3">
              {block.items.map((it, i) => (
                <div key={i} data-pick={it.label} data-thing={num.get(i)}>
                  <ScreenThing type={it.type} label={it.label} n={n(i)} />
                </div>
              ))}
            </div>
          </div>
        )}
        {noted.length ? (
          // Reading size, not caption size (D44). This list sits beside a
          // ~700px screen with room to spare, so it was set small and tight
          // against a column of empty space. It is the explanation of the
          // screen — the main text of the block — and is typeset as such.
          <ol className="flex min-w-[280px] max-w-[760px] flex-1 flex-col gap-4 pt-10">
            {noted.map((it, k) => (
              <li key={it.i} data-pick={it.label} data-note={k + 1} className="flex gap-3 text-[15.5px] leading-relaxed">
                {paths ? null : <Badge n={k + 1} />}
                <span>
                  <span className="font-semibold text-ink">{it.label}</span>
                  <span className="text-on-surface-variant">
                    {" — "}
                    <Prose text={it.note ?? ""} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {paths ? (
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible text-faint">
            {paths.map((l) => (
              <g key={l.n}>
                <path d={l.d} fill="none" stroke="currentColor" strokeWidth={1.25} />
                <circle cx={l.from.x} cy={l.from.y} r={3} fill="currentColor" />
                <circle cx={l.to.x} cy={l.to.y} r={3} fill="currentColor" />
              </g>
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

type Pt = { x: number; y: number };

/** Where `el` sits inside `box`, in the layout's own pixels — the same space an SVG inside `box` draws in, whatever zoom or scale is applied above. */
function offsetIn(el: HTMLElement, box: HTMLElement) {
  let x = 0, y = 0;
  for (let at: HTMLElement | null = el; at && at !== box; at = at.offsetParent as HTMLElement | null) {
    x += at.offsetLeft;
    y += at.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Lines from each noted thing on a drawn screen (`data-thing`) to its note
 * (`data-note`), measured after layout and again on every resize. The paths
 * are null when there is nothing to join or the notes have wrapped under the
 * screen, which is the cue to number them instead.
 */
function useCallouts(on: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ n: string; d: string; from: Pt; to: Pt }[] | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const measure = () => {
      const out: { n: string; d: string; from: Pt; to: Pt }[] = [];
      for (const note of el.querySelectorAll<HTMLElement>("[data-note]")) {
        const item = el.querySelector<HTMLElement>(`[data-thing="${note.dataset.note}"]`);
        if (!item) continue;
        // A heading or a line of text spans the screen's width but its words
        // do not: the line leaves from the end of the words, not empty space.
        const thing = item.querySelector<HTMLElement>("[data-anchor]") ?? item;
        const a = offsetIn(thing, el), b = offsetIn(note, el);
        // Wrapped: the note is not to the right of the screen, so a line would cut across it.
        const row = offsetIn(item, el);
        if (b.x < row.x + row.w) { setPaths(null); return; }
        const from = { x: a.x + a.w + 6, y: a.y + a.h / 2 };
        // The first line of the note, not the middle of a note that wraps.
        const to = { x: b.x - 8, y: b.y + 13 };
        const bend = (to.x - from.x) / 2;
        out.push({ n: note.dataset.note!, from, to, d: `M${from.x},${from.y} C${from.x + bend},${from.y} ${to.x - bend},${to.y} ${to.x},${to.y}` });
      }
      setPaths(out.length ? out : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);
  return [box, on ? paths : null] as const;
}

function Badge({ n }: { n: number }) {
  return (
    <span className="mt-[3px] flex size-[21px] shrink-0 items-center justify-center rounded-full bg-deep-green font-mono text-[11px] font-semibold text-white">
      {n}
    </span>
  );
}

function ScreenThing({ type, label, n }: { type: string; label: string; n?: number }) {
  const badge = n ? (
    <span className="absolute -right-1.5 -top-1.5">
      <Badge n={n} />
    </span>
  ) : null;
  const base = "relative text-[12.5px]";
  switch (type) {
    case "heading":
      return <p className={cn(base, "text-[15px] font-semibold text-ink")}><span data-anchor>{label}</span>{badge}</p>;
    case "text":
      return <p className={cn(base, "text-muted-slate")}><span data-anchor>{label}</span>{badge}</p>;
    case "field":
      return (
        <div className={cn(base, "rounded-[5px] border border-border-strong px-2.5 py-2 text-faint")}>
          {label}
          {badge}
        </div>
      );
    case "choice":
      return (
        <div className={cn(base, "rounded-[6px] border border-mint-line bg-mint-success px-3 py-1.5 text-deep-green")}>
          {label}
          {badge}
        </div>
      );
    case "button":
      return (
        <div className={cn(base, "rounded-[6px] bg-deep-green px-3 py-2 text-center font-medium text-white")}>
          {label}
          {badge}
        </div>
      );
    case "image":
      return (
        <div className={cn(base, "flex h-20 items-center justify-center rounded-[5px] bg-surface-container text-faint")}>
          {label}
          {badge}
        </div>
      );
    default:
      return (
        <div className={cn(base, "flex flex-col gap-1 rounded-[5px] border border-border-gray p-2 text-on-surface-variant")}>
          {label}
          <span className="h-2 w-4/5 rounded-[3px] bg-surface-container" />
          <span className="h-2 w-3/5 rounded-[3px] bg-surface-container" />
          {badge}
        </div>
      );
  }
}

/* ── example ─────────────────────────────────────────────────── */

function Example({ block }: { block: Extract<Anatomy, { kind: "example" }> }) {
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="rounded-[6px] border border-border-strong px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.07em] text-faint">
          example
        </span>
        <span className="text-[13px] font-medium text-on-surface-variant">{block.caption}</span>
      </div>
      <pre className="overflow-x-auto rounded-[8px] border border-border-gray bg-surface px-4 py-3 font-mono text-[12.5px] leading-relaxed text-on-surface">
        {block.value}
      </pre>
      {block.notes?.length ? (
        <dl className="mt-2.5 flex flex-col gap-1.5">
          {block.notes.map((p) => (
            <div key={p.label} data-pick={p.label} className="flex gap-3 text-[13px] leading-snug">
              <dt className="w-[160px] shrink-0 font-mono text-[12px] text-ink">{p.label}</dt>
              <dd className="text-on-surface-variant">
                <Prose text={p.value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/* ── note ────────────────────────────────────────────────────── */

/**
 * The reader's own words on the level. Set at the same reading size as the
 * blocks around it so it belongs, but given a left edge and a tinted ground
 * rather than a white card: a block that looks like the generator's own work
 * would quietly claim the code's authority for a sentence a person wrote.
 */
function Note({ block }: { block: Extract<Anatomy, { kind: "note" }> }) {
  return (
    <div className="min-w-0 border-l-2 border-border-strong bg-surface-container-low/60 py-2 pl-4">
      <Caption>{block.title}</Caption>
      <p className="text-[13.5px] leading-relaxed text-on-surface">
        <Prose text={block.body} />
      </p>
      <OriginMark origin={block.origin} className="mt-2.5 block" />
    </div>
  );
}

/* ── watch out ───────────────────────────────────────────────── */

export function WatchOut({ issues, action }: { issues: Issue[]; action?: React.ReactNode }) {
  return (
    <section data-pick="Watch out">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="text-clay-ink">Watch out</Eyebrow>
        {action}
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {issues.map((it) => (
          <li
            key={it.title}
            data-pick={it.title}
            className="rounded-[8px] border border-clay-line bg-clay-surface/60 px-4 py-3"
          >
            <p className="text-[14px] font-semibold text-clay-ink">{it.title}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-on-surface">
              <Prose text={it.detail} />
            </p>
            {it.where ? <p className="mt-1.5 font-mono text-[11px] text-muted-slate">{it.where}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── the code, last ──────────────────────────────────────────── */

/**
 * The code behind this level, folded. Each place opens on its own, read live
 * from disk and editable through the same view the old leaf level used — so
 * the code is never more than two clicks away and never in the way.
 */
export function CodeDrawer({
  owner,
  refs,
  ctx,
  open,
  onToggle,
}: {
  owner: string;
  refs: CodeRef[];
  ctx: RowCtx;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      id="code"
      data-pick="The code behind this"
      data-pick-text={refs.map((r) => `${r.file}:${r.start}-${r.end} — ${r.label}`).join("\n")}
      className="scroll-mt-16"
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[6px] border border-border-gray bg-pure-white px-3.5 py-1.5 text-[13px] text-on-surface-variant transition-colors hover:border-border-strong hover:text-ink"
      >
        <span className="font-mono text-[12px]">{"</>"}</span>
        {open ? "Hide the code" : `The code behind this · ${refs.length} ${refs.length === 1 ? "place" : "places"}`}
      </button>
      {open ? (
        <ul className="mt-4 flex flex-col gap-2">
          {refs.map((r) => (
            <CodePlace key={`${r.file}:${r.start}`} owner={owner} code={r} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CodePlace({ owner, code, ctx }: { owner: string; code: CodeRef; ctx: RowCtx }) {
  const [slice, setSlice] = useState<RepoSlice | null | "failed">(null);
  const [shown, setShown] = useState(false);
  const { name: map } = useMap();

  const toggle = async () => {
    setShown((v) => !v);
    if (slice) return;
    try {
      const r = await readSource({ map, file: code.file, start: code.start, end: code.end });
      setSlice("slice" in r ? r.slice : "failed");
    } catch {
      setSlice("failed");
    }
  };

  return (
    <li
      data-pick={code.label}
      data-pick-code={`${code.file}:${code.start}-${code.end}`}
      className="rounded-[8px] border border-border-gray bg-pure-white"
    >
      <button onClick={toggle} aria-expanded={shown} className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left">
        <span className="text-[13.5px] text-ink">{code.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
          {code.file}:{code.start}–{code.end}
        </span>
        <span aria-hidden className="text-[11px] text-faint">{shown ? "▾" : "▸"}</span>
      </button>
      {shown ? (
        <div className="border-t border-border-gray p-3">
          {slice === "failed" ? (
            <p className="text-[12.5px] text-clay-ink">Could not read this file from the repository.</p>
          ) : slice ? (
            <SourceView
              owner={`${owner}@${code.file}:${code.start}`}
              block={{ kind: "source", file: code.file, start: slice.start, code: slice.code }}
              ctx={ctx}
            />
          ) : (
            <p className="text-[12.5px] text-faint">Reading…</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

