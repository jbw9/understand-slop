"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { State } from "@/lib/data";

/**
 * SVG connector lines between two DOM nodes, measured from the live layout.
 *
 * Endpoints come from getBoundingClientRect rather than from assumed
 * coordinates, because the nodes move: panning the canvas, expanding a
 * subsystem, and opening the detail pane all shift them.
 */

/**
 * A wire carries the same three states as everything else on screen, so a line
 * you can trust and a line the analysis guessed at never look alike.
 */
export type WireKind = "derived" | "partial" | "alarm" | "inferred";

export function wireKind(state: State, alarm?: boolean): WireKind {
  if (alarm) return "alarm";
  return state;
}

export interface Wire {
  from: string;
  to: string;
  kind: WireKind;
  /** 0 = touches the focused node directly; deeper = further out. */
  depth: number;
  /**
   * Foreign key. Drawn as an ER relationship instead of a flow arrow:
   * orthogonal elbows routed through the gutter between cards, with crow's
   * foot terminals — a bar for "exactly one" at the referenced key, three
   * splayed lines for "many" at the referencing column.
   */
  relation?: boolean;
}

interface Path {
  d: string;
  kind: WireKind;
  depth: number;
  x1: number;
  y1: number;
  /** ER terminals, when this path is a foreign key. */
  er?: {
    /** "many" end — sits on the referencing column. */
    many: { x: number; y: number; dir: 1 | -1 };
    /** "one" end — sits on the referenced key. */
    one: { x: number; y: number; dir: 1 | -1 };
  };
}

/**
 * Stroke per state. Dashing is the load-bearing signal: a solid line was
 * resolved by the compiler, a dashed one was not, so an unproven edge can
 * never be mistaken for a proven one at a glance.
 */
const STROKE: Record<WireKind, string> = {
  derived: "var(--color-deep-green)",
  partial: "var(--color-amber-ink)",
  alarm: "var(--color-clay-ink)",
  inferred: "var(--color-muted-slate)",
};

const DASHED: Record<WireKind, string | undefined> = {
  derived: undefined,
  partial: "5 4",
  alarm: "5 4",
  inferred: "2 4",
};

/**
 * Lane assignment for wires that share a corridor.
 *
 * Deriving a lane from a wire's own geometry — its span, its endpoints — is
 * what produced the bundles: two unrelated relationships whose spans happen to
 * agree land on the same track and draw straight over each other. The only
 * thing that actually separates them is knowing WHICH wires share a corridor,
 * so lanes are assigned by grouping first and indexing within the group.
 *
 * Keyed on the rounded corridor position, so the grouping is stable across
 * re-measures rather than depending on wire order.
 */
function assignLanes(keys: string[]): number[] {
  const seen = new Map<string, number>();
  const index: number[] = [];
  for (const k of keys) {
    const n = seen.get(k) ?? 0;
    index.push(n);
    seen.set(k, n + 1);
  }
  const total = new Map(seen);
  // Centre each group on the corridor: with n wires, offsets run symmetrically
  // about 0 so the bundle straddles the midline instead of drifting off it.
  return index.map((i, at) => {
    const n = total.get(keys[at]) ?? 1;
    return i - (n - 1) / 2;
  });
}

export function useWireAnchors() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const [version, setVersion] = useState(0);

  // The ref callback for a given id has to be referentially stable. React
  // detaches and re-attaches a ref whenever the callback's identity changes,
  // so building `(el) => …` inline in render would unregister and re-register
  // every anchor on every render — and with a re-measure hung off that, loop.
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const pending = useRef(0);

  const bump = useCallback(() => {
    // Mounts arrive one node at a time; coalesce a whole level into one pass.
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      setVersion((v) => v + 1);
    });
  }, []);

  const anchor = useCallback(
    (id: string) => {
      const existing = callbacks.current.get(id);
      if (existing) return existing;
      const fn = (el: HTMLElement | null) => {
        if (el) nodes.current.set(id, el);
        else nodes.current.delete(id);
        bump();
      };
      callbacks.current.set(id, fn);
      return fn;
    },
    [bump],
  );

  return { nodes, anchor, version };
}

export function WireLayer({
  canvasRef,
  nodes,
  wires,
  version,
  scale = 1,
  reflowKey,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  nodes: RefObject<Map<string, HTMLElement>>;
  wires: Wire[];
  version: number;
  /**
   * Scale of the transformed world this layer is mounted inside.
   * getBoundingClientRect reports post-transform screen pixels, so every
   * measured delta is divided by this to get back to world coordinates —
   * otherwise the wires would be scaled twice and drift off the nodes.
   */
  scale?: number;
  /** Any value that changes when the layout shifts — forces a re-measure. */
  reflowKey?: string | null;
}) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const k = scale || 1;
    setSize({ w: base.width / k, h: base.height / k });

    // Pass 1: resolve the corridor every relation wire will run through, so
    // lanes can be handed out by group rather than guessed from each wire's own
    // geometry. Two wires that merely happen to share a span are a different
    // thing from two wires that actually share a gutter, and only the second
    // needs separating.
    const cardOf = (el: HTMLElement) =>
      (el.closest("[data-node]") as HTMLElement | null) ?? el;
    const corridorKey: string[] = wires.map((wire) => {
      if (!wire.relation) return "";
      const a = nodes.current?.get(wire.from);
      const b = nodes.current?.get(wire.to);
      if (!a || !b) return "";
      const rca = cardOf(a).getBoundingClientRect();
      const rcb = cardOf(b).getBoundingClientRect();
      if (Math.abs(rca.left - rcb.left) < 1) return `self:${Math.round(rca.left)}`;
      const rightward = rcb.left >= rca.right || rcb.left > rca.left;
      const sx = rightward ? rca.right : rca.left;
      const ex = rightward ? rcb.left : rcb.right;
      const gutter = Math.abs(ex - sx);
      // Same key for both directions across one gutter: wires sharing a
      // corridor must share a group whichever way they point.
      const span = [Math.round(sx), Math.round(ex)].sort((p, q) => p - q);
      return gutter > 28 && gutter < 320
        ? `gut:${span[0]}:${span[1]}`
        : `under:${Math.round(Math.max(rca.bottom, rcb.bottom))}`;
    });
    const lanes = assignLanes(corridorKey);

    const next: Path[] = [];
    for (const [wireAt, wire] of wires.entries()) {
      const a = nodes.current?.get(wire.from);
      const b = nodes.current?.get(wire.to);
      if (!a || !b) continue;
      const lane = lanes[wireAt];
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();

      // World-space edges of each node. No culling here: the layer lives inside
      // the panned/zoomed world, so "outside the canvas" no longer means
      // offscreen — the viewport clips what the eye can't reach.
      const A = {
        left: (ra.left - base.left) / k,
        right: (ra.right - base.left) / k,
        top: (ra.top - base.top) / k,
        bottom: (ra.bottom - base.top) / k,
      };
      const B = {
        left: (rb.left - base.left) / k,
        right: (rb.right - base.left) / k,
        top: (rb.top - base.top) / k,
        bottom: (rb.bottom - base.top) / k,
      };

      const ax = (A.left + A.right) / 2;
      const ay = (A.top + A.bottom) / 2;
      const bx = (B.left + B.right) / 2;
      const by = (B.top + B.bottom) / 2;

      // Foreign keys draw as ER relationships: orthogonal elbows through the
      // gutter, never diagonals across a card. Three segments — out sideways
      // from the column, vertically along the gutter, in sideways to the key.
      if (wire.relation) {
        // Route around the CARDS, not the rows. A midpoint between two column
        // rows usually lands inside one of the cards, which is how the lines
        // ended up cutting straight through the tables.
        const rca = cardOf(a).getBoundingClientRect();
        const rcb = cardOf(b).getBoundingClientRect();
        const CA = {
          left: (rca.left - base.left) / k,
          right: (rca.right - base.left) / k,
          bottom: (rca.bottom - base.top) / k,
        };
        const CB = {
          left: (rcb.left - base.left) / k,
          right: (rcb.right - base.left) / k,
          bottom: (rcb.bottom - base.top) / k,
        };

        const sameCard = Math.abs(CA.left - CB.left) < 1;
        // Direction follows where the target CARD sits, and only falls back to
        // the rows when the cards genuinely overlap in x. Reading it off the row
        // centres made a wire whose target row happened to sit right of its
        // source exit rightward and then double back to land on a card to its
        // left — two lines travelling right to arrive left.
        const rightward = sameCard
          ? false
          : CB.left >= CA.right
            ? true
            : CA.left >= CB.right
              ? false
              : bx >= ax;

        // Exit the card's own edge, not the row's, so the stub always clears
        // the box it came from.
        const sx = sameCard
          ? CA.left
          : rightward
            ? CA.right
            : CA.left;
        const ex = sameCard ? CB.left : rightward ? CB.left : CB.right;
        const dirOut: 1 | -1 = sameCard ? -1 : rightward ? 1 : -1;

        const r = 7; // elbow radius, so corners read as drawn not aliased
        const gutter = sameCard ? 0 : Math.abs(ex - sx);

        let dd: string;

        if (!sameCard) {
          // Neighbouring cards: run the gutter between them, which is now wide
          // enough to hold a wire. Only reach for the under-card lane when
          // something actually sits in the way.
          const adjacent = gutter > 28 && gutter < 320;
          if (adjacent) {
            // Each wire crossing this gutter gets its own vertical track,
            // centred on the corridor. Pitch is capped so a busy gutter stays
            // inside itself rather than spilling over a card edge.
            const pitch = Math.min(26, Math.max(0, gutter / 2 - 18));
            const mid = (sx + ex) / 2 + lane * pitch;
            const vSign = by > ay ? 1 : -1;
            const canRound = Math.abs(by - ay) > r * 2 + 2;
            dd = canRound
              ? `M ${sx} ${ay} H ${mid - dirOut * r}` +
                ` Q ${mid} ${ay} ${mid} ${ay + vSign * r}` +
                ` V ${by - vSign * r}` +
                ` Q ${mid} ${by} ${mid + dirOut * r} ${by}` +
                ` H ${ex}`
              : `M ${sx} ${ay} H ${mid} V ${by} H ${ex}`;
            next.push({
              d: dd,
              kind: wire.kind,
              depth: wire.depth,
              x1: sx,
              y1: ay,
              er: {
                many: { x: sx, y: ay, dir: dirOut },
                one: { x: ex, y: by, dir: (rightward ? -1 : 1) as 1 | -1 },
              },
            });
            continue;
          }
          // Far apart, with cards in between. Detour beneath everything.
          //
          // Both stubs turn INWARD, toward the lane's interior. Deriving them
          // from dirOut inverted the pair on right-to-left links, so the two
          // verticals crossed and the path doubled back on itself.
          // Hug the taller card. The old offset pushed long-hauls far below
          // everything, which drew one relationship as a giant rectangle
          // sweeping under the whole diagram; only stack when several share it.
          const laneY = Math.max(CA.bottom, CB.bottom) + 22 + lane * 16;
          const inward = ex >= sx ? 1 : -1;
          const outX = sx + inward * 16;
          const inX = ex - inward * 16;
          dd =
            `M ${sx} ${ay} H ${outX - inward * r}` +
            ` Q ${outX} ${ay} ${outX} ${ay + r}` +
            ` V ${laneY - r}` +
            ` Q ${outX} ${laneY} ${outX + inward * r} ${laneY}` +
            ` H ${inX - inward * r}` +
            ` Q ${inX} ${laneY} ${inX} ${laneY - r}` +
            ` V ${by + r}` +
            ` Q ${inX} ${by} ${inX - inward * r} ${by}` +
            ` H ${ex}`;
        } else {
          // Two tables in one card: bow out into the left margin rather than
          // crossing the rows between them. Otherwise run the real gutter.
          const mid = sameCard ? CA.left - 22 : (sx + ex) / 2;
          const sweepDown = by > ay;
          const vSign = sweepDown ? 1 : -1;
          const canRound = Math.abs(by - ay) > r * 2 + 2;
          dd = canRound
            ? `M ${sx} ${ay} H ${mid - dirOut * r}` +
              ` Q ${mid} ${ay} ${mid} ${ay + vSign * r}` +
              ` V ${by - vSign * r}` +
              ` Q ${mid} ${by} ${mid + dirOut * r} ${by}` +
              ` H ${ex}`
            : `M ${sx} ${ay} H ${mid} V ${by} H ${ex}`;
        }
        next.push({
          d: dd,
          kind: wire.kind,
          depth: wire.depth,
          x1: sx,
          y1: ay,
          er: {
            many: { x: sx, y: ay, dir: dirOut },
            one: { x: ex, y: by, dir: (rightward ? -1 : 1) as 1 | -1 },
          },
        });
        continue;
      }

      // Leave and enter through whichever pair of edges the nodes actually
      // face, so a wire never crosses the box it starts from.
      const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);

      let x1: number, y1: number, x2: number, y2: number, d: string;

      if (horizontal) {
        const rightward = bx > ax;
        x1 = rightward ? A.right : A.left;
        y1 = ay;
        x2 = rightward ? B.left : B.right;
        y2 = by;
        const pull = Math.min(Math.max(Math.abs(x2 - x1) * 0.45, 34), 150);
        const dir = rightward ? 1 : -1;
        const tip = x2 - dir * 3;
        d = `M ${x1} ${y1} C ${x1 + pull * dir} ${y1}, ${tip - pull * dir} ${y2}, ${tip} ${y2}`;
      } else {
        const downward = by > ay;
        x1 = ax;
        y1 = downward ? A.bottom : A.top;
        x2 = bx;
        y2 = downward ? B.top : B.bottom;
        const pull = Math.min(Math.max(Math.abs(y2 - y1) * 0.45, 28), 120);
        const dir = downward ? 1 : -1;
        const tip = y2 - dir * 3;
        d = `M ${x1} ${y1} C ${x1} ${y1 + pull * dir}, ${x2} ${tip - pull * dir}, ${x2} ${tip}`;
      }

      next.push({ d, kind: wire.kind, depth: wire.depth, x1, y1 });
    }
    setPaths(next);
  }, [canvasRef, nodes, wires, scale]);

  // Synchronous and pre-paint, so wires never render a frame behind the nodes.
  useLayoutEffect(() => {
    measure();
  }, [measure, version, reflowKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    // Capture phase: scroll does not bubble, so a scrollable canvas pane would
    // otherwise go unheard.
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(canvas);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
  }, [canvasRef, measure]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 hidden md:block"
      width={size.w}
      height={size.h}
      aria-hidden="true"
    >
      <defs>
        {(Object.keys(STROKE) as WireKind[]).map((kind) => (
          <marker
            key={kind}
            id={`arrow-${kind}`}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            // Small and stroked, not a filled wedge. A big solid triangle at
            // the card edge reads as an arrow bolted onto the wire; a light
            // chevron reads as the thread simply arriving.
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path
              d="M 2.5 2 L 8 5 L 2.5 8"
              fill="none"
              stroke={STROKE[kind]}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => {
        // Fade with distance from the focused node, so its direct edges stay
        // the loudest thing on the canvas.
        const opacity = Math.max(0.2, 0.92 - p.depth * 0.24);
        if (p.er) {
          // ER relationship: crow's foot at the referencing column, single bar
          // at the referenced key. Cardinality IS the information here, so the
          // terminals carry it rather than a generic arrowhead.
          const { many, one } = p.er;
          const s = STROKE[p.kind];
          const w = p.depth === 0 ? 1.3 : 1.1;
          return (
            <g key={i} opacity={opacity} stroke={s} strokeWidth={w} fill="none" strokeLinecap="round">
              <path d={p.d} strokeDasharray={DASHED[p.kind]} />
              {/* many: three splayed lines opening away from the column */}
              <path
                d={`M ${many.x + many.dir * 9} ${many.y - 4.5} L ${many.x} ${many.y}` +
                   ` M ${many.x + many.dir * 9} ${many.y} L ${many.x} ${many.y}` +
                   ` M ${many.x + many.dir * 9} ${many.y + 4.5} L ${many.x} ${many.y}`}
              />
              {/* one: a single bar across the line */}
              <path d={`M ${one.x + one.dir * 7} ${one.y - 4.5} L ${one.x + one.dir * 7} ${one.y + 4.5}`} />
            </g>
          );
        }
        return (
          <g key={i} opacity={opacity}>
            <path
              d={p.d}
              fill="none"
              stroke={STROKE[p.kind]}
              strokeWidth={p.depth === 0 ? 1.5 : 1.15}
              strokeLinecap="round"
              strokeDasharray={DASHED[p.kind]}
              markerEnd={`url(#arrow-${p.kind})`}
            />
            {/* Origin dot — the wire's other terminal. Small enough to read as
                a node on the thread rather than a bullet. */}
            <circle cx={p.x1} cy={p.y1} r={2} fill={STROKE[p.kind]} />
          </g>
        );
      })}
    </svg>
  );
}

export function WireLegend() {
  return (
    <div className="hidden flex-wrap items-center gap-x-5 gap-y-2 md:flex">
      <LegendKey kind="derived" label="Resolved by the compiler" />
      <LegendKey kind="partial" label="Found, known incomplete" />
      <LegendKey kind="alarm" label="Unproven — worth a look" />
      <LegendKey kind="inferred" label="Guessed from layout" />
    </div>
  );
}

function LegendKey({ kind, label }: { kind: WireKind; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted-slate">
      <svg width="24" height="8" aria-hidden="true">
        <path
          d="M 1 4 L 23 4"
          stroke={STROKE[kind]}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={DASHED[kind]}
        />
      </svg>
      {label}
    </span>
  );
}
