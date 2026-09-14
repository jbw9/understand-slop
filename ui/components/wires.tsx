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
}

interface Path {
  d: string;
  kind: WireKind;
  depth: number;
  x1: number;
  y1: number;
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

    const next: Path[] = [];
    for (const wire of wires) {
      const a = nodes.current?.get(wire.from);
      const b = nodes.current?.get(wire.to);
      if (!a || !b) continue;
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
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE[kind]} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => {
        // Fade with distance from the focused node, so its direct edges stay
        // the loudest thing on the canvas.
        const opacity = Math.max(0.2, 0.92 - p.depth * 0.24);
        return (
          <g key={i} opacity={opacity}>
            <path
              d={p.d}
              fill="none"
              stroke={STROKE[p.kind]}
              strokeWidth={p.depth === 0 ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={DASHED[p.kind]}
              markerEnd={`url(#arrow-${p.kind})`}
            />
            <circle cx={p.x1} cy={p.y1} r={2.5} fill={STROKE[p.kind]} />
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
