"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { KindLabel } from "@/components/card";
import { Detail } from "@/components/detail";
import { EditsProvider } from "@/components/edits";
import { EASE, LAYER_NAME, LevelList, membersAt, opensLevel } from "@/components/level";
import { onPlainClick, useMapNav } from "@/components/nav";
import { StateChip } from "@/components/state";
import { DASHED, STROKE, wireKind, type WireKind } from "@/components/wires";
import { layerOf, type Edge, type Node } from "@/lib/data";
import { useMap } from "@/components/map-context";
import { MAP_CARD_H, MAP_CARD_W, MAP_LANE_W, edgeKey, layoutRoots, type MapLayout } from "@/lib/layout";

/**
 * The main view (D16): the map first, then a focus view for whatever you
 * click on it.
 *
 * The map is the whole surface at once, laid out from the data and wired with
 * the relationships between its parts — the thing the columns view lost.
 * Clicking a card glides it into the top-left, where it heads a trail of
 * everything you've opened; under the trail is ONE level, the cards inside
 * the deepest thing you opened; on the right is the pane with that thing's
 * description and every function behind it, editable. Going deeper adds a
 * card to the trail and swaps the level, so depth never piles up on screen.
 * Code depth (calls, methods) drills inside the pane instead (detail.tsx).
 */

export function Explorer() {
  const map = useMap();
  const { RUN, edgesOf, nodeAt } = map;
  const { path, go, traced, setTraced, jump, rowCtx, href } = useMapNav();
  const [pointed, setPointed] = useState<string | null>(null);

  const view = useMemo(() => {
    // A path may end at a code unit (a jump, a link). Code is shown in its
    // owner's pane, so the view stands on the owner and scrolls to the unit.
    const tail = path.length ? nodeAt(path) : null;
    const focusUnit = tail?.unit ? tail.id : null;
    const at = focusUnit ? path.slice(0, -1) : path;
    const open = at.length ? nodeAt(at) : null;

    // The level on screen: the open node's own children if it has a level of
    // its own; otherwise its siblings, with it selected. A root with nothing
    // below it lists nothing — the pane says all there is.
    const opens = open ? opensLevel(open) : false;
    const listAt = opens ? at : at.slice(0, -1);
    const selected = opens ? undefined : at[at.length - 1];
    const members = at.length && (opens || at.length > 1) ? membersAt(map, listAt, selected) : [];
    const listParent = listAt.length ? nodeAt(listAt) : null;
    return { focusUnit, at, open, listAt, selected, members, listParent };
  }, [path, map, nodeAt]);
  const { focusUnit, at, open, listAt, selected, members, listParent } = view;

  /* ── keyboard ──────────────────────────────────────────────── */

  // ↑/↓ move a cursor through the level without going anywhere — on this
  // view, picking a card with a level of its own moves you into it, so the
  // arrows must not pick. Enter or → opens the card under the cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,[contenteditable]")) return;
      if (e.key === "0") {
        go([]);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!members.length) return;
        e.preventDefault();
        const from = members.findIndex((n) => n.id === (pointed ?? selected));
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = from < 0 ? 0 : Math.min(members.length - 1, Math.max(0, from + step));
        setPointed(members[next].id);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (!pointed || !members.some((n) => n.id === pointed)) return;
        e.preventDefault();
        go([...listAt, pointed]);
        setPointed(null);
      } else if (e.key === "ArrowLeft" || e.key === "Escape") {
        if (e.key === "Escape" && traced) {
          setTraced(null);
          return;
        }
        if (!at.length) return;
        e.preventDefault();
        go(at.slice(0, -1));
        setPointed(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [members, pointed, selected, listAt, at, traced, go, setTraced]);

  return (
    <EditsProvider>
      <LayoutGroup>
        <div className="flex h-dvh flex-col bg-warm-cream">
          <header className="flex shrink-0 items-baseline gap-3 border-b border-border-gray px-5 py-3">
            {map.maps.length > 1 ? (
              // Which codebase: every map in /maps/index.json.
              <select
                aria-label="Codebase"
                value={map.name}
                onChange={(e) => map.switchTo(e.target.value)}
                className="cursor-pointer rounded-[6px] border border-transparent bg-transparent py-0.5 pr-1 text-[13px] font-semibold tracking-[-0.01em] text-ink transition-[border-color] duration-150 hover:border-border-gray"
              >
                {map.maps.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.title ?? m.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{RUN.repo}</span>
            )}
            <span className="font-mono text-[10.5px] text-faint">
              {RUN.commit} · {RUN.files} files
            </span>
            {map.warnings.length ? (
              // Drift: code the story names that the repo no longer has. The
              // cards say so too; this is the count, with the list on hover.
              <span
                title={map.warnings.join("\n")}
                className="cursor-help font-mono text-[10.5px] font-semibold text-clay-ink"
              >
                {map.warnings.length} warning{map.warnings.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {map.editable ? null : <span className="font-mono text-[10.5px] text-faint">· demo, read-only</span>}
            <span className="ml-auto hidden font-mono text-[10px] text-faint md:inline">
              {at.length ? "↑ ↓ move · → open · ← back · 0 map" : "click a card to open it"}
            </span>
          </header>

          <div className="relative min-h-0 flex-1">
            <AnimatePresence initial={false} mode="popLayout">
              {at.length === 0 ? (
                <MapView key="map" onOpen={(id) => go([id])} hrefOf={(id) => href([id])} />
              ) : (
                <motion.div
                  key="focus"
                  className="absolute inset-0 flex"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  <div className="flex w-[380px] shrink-0 flex-col border-r border-border-gray">
                    <Trail at={at} onGo={go} href={href} />
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                      {members.length ? (
                        <>
                          <LevelHeader members={members} parent={listParent} />
                          <LevelList
                            members={members}
                            edges={edgesOf(listAt)}
                            selected={selected}
                            pointed={pointed}
                            ruleStores={listAt.length === 0}
                            hrefOf={(id) => href([...listAt, id])}
                            onPick={(id) => {
                              setPointed(null);
                              go([...listAt, id]);
                            }}
                            onJump={(id) => jump(id)}
                            onPoint={setPointed}
                          />
                        </>
                      ) : (
                        <p className="mt-4 text-[11px] leading-relaxed text-faint">
                          Nothing below this card — everything it holds is in the pane.
                        </p>
                      )}
                    </div>
                  </div>
                  <Detail node={open} focusUnit={focusUnit} ctx={rowCtx} traced={traced} onJump={jump} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </LayoutGroup>
    </EditsProvider>
  );
}

/* ── the map ────────────────────────────────────────────────── */

const MAP_PAD = 48;

/** Zoom range on the whiteboard, and how hard a wheel notch / pinch zooms. */
const MIN_S = 0.25;
const MAX_S = 2.5;
const WHEEL_ZOOM = 0.0018;
/** A press that travels further than this is a pan, not a click. */
const DRAG_SLOP = 4;

type View = { s: number; x: number; y: number };

/**
 * Every root at once, placed by `layoutRoots`, on an infinite whiteboard.
 *
 * It opens fitted to the window. From there it moves like any whiteboard:
 *  - drag anywhere (on a card too — a press that moves pans instead of
 *    opening the card) to pan;
 *  - scroll or two-finger swipe to pan;
 *  - pinch, or ctrl/⌘ + scroll, to zoom at the pointer;
 *  - the buttons in the corner zoom, and "fit" brings the whole map back.
 * The dot grid moves and scales with the board, so it reads as one surface.
 */
function MapView({
  onOpen,
  hrefOf,
}: {
  onOpen: (id: string) => void;
  hrefOf: (id: string) => string;
}) {
  const { L0, E0 } = useMap();
  const layout = useMemo(() => layoutRoots(L0, E0), [L0, E0]);
  const viewport = useRef<HTMLDivElement>(null);
  // Map cards are a fixed size, so the wires are drawn from the layout alone:
  // nothing is measured, so nothing can be measured mid-animation.
  const h = layout.h + 24;

  // The view lives in motion values, NOT React state. Every card carries the
  // trail's shared layoutId (that is what glides the clicked card into the
  // top-left), and motion treats any re-render that moves a layoutId element
  // as a layout change to ease — so a pan held in state made the cards trail
  // the pointer by ~50px. Motion values write the transform straight to the
  // DOM; panning and zooming never re-render, so nothing eases.
  const vs = useMotionValue(1);
  const vx = useMotionValue(MAP_PAD);
  const vy = useMotionValue(MAP_PAD);
  const world = useRef<HTMLDivElement>(null);

  // Written to the DOM by hand on every change. (A useMotionTemplate over the
  // three values missed the first fit under StrictMode's double-mounted
  // effects, so the map opened unfitted.) Applied once on subscribe as well.
  useEffect(() => {
    const apply = () => {
      const s = vs.get();
      const x = vx.get();
      const y = vy.get();
      if (world.current) world.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      const vp = viewport.current;
      if (vp) {
        // The grid is the board's own surface: it pans and scales with it.
        vp.style.backgroundPosition = `${x - 1}px ${y - 1}px`;
        vp.style.backgroundSize = `${24 * s}px ${24 * s}px`;
      }
    };
    apply();
    const off = [vs, vx, vy].map((v) => v.on("change", apply));
    return () => off.forEach((f) => f());
  }, [vs, vx, vy]);

  /** Once you've moved the board, a window resize no longer refits it. */
  const touched = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  /** Set when a press turned into a pan, so the click it ends in is dropped. */
  const panned = useRef(false);

  const set = useCallback(
    (v: View) => {
      vs.set(v.s);
      vx.set(v.x);
      vy.set(v.y);
    },
    [vs, vx, vy],
  );

  const fitView = useCallback((): View | null => {
    const el = viewport.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = Math.min(1.15, (r.width - 2 * MAP_PAD) / layout.w, (r.height - 2 * MAP_PAD) / h);
    return { s, x: (r.width - layout.w * s) / 2, y: Math.max(MAP_PAD, (r.height - h * s) / 2) };
  }, [layout, h]);

  // An effect, not a layout effect: the board's transform template subscribes
  // to the view in its own effect, and a fit set before that subscription is
  // missed — the map then opens unfitted and jumps on the first pan. The map
  // fades in, which covers the one frame before this runs.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const refit = () => {
      if (touched.current) return;
      const v = fitView();
      if (v) set(v);
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitView, set]);

  /** Zoom by `k` keeping the board point under (cx, cy) where it is. */
  const zoomAt = useCallback(
    (k: number, cx: number, cy: number) => {
      touched.current = true;
      const s0 = vs.get();
      const s = Math.min(MAX_S, Math.max(MIN_S, s0 * k));
      const f = s / s0;
      set({ s, x: cx - (cx - vx.get()) * f, y: cy - (cy - vy.get()) * f });
    },
    [vs, vx, vy, set],
  );

  // Wheel has to be a native, non-passive listener: React's onWheel is
  // passive, and the page must not scroll or browser-zoom under the board.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl + wheel.
        zoomAt(Math.exp(-e.deltaY * WHEEL_ZOOM * (e.deltaMode === 1 ? 16 : 1)), e.clientX - r.left, e.clientY - r.top);
      } else {
        touched.current = true;
        vx.set(vx.get() - e.deltaX);
        vy.set(vy.get() - e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, vx, vy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panned.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: vx.get(), vy: vy.get(), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      d.moved = true;
      touched.current = true;
      // Captured only once it is really a pan, so a plain click still
      // reaches the card it landed on. The cursor is set on the element, not
      // through state, for the same no-re-render reason as the view.
      viewport.current?.setPointerCapture(e.pointerId);
      viewport.current?.classList.add("cursor-grabbing");
    }
    vx.set(d.vx + dx);
    vy.set(d.vy + dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    panned.current = d.moved;
    drag.current = null;
    viewport.current?.classList.remove("cursor-grabbing");
  };

  const zoomCentre = (k: number) => {
    const r = viewport.current?.getBoundingClientRect();
    if (r) zoomAt(k, r.width / 2, r.height / 2);
  };
  const refitNow = () => {
    const v = fitView();
    if (!v) return;
    touched.current = false;
    set(v);
  };

  return (
    <motion.div
      ref={viewport}
      className="dotfield absolute inset-0 cursor-grab touch-none overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // A press that panned must not also open the card it started on.
      onClickCapture={(e) => {
        if (panned.current) {
          e.stopPropagation();
          e.preventDefault();
          panned.current = false;
        }
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      <div
        ref={world}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: layout.w, height: h }}
      >
        <MapWires layout={layout} edges={E0} w={layout.w} h={h} />
        {L0.map((n) => {
          const p = layout.at[n.id];
          return (
            <div
              key={n.id}
              className="absolute"
              style={{ left: p.x, top: p.y, width: MAP_CARD_W, height: MAP_CARD_H }}
            >
              <MapCard node={n} href={hrefOf(n.id)} onClick={() => onOpen(n.id)} />
            </div>
          );
        })}
      </div>

      {/* Outside the board, so it stays put while the board moves. */}
      <div
        className="absolute bottom-4 right-4 flex items-center gap-px overflow-hidden rounded-[10px] border border-border-gray bg-pure-white font-mono text-[11px] text-on-surface-variant"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MapButton label="Zoom out" onClick={() => zoomCentre(1 / 1.25)}>−</MapButton>
        <ZoomReadout scale={vs} />
        <MapButton label="Zoom in" onClick={() => zoomCentre(1.25)}>+</MapButton>
        <MapButton label="Fit the map" onClick={refitNow}>fit</MapButton>
      </div>
    </motion.div>
  );
}

/** The zoom level, re-rendering only itself as the scale moves. */
function ZoomReadout({ scale }: { scale: MotionValue<number> }) {
  const [pct, setPct] = useState(() => Math.round(scale.get() * 100));
  useMotionValueEvent(scale, "change", (k) => setPct(Math.round(k * 100)));
  return <span className="tnum min-w-[44px] select-none text-center text-faint">{pct}%</span>;
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-8 min-w-8 cursor-pointer px-2.5 transition-[background-color,color] duration-150 hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}

function MapCard({ node, href, onClick }: { node: Node; href: string; onClick: () => void }) {
  return (
    // A link, so middle-click opens the card in a new tab. Not draggable: a
    // link's native drag (a URL ghost) would fight the board's own panning.
    <motion.a
      href={href}
      draggable={false}
      // The same layoutId as the trail's first card: the card you click on
      // the map is the card that lands in the top-left.
      layoutId={`card-${node.id}`}
      data-node-id={node.id}
      onClick={(e) => onPlainClick(e, onClick)}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn(
        "block h-full w-full cursor-pointer select-none rounded-[14px] border bg-pure-white px-4 py-3 text-left",
        "transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
        node.ghost ? "border-dashed border-border-strong bg-surface-container-low/60" : "border-border-gray",
      )}
    >
      <KindLabel kind={node.kind} />
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
          {node.title}
        </span>
        <StateChip state={node.state} alarm={node.alarm} />
      </span>
      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">{node.sub}</span>
    </motion.a>
  );
}

type Pt = { x: number; y: number };
type Spot = Pt & { anchor: "start" | "middle" | "end" };

/**
 * The root edges, drawn to read as a list rather than a web.
 *
 * Three shapes, decided by where the ends sit in the linear layout:
 *  - next card down the column: a short straight arrow, label beside it;
 *  - any other surface edge: an arc in the left gutter, in the lane the layout
 *    gave it, label at the arc's outer edge;
 *  - into or out of the store column: one horizontal curve across the gap.
 * Several edges on one card side are spread along it, ordered by where their
 * other ends are, so they fan out instead of stacking on one point. Wires sit
 * under the cards. Each label goes at the first of its candidate spots that
 * clears every card and every label already placed.
 */
function MapWires({
  layout,
  edges,
  w,
  h,
}: {
  layout: MapLayout;
  edges: Edge[];
  w: number;
  h: number;
}) {
  const geo = useMemo(() => {
    const box = (id: string) => {
      const p = layout.at[id];
      return p ? { x: p.x, y: p.y, w: MAP_CARD_W, h: MAP_CARD_H } : null;
    };
    const onColumn = (id: string) => id in layout.index;
    const drawn = edges.filter((e) => box(e.from) && box(e.to) && e.from !== e.to);

    type Shape = "down" | "arc" | "across";
    const shapeOf = (e: Edge): Shape =>
      onColumn(e.from) && onColumn(e.to)
        ? layout.index[e.to] === layout.index[e.from] + 1
          ? "down"
          : "arc"
        : !onColumn(e.from) && !onColumn(e.to)
          ? "down"
          : "across";

    // Ports on a card's left (arcs) and right (across) sides, spread evenly
    // and ordered by the other end's height so the fans don't cross.
    const ports = new Map<string, { edge: number; end: 0 | 1; key: number }[]>();
    const sideOf = (e: Edge, end: 0 | 1): "left" | "right" | null => {
      const shape = shapeOf(e);
      if (shape === "arc") return "left";
      if (shape !== "across") return null;
      const id = end === 0 ? e.from : e.to;
      return onColumn(id) ? "right" : "left";
    };
    drawn.forEach((e, i) => {
      ([0, 1] as const).forEach((end) => {
        const side = sideOf(e, end);
        if (!side) return;
        const id = end === 0 ? e.from : e.to;
        const k = `${id}|${side}`;
        if (!ports.has(k)) ports.set(k, []);
        ports.get(k)!.push({ edge: i, end, key: box(end === 0 ? e.to : e.from)!.y });
      });
    });
    const port = new Map<string, Pt>();
    for (const [k, list] of ports) {
      const [id, side] = k.split("|");
      const b = box(id)!;
      list.sort((p, q) => p.key - q.key);
      list.forEach((p, j) => {
        const t = (j + 1) / (list.length + 1);
        port.set(`${p.edge}:${p.end}`, { x: side === "left" ? b.x : b.x + b.w, y: b.y + b.h * t });
      });
    }

    const cards = Object.keys(layout.at).map((id) => box(id)!);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const clear = (r: { x: number; y: number; w: number; h: number }) =>
      ![...cards, ...placed].some(
        (o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h,
      );
    const cubic = (p0: Pt, c0: Pt, c1: Pt, p1: Pt) => (t: number): Pt => {
      const u = 1 - t;
      return {
        x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y,
      };
    };

    return drawn.map((e, i) => {
      const shape = shapeOf(e);
      const a = box(e.from)!;
      const b = box(e.to)!;
      let d: string;
      let spots: Spot[];
      if (shape === "down") {
        // Straight down the middle — or up, for a store that feeds one above it.
        const goingDown = b.y > a.y;
        const p0 = { x: a.x + a.w / 2, y: goingDown ? a.y + a.h : a.y };
        const p1 = { x: b.x + b.w / 2, y: goingDown ? b.y - 6 : b.y + b.h + 6 };
        d = `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
        const m = { x: p0.x, y: (p0.y + p1.y) / 2 };
        spots = [
          { x: m.x + 9, y: m.y, anchor: "start" },
          { x: m.x - 9, y: m.y, anchor: "end" },
        ];
      } else if (shape === "arc") {
        const p0 = port.get(`${i}:0`)!;
        const end = port.get(`${i}:1`)!;
        const p1 = { x: end.x - 6, y: end.y };
        const bulge = 26 + (layout.lane[edgeKey(e)] ?? 0) * MAP_LANE_W;
        // Control points a third further out than the bulge, so the arc's
        // outermost point lands on the lane itself.
        const k = bulge * 1.33;
        d = `M ${p0.x} ${p0.y} C ${p0.x - k} ${p0.y}, ${p1.x - k} ${p1.y}, ${p1.x} ${p1.y}`;
        const apex = { x: p0.x - bulge, y: (p0.y + p1.y) / 2 };
        spots = [
          { x: apex.x - 6, y: apex.y, anchor: "end" },
          { x: apex.x - 6, y: apex.y - 16, anchor: "end" },
          { x: apex.x - 6, y: apex.y + 16, anchor: "end" },
        ];
      } else {
        const p0 = port.get(`${i}:0`)!;
        const end = port.get(`${i}:1`)!;
        const dir = end.x > p0.x ? 1 : -1;
        const p1 = { x: end.x - dir * 6, y: end.y };
        const k = Math.max(60, Math.abs(p1.x - p0.x) * 0.45);
        const c0 = { x: p0.x + dir * k, y: p0.y };
        const c1 = { x: p1.x - dir * k, y: p1.y };
        d = `M ${p0.x} ${p0.y} C ${c0.x} ${c0.y}, ${c1.x} ${c1.y}, ${p1.x} ${p1.y}`;
        const at = cubic(p0, c0, c1, p1);
        spots = [0.5, 0.35, 0.65, 0.25, 0.75].flatMap((t) => {
          const m = at(t);
          return [
            { x: m.x, y: m.y - 9, anchor: "middle" as const },
            { x: m.x, y: m.y + 11, anchor: "middle" as const },
          ];
        });
      }

      const lw = (e.label?.length ?? 0) * 6.7 + 8;
      const rect = (m: Spot) => ({
        x: m.anchor === "start" ? m.x : m.anchor === "end" ? m.x - lw : m.x - lw / 2,
        y: m.y - 8,
        w: lw,
        h: 16,
      });
      const spot = spots.find((m) => clear(rect(m))) ?? spots[0];
      if (e.label) placed.push(rect(spot));
      return { key: edgeKey(e), d, kind: wireKind(e.state, e.alarm), label: e.label, spot };
    });
  }, [layout, edges]);

  const kinds = Array.from(new Set(geo.map((g) => g.kind)));
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={w} height={h}>
      <defs>
        {kinds.map((k: WireKind) => (
          <marker
            key={k}
            id={`map-arrow-${k}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={STROKE[k]} />
          </marker>
        ))}
      </defs>
      {geo.map((g) => (
        <path
          key={g.key}
          d={g.d}
          fill="none"
          stroke={STROKE[g.kind]}
          strokeOpacity={0.9}
          strokeWidth={1.5}
          strokeDasharray={DASHED[g.kind]}
          markerEnd={`url(#map-arrow-${g.kind})`}
        />
      ))}
      {geo.map((g) =>
        g.label ? (
          <text
            key={`${g.key}:label`}
            x={g.spot.x}
            y={g.spot.y}
            textAnchor={g.spot.anchor}
            dominantBaseline="middle"
            className="fill-faint font-mono text-[11px]"
            // A cream halo, so a label reads even where its line crosses another.
            style={{ paintOrder: "stroke", stroke: "var(--color-warm-cream)", strokeWidth: 5 }}
          >
            {g.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ── the focus view ─────────────────────────────────────────── */

/**
 * Everything you've opened, root first, one compact card per level, each a
 * step further in. The first card is the one that left the map. Clicking a
 * card goes back to it; "Map" goes all the way out.
 */
function Trail({
  at,
  onGo,
  href,
}: {
  at: string[];
  onGo: (path: string[]) => void;
  href: (path: string[]) => string;
}) {
  const { nodeAt } = useMap();
  return (
    <nav aria-label="Trail" className="shrink-0 border-b border-border-gray px-4 pb-3 pt-3">
      <a
        href={href([])}
        onClick={(e) => onPlainClick(e, () => onGo([]))}
        className="mb-2 inline-block cursor-pointer rounded-[6px] px-1 font-mono text-[10px] text-faint transition-[background-color,color] duration-150 hover:bg-surface hover:text-ink"
      >
        ← map
      </a>
      <ol className="flex flex-col gap-1.5">
        {at.map((id, i) => {
          const n = nodeAt(at.slice(0, i + 1));
          if (!n) return null;
          const last = i === at.length - 1;
          return (
            <li
              key={id}
              // A step in per level, capped so a deep trail never squeezes
              // the titles: past three, the order says the rest.
              style={{ paddingLeft: Math.min(i, 3) * 14 }}
            >
              <motion.a
                href={href(at.slice(0, i + 1))}
                layoutId={i === 0 ? `card-${id}` : undefined}
                transition={{ duration: 0.4, ease: EASE }}
                onClick={(e) => onPlainClick(e, () => onGo(at.slice(0, i + 1)))}
                aria-current={last ? "location" : undefined}
                className={cn(
                  "block w-full cursor-pointer rounded-[12px] border bg-pure-white px-3 py-2 text-left",
                  "transition-[border-color,box-shadow] duration-150",
                  last
                    ? "border-deep-green ring-1 ring-deep-green"
                    : "border-border-gray hover:border-border-strong",
                )}
              >
                <KindLabel kind={n.kind} />
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink",
                      n.unit && "font-mono",
                    )}
                  >
                    {n.title}
                  </span>
                  <StateChip state={n.state} alarm={n.alarm} />
                </span>
              </motion.a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LevelHeader({ members, parent }: { members: Node[]; parent: Node | null }) {
  const { RUN } = useMap();
  const layer = LAYER_NAME[layerOf(members[0]?.kind)];
  return (
    <div className="pb-2 pt-4">
      <p className="font-mono text-[9px] uppercase leading-none tracking-[0.09em] text-faint">
        {layer}
      </p>
      <p className="mt-1.5 truncate text-[11.5px] text-on-surface-variant">
        {parent ? (
          <>
            in <span className="font-semibold text-ink">{parent.title}</span>
          </>
        ) : (
          RUN.repo
        )}
      </p>
    </div>
  );
}
