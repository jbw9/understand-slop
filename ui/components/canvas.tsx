"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { E0, E1, L0, L1, type Edge, type Node } from "@/lib/data";

/**
 * The whole screen. A pan/zoom surface holding the diagram — no chrome, no
 * panels, nothing but the map.
 *
 * Depth is driven by CLICK, never by zoom level. Scrolling only changes how big
 * things are; it never changes what is shown. Clicking a subsystem drills into
 * it: the view animates to frame that subsystem and its members ease in behind
 * the movement. This is the whole point — content appearing is always something
 * you asked for, so nothing ever pops at you while you are just looking closer.
 */

const MIN_SCALE = 0.35;
const MAX_SCALE = 3.2;

/** Column/row geometry of the world, in un-scaled px. */
const COL_W = 460;
const ROW_H = 190;
const CARD_W = 380;
const OVERVIEW = { scale: 0.8, x: 120, y: 90 };

function worldPos(node: Node) {
  return { x: node.col * COL_W, y: node.row * ROW_H };
}

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const { nodes, anchor, version } = useWireAnchors();

  const [focus, setFocus] = useState<string | null>(null);
  const [depth, setDepth] = useState(0);

  // Springs carry every view change, so a drill-in glides instead of cutting.
  // Wheel/drag write to these directly, which keeps raw input at 1:1 — a spring
  // on a trackpad would feel like dragging through syrup.
  const sx = useSpring(OVERVIEW.x, { stiffness: 210, damping: 32, mass: 0.9 });
  const sy = useSpring(OVERVIEW.y, { stiffness: 210, damping: 32, mass: 0.9 });
  const ss = useSpring(OVERVIEW.scale, { stiffness: 210, damping: 32, mass: 0.9 });

  // Mirror of the spring's scale, for the wire layer's coordinate maths.
  const [liveScale, setLiveScale] = useState(OVERVIEW.scale);
  useEffect(() => ss.on("change", (v) => setLiveScale(v)), [ss]);

  const transform = useTransform(
    [sx, sy, ss],
    ([x, y, s]: number[]) => `translate3d(${x}px, ${y}px, 0) scale(${s})`,
  );
  const dots = useTransform([sx, sy], ([x, y]: number[]) => `${x}px ${y}px`);

  const openIds = useMemo(
    () => (focus ? new Set([focus]) : new Set<string>()),
    [focus],
  );

  const wires = useMemo<Wire[]>(() => {
    const edges: Edge[] = [...E0];
    for (const id of openIds) edges.push(...(E1[id] ?? []));
    const mapped = edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: wireKind(e.state, e.alarm),
      depth: 0,
    }));
    if (!focus) return mapped;
    // Out-of-scope nodes stay mounted (so their anchors survive), which means
    // their wires would still be drawn across empty space. Keep only edges
    // that actually touch what is in scope.
    const inScope = new Set<string>([focus, ...(L1[focus] ?? []).map((n) => n.id)]);
    return mapped.filter((w) => inScope.has(w.from) && inScope.has(w.to));
  }, [openIds, focus]);

  /* ── drilling ─────────────────────────────────────────────── */

  /** Animate the view so a world-space box sits centred in the viewport. */
  const frame = useCallback(
    (box: { x: number; y: number; w: number; h: number }, pad = 120) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const s = Math.min(
        MAX_SCALE,
        Math.max(
          MIN_SCALE,
          Math.min((r.width - pad * 2) / box.w, (r.height - pad * 2) / box.h),
        ),
      );
      ss.set(s);
      sx.set(r.width / 2 - (box.x + box.w / 2) * s);
      sy.set(r.height / 2 - (box.y + box.h / 2) * s);
    },
    [ss, sx, sy],
  );

  const drillInto = useCallback(
    (node: Node) => {
      const p = worldPos(node);
      const members = L1[node.id]?.length ?? 0;
      // Frame the subsystem plus the column of members about to appear, so the
      // camera lands where the content will be rather than shifting again once
      // it arrives.
      frame({ x: p.x, y: p.y, w: CARD_W, h: 84 + members * 54 });
      setFocus(node.id);
      setDepth(members > 0 ? 1 : 0);
    },
    [frame],
  );

  const drillOut = useCallback(() => {
    setFocus(null);
    setDepth(0);
    ss.set(OVERVIEW.scale);
    sx.set(OVERVIEW.x);
    sy.set(OVERVIEW.y);
  }, [ss, sx, sy]);

  /* ── optical zoom — never changes what is shown ───────────── */

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      const s = ss.get();
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
      // Keep the point under the cursor fixed across the scale change.
      ss.jump(next);
      sx.jump(px - ((px - sx.get()) / s) * next);
      sy.jump(py - ((py - sy.get()) / s) * next);
    },
    [ss, sx, sy],
  );

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else {
        sx.jump(sx.get() - e.deltaX);
        sy.jump(sy.get() - e.deltaY);
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt, sx, sy]);

  /* ── drag to pan ──────────────────────────────────────────── */

  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: sx.get(), py: sy.get() };
    moved.current = false;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    sx.jump(d.px + dx);
    sy.jump(d.py + dy);
  };

  const endDrag = () => {
    // A click on empty space (not a drag) backs out one level.
    if (drag.current && !moved.current && focus) drillOut();
    drag.current = null;
    setDragging(false);
  };

  /* ── keyboard ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (e.key === "=" || e.key === "+") zoomAt(cx, cy, 1.25);
      else if (e.key === "-" || e.key === "_") zoomAt(cx, cy, 0.8);
      else if (e.key === "0") drillOut();
      else if (e.key === "Escape") {
        if (depth === 2) setDepth(1);
        else drillOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, drillOut, depth]);

  return (
    <motion.div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "dotfield relative h-dvh w-screen touch-none overflow-hidden bg-warm-cream",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ backgroundPosition: dots }}
    >
      <motion.div
        ref={worldRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform }}
      >
        {/* Inside the transformed world, so the wires scale with the nodes
            rather than being measured in screen px and drifting. */}
        <WireLayer
          canvasRef={worldRef}
          nodes={nodes}
          wires={wires}
          version={version}
          scale={liveScale}
          reflowKey={`${focus}:${depth}`}
        />

        {L0.map((node) => {
          const p = worldPos(node);
          const open = openIds.has(node.id);
          const members = L1[node.id] ?? [];
          // Out of scope: while one subsystem has focus, the others leave
          // rather than lingering at low opacity. A dimmed card is still a card
          // competing for the eye — and its wires still cross the one you are
          // reading.
          const outOfScope = Boolean(focus) && focus !== node.id;
          return (
            <motion.div
              key={node.id}
              className="absolute flex w-[380px] flex-col gap-2"
              // Kept mounted while out of scope: the anchor stays registered
              // and nothing reflows, so coming back is a pure fade. Pointer
              // events go away so an invisible card can't be clicked.
              style={{
                left: p.x,
                top: p.y,
                pointerEvents: outOfScope ? "none" : "auto",
              }}
              animate={{
                opacity: outOfScope ? 0 : 1,
                scale: outOfScope ? 0.94 : 1,
              }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <NodeCard
                node={node}
                ref={anchor(node.id)}
                inert={outOfScope}
                selected={focus === node.id}
                onClick={() => (open ? drillOut() : drillInto(node))}
              />

              <AnimatePresence>
                {open && members.length > 0 ? (
                  <motion.div
                    className="flex flex-col gap-1.5 pl-6"
                    initial="out"
                    animate="in"
                    exit="out"
                    variants={{
                      in: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } },
                      out: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
                    }}
                  >
                    {members.map((child) => (
                      <motion.div
                        key={child.id}
                        variants={{
                          // Rises and settles rather than appearing. Scale stays
                          // subtle — this reads as the card arriving, not as the
                          // camera moving, which the spring is already doing.
                          out: { opacity: 0, y: -6, scale: 0.97 },
                          in: { opacity: 1, y: 0, scale: 1 },
                        }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <NodeCard
                          node={child}
                          ref={anchor(child.id)}
                          compact
                          detail={depth >= 2}
                          onClick={() => setDepth(depth >= 2 ? 1 : 2)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

function NodeCard({
  node,
  ref,
  compact,
  inert,
  selected,
  detail,
  onClick,
}: {
  node: Node;
  ref: (el: HTMLElement | null) => void;
  compact?: boolean;
  /** Out of scope: the wrapper fades it, so the card just drops its affordances. */
  inert?: boolean;
  selected?: boolean;
  detail?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      ref={ref as never}
      data-node
      onClick={onClick}
      className={cn(
        "w-full rounded-[14px] border bg-pure-white px-4 text-left transition-[border-color,opacity,box-shadow] duration-200",
        compact ? "py-2" : "py-3.5",
        // A hole in the analysis is drawn as a hole: dashed edge, no fill
        // weight. It should look unfinished, because it is.
        node.ghost
          ? "border-dashed border-border-strong bg-surface-container-low/60"
          : "border-border-gray",
        selected && "border-deep-green ring-1 ring-deep-green",
        onClick && !inert && "hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] text-ink",
            compact ? "text-[12.5px]" : "text-[15px]",
          )}
        >
          {node.title}
        </span>
        <StateChip state={node.state} alarm={node.alarm} />
      </div>
      <p
        className={cn(
          "mt-0.5 truncate font-mono text-faint",
          compact ? "text-[10px]" : "text-[11.5px]",
        )}
      >
        {node.sub}
      </p>
      <AnimatePresence initial={false}>
        {detail && node.detail ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-1.5 border-t border-border-gray pt-1.5 text-[10.5px] leading-relaxed text-on-surface-variant">
              {node.detail}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Tag>
  );
}
