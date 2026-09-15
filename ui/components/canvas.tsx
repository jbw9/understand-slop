"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, type RowCtx } from "@/components/anatomy";
import { StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { E0, E1, L0, L1, LINKS, type Edge, type Node } from "@/lib/data";

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

/** Comfortable reading band. Drilling nudges into this and no further. */
const READ_MIN = 0.75;
const READ_MAX = 1.05;

const CARD_W = 380;
const OVERVIEW = { scale: 0.8, x: 80, y: 60 };

/**
 * Open-domain metrics. The camera has to frame content that does not exist yet
 * at the moment of the click, so these mirror the capability row's real layout
 * — `w-[340px]` children, `gap-14` (56px), `pl-6` (24px) — and are used both to
 * size the world box and to aim the drill.
 */
const CHILD_W = 340;
const CHILD_GAP = 56;
const CHILD_PL = 24;
const CARD_H = 57;
/** Tallest expanded capability card, measured from the rendered DB domain. */
const OPEN_CHILD_H = 410;

/**
 * Hand-placed layout, read left-to-right as a request flows through the system:
 * the client enters, the API fans out to the domains that do the work, and
 * those land on the stores that persist it.
 *
 * Deliberately NOT a uniform grid. An even col*W, row*H lattice reads as a
 * spreadsheet — every card the same size at the same pitch says nothing about
 * what matters or what depends on what. Real architecture diagrams vary tier
 * width, stagger cards off each other's baseline, and give the busy tiers more
 * room. The irregularity is the information.
 */
const PLACE: Record<string, { x: number; y: number; w?: number }> = {
  // entry
  client: { x: 0, y: 250 },
  // the gate everything passes through — narrower, straddling the fan
  api: { x: 460, y: 150, w: 310 },
  auth: { x: 460, y: 370, w: 310 },
  // the domains that do the work, fanned out
  billing: { x: 880, y: 20 },
  projects: { x: 880, y: 250 },
  jobs: { x: 880, y: 480 },
  // where it all lands
  db: { x: 1330, y: 135 },
  storage: { x: 1330, y: 365 },
  // The hole sits in the tier it would instrument, not exiled far below —
  // stranded with no neighbour it read as forgotten rather than deliberate.
  obs: { x: 1330, y: 575, w: 310 },
};

function worldPos(node: Node) {
  return PLACE[node.id] ?? { x: 0, y: 0 };
}

function cardWidth(node: Node) {
  return PLACE[node.id]?.w ?? CARD_W;
}

/**
 * Explicit size for the world box.
 *
 * Every node inside it is absolutely positioned, so without this the element
 * collapses to 0x0 — and WireLayer, which measures its bounding rect to size
 * the SVG, renders a 0x0 canvas that clips every wire away. The paths are
 * computed correctly either way; they simply have nowhere to land.
 */
// Padding is generous enough for an expanded domain's capabilities to have
// somewhere to go, but not the blind +900 that left a third of the canvas dead.
// The width term carries the widest open domain, whose capability row unfolds
// to the right of its title card. Sizing to the domain cards alone clipped the
// SVG and took the rightmost relationship wires with it.
const WIDEST_OPEN = Math.max(
  ...Object.values(L1).map((m) =>
    m.length ? CHILD_PL + m.length * CHILD_W + (m.length - 1) * CHILD_GAP : 0,
  ),
);
const WORLD = {
  w: Math.max(...L0.map((n) => worldPos(n).x)) + WIDEST_OPEN + 160,
  h: Math.max(...L0.map((n) => worldPos(n).y)) + CARD_H + OPEN_CHILD_H + 160,
};

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

  /* ── tracing a row-level chain ────────────────────────────── */

  const [traced, setTraced] = useState<string | null>(null);

  /**
   * Walk LINKS outward from the clicked row. Following the chain transitively
   * is what produces the cascade a developer expects — click a foreign key and
   * you see the column it references *and* what reads that column, not just one
   * hop. Depth-capped so a cycle in the fixture can't hang the walk.
   */
  const lit = useMemo(() => {
    if (!traced) return new Set<string>();
    const seen = new Set<string>([traced]);
    let frontier = [traced];
    for (let hop = 0; hop < 6 && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const l of LINKS) {
          if (l.from === id && !seen.has(l.to)) { seen.add(l.to); next.push(l.to); }
          if (l.to === id && !seen.has(l.from)) { seen.add(l.from); next.push(l.from); }
        }
      }
      frontier = next;
    }
    return seen;
  }, [traced]);

  const wires = useMemo<Wire[]>(() => {
    // While tracing, row wires REPLACE card wires. Two wire systems on screen
    // at once is exactly the clutter that made the card-only version unreadable.
    if (traced) {
      return LINKS.filter((l) => lit.has(l.from) && lit.has(l.to)).map((l) => ({
        from: l.from,
        to: l.to,
        kind: wireKind(l.state, l.alarm),
        depth: l.from === traced || l.to === traced ? 0 : 1,
        relation: l.label === "FK",
      }));
    }
    const edges: Edge[] = [...E0];
    for (const id of openIds) edges.push(...(E1[id] ?? []));
    const mapped: Wire[] = edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: wireKind(e.state, e.alarm),
      depth: 0,
    }));
    if (!focus) return mapped;

    // Foreign keys show as soon as a domain is open — an ER map you have to
    // hunt for by clicking rows is not a map. Only FKs whose BOTH ends are
    // inside this domain's open capabilities, so nothing dangles off-screen.
    const capIds = new Set((L1[focus] ?? []).map((n) => n.id));
    const owner = (rowKey: string) => rowKey.slice(0, rowKey.indexOf(":"));
    const fks: Wire[] = LINKS.filter(
      (l) =>
        l.label === "FK" &&
        capIds.has(owner(l.from)) &&
        capIds.has(owner(l.to)),
    ).map((l) => ({
      from: l.from,
      to: l.to,
      kind: wireKind(l.state, l.alarm),
      depth: 0,
      relation: true,
    }));
    // Out-of-scope nodes stay mounted (so their anchors survive), which means
    // their wires would still be drawn across empty space. Keep only edges
    // that actually touch what is in scope.
    const inScope = new Set<string>([focus, ...(L1[focus] ?? []).map((n) => n.id)]);
    return [
      ...mapped.filter((w) => inScope.has(w.from) && inScope.has(w.to)),
      ...fks,
    ];
  }, [openIds, focus, traced, lit]);

  const rowCtx = useMemo<RowCtx>(
    () => ({
      anchor,
      lit,
      tracing: Boolean(traced),
      onTrace: (id) => setTraced((cur) => (cur === id ? null : id)),
    }),
    [anchor, lit, traced],
  );

  /* ── drilling ─────────────────────────────────────────────── */

  /**
   * Centre a world-space box in the viewport.
   *
   * Deliberately does NOT scale to fit. Drilling in is a FILTER — the other
   * domains fade out, which is what makes the focused one readable. Zooming
   * hard on top of that is redundant magnification that throws away the
   * surrounding context for no gain. Scale is only nudged into a comfortable
   * reading band, and left alone if it is already there.
   */
  const frame = useCallback(
    (box: { x: number; y: number; w: number; h: number }) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const s = Math.min(READ_MAX, Math.max(READ_MIN, ss.get()));
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
      // Frame the domain AND the capabilities it is about to spawn. Centring on
      // the title card alone parked the camera on a 304px box while ~1200px of
      // content unfolded to its right, which is what pushed the whole diagram
      // into the lower-right corner with half the screen left empty.
      const w = members
        ? CHILD_PL + members * CHILD_W + (members - 1) * CHILD_GAP
        : cardWidth(node);
      // Real opened height, not a per-member estimate: an expanded schema card
      // runs ~410px, so the old 84 + n*62 centred well above the content.
      const h = members ? CARD_H + CHILD_GAP + OPEN_CHILD_H : CARD_H;
      frame({ x: p.x, y: p.y, w, h });
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
      else if (e.key === "0") { setTraced(null); drillOut(); }
      else if (e.key === "Escape") {
        // Unwind one layer at a time: trace, then detail, then focus.
        if (traced) setTraced(null);
        else if (depth === 2) setDepth(1);
        else drillOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, drillOut, depth, traced]);

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
        style={{ transform, width: WORLD.w, height: WORLD.h }}
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
              className="absolute flex flex-col gap-2"
              // Kept mounted while out of scope: the anchor stays registered
              // and nothing reflows, so coming back is a pure fade. Pointer
              // events go away so an invisible card can't be clicked.
              style={{
                left: p.x,
                top: p.y,
                // The domain card keeps its tier width whether open or not.
                // Letting it stretch to its children made a one-line title card
                // span 1100px, which read as a banner rather than a node.
                width: cardWidth(node),
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
                    // Capabilities lay out in columns, not one stack. A single
                    // 380px column runs off the bottom of the viewport and
                    // wastes the whole width of the canvas; side-by-side keeps
                    // a domain readable in one screenful.
                    // Capabilities sit side by side in real columns. A single
                    // stack runs off the bottom of the viewport and wastes the
                    // whole width of the canvas.
                    // The gutter is where the FK wires run. At gap-4 three
                    // relationships shared one lane and stacked into a bundle;
                    // this gives each its own vertical track while still
                    // fitting three cards across a laptop screen.
                    className="flex items-start gap-14 pl-6"
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
                        {/* Anatomy opens with the drill, not on a second
                            hidden click. Showing three bare title cards in an
                            empty screen buries the only content that matters. */}
                        <div className="w-[340px]">
                          <NodeCard
                            node={child}
                            ref={anchor(child.id)}
                            compact
                            detail
                            ctx={rowCtx}
                          />
                        </div>
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
  ctx,
  onClick,
}: {
  node: Node;
  ref: (el: HTMLElement | null) => void;
  compact?: boolean;
  /** Out of scope: the wrapper fades it, so the card just drops its affordances. */
  inert?: boolean;
  selected?: boolean;
  detail?: boolean;
  /** Row anchoring and trace state, threaded down to the anatomy rows. */
  ctx?: RowCtx;
  onClick?: () => void;
}) {
  // Always a div, never a button. Anatomy rows are themselves buttons, and the
  // HTML parser refuses to nest interactive elements — it reparents the inner
  // ones out of the card, which detaches every wire anchor inside it. The card
  // takes its click via role/keyboard instead.
  return (
    <div
      ref={ref as never}
      data-node
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
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
        {detail && (node.detail || node.anatomy) ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 border-t border-border-gray pt-2">
              {node.detail ? (
                <p className="text-[10.5px] leading-relaxed text-on-surface-variant">
                  {node.detail}
                </p>
              ) : null}
              {node.anatomy && ctx ? (
                <div className={cn(node.detail && "mt-2.5")}>
                  <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} />
                </div>
              ) : null}
              {/* Provenance, always. A claim with no location is the failure
                  mode this tool exists to avoid. */}
              {node.evidence ? (
                <p className="mt-2 font-mono text-[9.5px] text-faint">
                  {node.evidence}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
