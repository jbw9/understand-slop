"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, type RowCtx } from "@/components/anatomy";
import { StateChip } from "@/components/state";
import { EditsProvider } from "@/components/edits";
import { KindLabel, UnitBody, UnitHead } from "@/components/card";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { E0, L0, LINKS, allNodes, levelAt, nodeAt } from "@/lib/visulearn";
import { isFlowLevel, layerOf, type Edge, type Node } from "@/lib/data";

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

/** Breathing room above a top-anchored card, so it doesn't touch the edge. */
const TOP_GUTTER = 72;

/** The one spring every deliberate camera move rides on. */
const GLIDE = { type: "spring", stiffness: 210, damping: 32, mass: 0.9 } as const;

/** Comfortable reading band. Drilling nudges into this and no further. */
const READ_MIN = 0.75;
const READ_MAX = 1.05;

const CARD_W = 380;
/**
 * The overview sat at 0.8 with a fixed offset, which parked the whole diagram
 * in the upper-left and left the bottom and right of the canvas dead. Scale 1
 * reads the cards at their designed size, and the offset is computed at mount
 * from the real content bounds instead of guessed — see `overviewView`.
 */
const OVERVIEW = { scale: 1, x: 80, y: 60 };

/**
 * Open-domain metrics. The camera has to frame content that does not exist yet
 * at the moment of the click, so these mirror the capability row's real layout
 * — `w-[340px]` children, `gap-[140px]`, `pl-6` (24px) — and are used both to
 * size the world box and to aim the drill.
 */
const CHILD_W = 340;

/**
 * The gutter is a wire corridor, not a margin. Six foreign keys run between
 * these cards and three of them shared one 45px channel, which is what turned
 * distinct relationships into a single bundle that doubled back on itself.
 * Sized to hold several lanes at the 26px pitch the wire layer spreads them
 * by, plus clearance at each card edge. Users can zoom, so width is cheap.
 */
const CHILD_GAP = 140;
/**
 * The same corridor, turned on its side, for a level that lays out as a flow.
 *
 * Smaller than CHILD_GAP on purpose. 140px horizontally buys several parallel
 * lanes, because the FK wires between two cards in a level all cross the same
 * gutter and each needs its own vertical track. Stacked vertically the edges
 * are a sequence — one per gap — so the space only has to clear the card, the
 * arrowhead and a label.
 */
const CHILD_VGAP = 90;
const CHILD_PL = 24;
const CARD_H = 57;
/** Tallest expanded capability card, measured from the rendered DB domain. */
const OPEN_CHILD_H = 410;

/**
 * Hand-placed layout, read top-to-bottom as a learner moves across the
 * surface: they type into the chat box, watch the answer, and the conversation
 * is kept and can be shared. What the surface writes lands in the store off to
 * the side.
 *
 * Deliberately NOT a uniform grid. An even col*W, row*H lattice reads as a
 * spreadsheet — every card the same size at the same pitch says nothing about
 * what matters or what depends on what. Real architecture diagrams vary tier
 * width, stagger cards off each other's baseline, and give the busy tiers more
 * room. The irregularity is the information.
 */
/**
 * Where the rule between the spine and the tier stands: the middle of the
 * 160px gutter between the spine's right edge (800) and the tier's left (960).
 */
const TIER_RULE_X = 880;

const PLACE: Record<string, { x: number; y: number; w?: number }> = {
  // The journey runs DOWN, one column, read top to bottom — a spine spends
  // height instead of width, and width is what binds when the overview fits
  // the board to the viewport. The ask → gate → generate sequence that used to
  // fill this column now lives inside the chat box, one level down.
  "chat-box": { x: 440, y: 0, w: 360 },
  // THE FORK, and it is in the data: the chat box has two edges out, not one
  // next step. The answer streams to the screen AND is saved, and only the
  // saving continues to sharing. Drawn in the column, `watching` would sit
  // between the chat box and `keeping` and their wire would have to cross it.
  watching: { x: 0, y: 150, w: 360 },
  keeping: { x: 440, y: 150, w: 360 },
  sharing: { x: 440, y: 280, w: 360 },

  // THE SIDE TIER — not surface you walk through, and separated by the rule
  // at x=880 so that reads as a statement rather than as missing wires.
  //
  // Order inside the column is forced by the edges. `infra` is the hole under
  // the store it would define, so it sits directly beneath `tables`; anything
  // between them would turn a short ghost edge into a wire crossing a card.
  // That puts the dashboard above the store, which is where a thing that reads
  // one belongs anyway.
  // Starts below the rule's caption, which stands at the top of the column.
  admin: { x: 960, y: 140, w: 440 },
  // Every writer on the spine drops into this from the side, collected into
  // one lane.
  tables: { x: 960, y: 310, w: 440 },
  // Widened to match the store above it: "Where the tables came from" truncates
  // at 310px, and a card whose own title does not fit is the wrong way to show
  // an absence.
  infra: { x: 960, y: 480, w: 440 },
};

/**
 * Everything a Branch needs to be draggable, bundled the way `RowCtx` is — one
 * prop threaded down a recursive component rather than four.
 */
interface DragCtx {
  /**
   * Where each card has been dragged to, in WORLD units, keyed by node id.
   *
   * A ref, not state: it is written on every frame of a drag, and that in
   * state would re-render the board sixty times a second. Keyed by id rather
   * than held on the element because a child card unmounts when you collapse
   * its level — an offset living on the element would go with it, so reopening
   * a level would snap every card you moved back to where layout put it.
   */
  offsets: RefObject<Map<string, { x: number; y: number }>>;
  /** Re-measure the wires. Called once per frame while a card is dragged. */
  onMove: () => void;
  /** Names the root whose branch is being dragged, so it can lift clear. */
  onLift: (rootId: string | null) => void;
  /** Bumped when `0` sends every card home. */
  homeGen: number;
}

/**
 * Suppress text selection for the life of one press.
 *
 * Motion does this for a draggable itself — but only when it owns the pointer
 * listener, and `dragListener={false}`, which is what keeps the anatomy rows
 * working, opts out of it along with everything else (framer-motion's
 * `useHTMLProps` guards the whole block on it). Without this, a press on a
 * card title drag-selects straight across the board.
 */
function suppressSelection() {
  const restore = () => {
    document.body.style.userSelect = "";
    window.removeEventListener("pointerup", restore);
    window.removeEventListener("pointercancel", restore);
  };
  document.body.style.userSelect = "none";
  window.addEventListener("pointerup", restore);
  window.addEventListener("pointercancel", restore);
}

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
// Widest a single open level can get, measured over every node in the tree
// rather than a fixed two. A branch four deep unfolds one level at a time, so
// the widest level anywhere is still the bound that matters.
const WIDEST_OPEN = Math.max(
  0,
  ...allNodes().map((n) => {
    const k = n.children?.length ?? 0;
    return k && !isFlowLevel(n) ? CHILD_PL + k * CHILD_W + (k - 1) * CHILD_GAP : 0;
  }),
);
/**
 * The same bound on the other axis, for the levels that stack.
 *
 * A flow level is several expanded cards tall where a row is one, so the old
 * single `OPEN_CHILD_H` term undersized the box by about 650px — and an
 * undersized world box is not a cosmetic problem: the SVG is measured from it,
 * so every wire past the edge is clipped away while still being computed
 * perfectly correctly. That is the failure mode the comment above describes,
 * arriving from the other direction.
 */
const TALLEST_OPEN = Math.max(
  0,
  ...allNodes().map((n) => {
    const k = n.children?.length ?? 0;
    return k && isFlowLevel(n) ? k * OPEN_CHILD_H + (k - 1) * CHILD_VGAP : 0;
  }),
);
const WORLD = {
  w: Math.max(...L0.map((n) => worldPos(n).x)) + Math.max(WIDEST_OPEN, CHILD_PL + CHILD_W) + 160,
  h:
    Math.max(...L0.map((n) => worldPos(n).y)) +
    CARD_H +
    CHILD_VGAP +
    Math.max(TALLEST_OPEN, OPEN_CHILD_H) +
    160,
};

/**
 * Bounds of the CLOSED diagram — every domain card at its placed position.
 *
 * The world box above is sized for the widest domain once it is open, which is
 * far larger than the overview ever shows. Centring on the world box is what
 * pinned the diagram to the upper-left with the bottom and right of the canvas
 * dead; the overview has to frame the cards that actually exist at that moment.
 */
const CONTENT = (() => {
  const xs = L0.map((n) => worldPos(n).x);
  const ys = L0.map((n) => worldPos(n).y);
  const right = Math.max(...L0.map((n) => worldPos(n).x + cardWidth(n)));
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: right - Math.min(...xs),
    h: Math.max(...ys) + CARD_H - Math.min(...ys),
  };
})();

/**
 * Centre the closed diagram in the viewport, scaled to fill it with a margin.
 *
 * Capped at 1 so the overview never magnifies past the cards' designed size,
 * and floored so a very small window still gets a readable view rather than a
 * postage stamp.
 */
function overviewView(vp: DOMRect) {
  const margin = 96;
  const fit = Math.min(
    (vp.width - margin * 2) / CONTENT.w,
    (vp.height - margin * 2) / CONTENT.h,
  );
  const scale = Math.min(1, Math.max(MIN_SCALE, fit));
  return {
    scale,
    x: vp.width / 2 - (CONTENT.x + CONTENT.w / 2) * scale,
    y: vp.height / 2 - (CONTENT.y + CONTENT.h / 2) * scale,
  };
}

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const { nodes, anchor, version } = useWireAnchors();

  /** The wire layer's own re-measure, handed over on mount. See WireLayer. */
  const remeasure = useRef<(() => void) | null>(null);
  const onEdit = useCallback(() => remeasure.current?.(), []);

  const offsets = useRef(new Map<string, { x: number; y: number }>());
  /**
   * Bumped by `0` to send every mounted card home. The offsets live in a ref,
   * so something has to tell the cards to read it again — and this is the one
   * moment layout resets, so a single re-render is the whole cost.
   */
  const [homeGen, setHomeGen] = useState(0);
  /** The root whose branch is being dragged, lifted clear of its neighbours. */
  const [lifted, setLifted] = useState<string | null>(null);

  /**
   * The open path, root-first. `[]` is the overview, `["chat-box"]` has one
   * surface open, `["chat-box","generating","gen-parallel"]` is three deep.
   *
   * Depth is the LENGTH of this array, never a separate counter. That is the
   * whole change that removes the ceiling: nothing here knows how deep the
   * tree goes, so a branch can nest as far as it has different things to say.
   */
  const [path, setPath] = useState<string[]>([]);
  const depth = path.length;

  // Plain values, NOT useSpring. `useSpring(80, …)` does not create a settable
  // spring — it creates a value that permanently *follows the number 80* via
  // attachFollow, so every `.set()` was swallowed and re-targeted at the
  // constant. Only `.jump()` (which stops the passive effect) moved the view,
  // which is why panning worked and every drill-in left the camera frozen.
  //
  // These are ordinary values now: `.set()` for raw 1:1 input (wheel, drag),
  // and `animate()` for deliberate camera moves, which is what carries the glide.
  const sx = useMotionValue(OVERVIEW.x);
  const sy = useMotionValue(OVERVIEW.y);
  const ss = useMotionValue(OVERVIEW.scale);

  /** Camera animations currently running, so a new move can cancel them. */
  const flight = useRef<{ stop: () => void }[]>([]);

  /** Ease the camera to a target. Cancels whatever move was in flight. */
  const glideTo = useCallback(
    (x: number, y: number, s: number) => {
      // Cancel whatever move was still running. Two camera animations on one
      // value do NOT resolve to the later target — the first one keeps
      // driving and the second is lost, which is what pinned the vertical
      // offset at a stale value through ten attempts at fixing the deep drill.
      for (const c of flight.current) c.stop();
      flight.current = [
        animate(sx, x, GLIDE),
        animate(sy, y, GLIDE),
        animate(ss, s, GLIDE),
      ];
    },
    [sx, sy, ss],
  );

  // Mirror of the spring's scale, for the wire layer's coordinate maths.
  const [liveScale, setLiveScale] = useState(OVERVIEW.scale);
  useEffect(() => ss.on("change", (v) => setLiveScale(v)), [ss]);

  const transform = useTransform(
    [sx, sy, ss],
    ([x, y, s]: number[]) => `translate3d(${x}px, ${y}px, 0) scale(${s})`,
  );
  const dots = useTransform([sx, sy], ([x, y]: number[]) => `${x}px ${y}px`);

  /**
   * Card drag happens INSIDE the scaled world, so motion has to be told what a
   * screen pixel is worth here.
   *
   * Motion's drag adds a raw pointer delta straight onto the element's own
   * transform (`VisualElementDragControls.updateAxis`), so at 0.5x a card would
   * travel twice as far as the cursor — the same double-scaling the wire layer
   * corrects for when it measures. `transformPagePoint` is the supported hook:
   * PanSession runs every point through it before differencing them into
   * `offset`, and re-runs it each frame, so zooming mid-drag stays correct.
   *
   * Only the SCALE is divided out. `offset` is a difference of two transformed
   * points, so the viewport origin and the pan offsets cancel anyway — leaving
   * them out keeps the drag immune to `sx`/`sy` moving under it.
   */
  const transformPagePoint = useCallback(
    (point: { x: number; y: number }) => {
      const s = ss.get() || 1;
      return { x: point.x / s, y: point.y / s };
    },
    [ss],
  );

  /* ── tracing a row-level chain ────────────────────────────── */

  const [traced, setTraced] = useState<string | null>(null);

  // The deepest path segment, which is a row id when the level below came from
  // a row. Rows and cards are both just nodes now, so there is no second piece
  // of state to keep in step with the path — the path IS the state.
  const rowOpen = path[path.length - 1] ?? "";

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
    // Roots, plus the sibling edges declared by every node on the open path.
    // Each node carries its own children's edges, so this works at any depth
    // without the canvas knowing what a "level" is.
    const edges: Edge[] = [...E0];
    for (let i = 0; i < path.length; i++) {
      edges.push(...(nodeAt(path.slice(0, i + 1))?.edges ?? []));
    }
    const mapped: Wire[] = edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: wireKind(e.state, e.alarm),
      depth: 0,
    }));
    if (depth === 0) return mapped;

    // Foreign keys show as soon as a level is open — an ER map you have to
    // hunt for by clicking rows is not a map. Only FKs whose BOTH ends sit in
    // the currently open level, so nothing dangles off-screen.
    const shown = levelAt(path);
    const capIds = new Set(shown.map((n) => n.id));
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
    // their wires would still be drawn across empty space. In scope is the
    // whole open path plus the level it reveals.
    const inScope = new Set<string>([...path, ...shown.map((n) => n.id)]);
    return [
      ...mapped.filter((w) => inScope.has(w.from) && inScope.has(w.to)),
      ...fks,
    ];
  }, [path, depth, traced, lit]);

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
    (
      box: { x: number; y: number; w: number; h: number },
      anchor: "centre" | "top" = "centre",
    ) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const s = Math.min(READ_MAX, Math.max(READ_MIN, ss.get()));
      // Vertical anchoring is a CHOICE, not always centring.
      //
      // Centring is right for the overview, where the board is wider than it
      // is tall. It is wrong for an opened subtree, which runs 950-1450px
      // against an ~860px viewport: centring a box taller than the screen puts
      // its top AND bottom off the edges. Three separate attempts at fixing
      // the deep drill changed the box being passed here; none of them could
      // have worked, because this line always centred whatever it was given.
      const y =
        anchor === "top"
          ? TOP_GUTTER - box.y * s
          : r.height / 2 - (box.y + box.h / 2) * s;
      glideTo(r.width / 2 - (box.x + box.w / 2) * s, y, s);
    },
    [ss, glideTo],
  );

  /**
   * Open `node`, which sits at `parentPath`. A node with no children is a
   * leaf: clicking it does nothing rather than opening an empty level, so the
   * map never rewards a click with a blank screen.
   */
  const drillInto = useCallback(
    (node: Node, parentPath: string[]) => {
      const members = node.children?.length ?? 0;
      // Nothing to show means nothing to open — but "nothing" is no children
      // AND no anatomy. A node synthesized from a row carries its content in
      // `anatomy` and has no children at all, so a children-only guard made
      // every row click a no-op: the click fired, this returned, and the path
      // never moved. That is the bug you see as "I clicked and nothing opened".
      if (members === 0 && !node.anatomy?.length) return;
      const next = [...parentPath, node.id];
      setPath(next);

      // Frame the ROOT of the open path, because that is the only node whose
      // position is known in world space — everything deeper is laid out by
      // flex flow inside it and has no absolute coordinate to aim at.
      //
      // Measuring the opened card's own rect here does NOT work: drillInto
      // runs inside the click handler, before React has committed setPath, so
      // getBoundingClientRect returns the layout from before the new level
      // exists. That raced the render and lagged the camera by exactly one
      // level. Framing deeper levels has to happen after commit, not here.
      const rootNode = nodeAt([next[0]]);
      if (!rootNode) return;
      const p = worldPos(rootNode);
      // PLACE says where layout PUT the root, which stops being where the root
      // IS the moment it can be dragged: drag a domain 400px right, click it,
      // and the camera glides to the empty square it came from. Every deeper
      // level is framed from a live measurement after commit (the effect
      // below) and needs no correction — this is the one frame in the file
      // computed from a constant, so it is the one that has to be adjusted.
      const off = offsets.current.get(next[0]) ?? { x: 0, y: 0 };
      // Frame the card AND the level it is about to spawn. Centring on the
      // title card alone parked the camera on a 304px box while ~1200px of
      // content unfolded to its right.
      // Clamped at one column: a node opened from a row has no children, and
      // the fan-out formula with members=0 yields -116px — a negative box the
      // camera would aim at the wrong place entirely.
      const k = Math.max(1, members);
      // A flow level stacks, so the box it will occupy is one column wide and
      // several cards tall — the transpose of the row's. Aiming the row's box
      // at a stacked level frames a wide strip of empty canvas beside content
      // that runs off the bottom.
      const stacked = isFlowLevel(node);
      const w = stacked
        ? CHILD_PL + CHILD_W
        : CHILD_PL + k * CHILD_W + Math.max(0, members - 1) * CHILD_GAP;
      // Real opened height, not a per-member estimate: an expanded schema card
      // runs ~410px, so a 84 + n*62 guess centred well above the content.
      const h = stacked
        ? CARD_H + CHILD_VGAP + k * OPEN_CHILD_H + Math.max(0, members - 1) * CHILD_VGAP
        : CARD_H + CHILD_GAP + OPEN_CHILD_H;
      // A stack is read from the top down, so it is anchored there rather than
      // centred. Centring a box taller than the viewport is the failure D8
      // records: half the level ends up above the fold, including the card you
      // just clicked. Same answer the deep-level effect below already reached.
      frame({ x: p.x + off.x, y: p.y + off.y, w, h }, stacked ? "top" : "centre");
    },
    [frame],
  );

  /**
   * Open the level a row owns.
   *
   * A row with `under` was given a real child node at data-build time, under
   * the row's own id — so this is an ordinary drill, and everything that
   * follows from that (camera, Escape, drillOut, out-of-scope fading, the
   * depth rule) is inherited rather than re-implemented. The earlier version
   * of this was a bespoke floating card with its own state and its own wire,
   * which is why it behaved like a different product every time you used it.
   */
  const onOpenRow = useCallback(
    (id: string) => {
      // The row id names its OWNER: `ask-input:image` hangs off `ask-input`.
      // That owner is usually a card in the level on screen, not the deepest
      // node on the path — clicking a row on "What you can send" happens while
      // the path is still just ["asking"]. Appending the row id to `path`
      // therefore looked up ["asking","ask-input:image"], which does not
      // exist, so nodeAt returned null and the click did nothing at all.
      // Truncate at the owner, then append — never just append.
      //
      // Switching between sibling rows is the case that makes this necessary.
      // With `image` open the path is [asking, ask-input, ask-input:image], so
      // the owner is NOT the last segment; appending produced
      // [..., ask-input:image, ask-input, ask-input:pdf] and nodeAt resolved
      // nothing, which is why a second row only opened after clicking out
      // first. Cutting the path back to the owner makes the first open and the
      // switch the same operation.
      const owner = id.slice(0, id.indexOf(":"));
      const ownerAt = path.indexOf(owner);
      const at = ownerAt === -1 ? [...path, owner] : path.slice(0, ownerAt + 1);
      const node = nodeAt([...at, id]);
      if (node) drillInto(node, at);
    },
    [path, drillInto],
  );

  const rowCtx = useMemo<RowCtx>(
    () => ({
      anchor,
      lit,
      tracing: Boolean(traced),
      onTrace: (rid) => setTraced((cur) => (cur === rid ? null : rid)),
      // The row you drilled through stays lit, the way an opened card stays
      // selected — so the level on screen says which row it came from.
      open: rowOpen,
      onOpenRow,
    }),
    [anchor, lit, traced, rowOpen, onOpenRow],
  );

  const dragCtx = useMemo<DragCtx>(
    () => ({
      offsets,
      onMove: () => remeasure.current?.(),
      onLift: setLifted,
      homeGen,
    }),
    [homeGen],
  );

  /**
   * Back out ONE level, not all the way. With unbounded depth, a single
   * Escape that dumps you at the overview from four levels down throws away
   * the navigation you just did; popping keeps the climb symmetric with the
   * descent.
   */
  const drillOut = useCallback(() => {
    setPath((cur) => {
      if (cur.length === 0) return cur;
      const next = cur.slice(0, -1);
      // Only re-centre on the overview once the path is actually empty;
      // otherwise stay framed on the root, which is still open.
      if (next.length === 0) {
        const vp = viewportRef.current;
        const v = vp ? overviewView(vp.getBoundingClientRect()) : OVERVIEW;
        glideTo(v.x, v.y, v.scale);
      }
      return next;
    });
  }, [glideTo]);

  /**
   * Jump straight to a level on the open path, from the layer trail. `i` is
   * the index of the node to land on; -1 is the overview. Goes through
   * `drillInto` so the camera frames it exactly as a click would have.
   */
  const jumpTo = useCallback(
    (i: number) => {
      setTraced(null);
      if (i < 0) {
        setPath([]);
        const vp = viewportRef.current;
        const v = vp ? overviewView(vp.getBoundingClientRect()) : OVERVIEW;
        glideTo(v.x, v.y, v.scale);
        return;
      }
      const node = nodeAt(path.slice(0, i + 1));
      if (node) drillInto(node, path.slice(0, i));
    },
    [path, drillInto, glideTo],
  );

  /**
   * Frame the level that just opened — after React has committed it.
   *
   * `drillInto` cannot do this. It runs inside the click handler, where the
   * only position it can name is the ROOT's, because that is the one node with
   * a world coordinate; everything deeper is laid out by flex flow and does not
   * exist yet at click time. The instrumented trace was unambiguous: every
   * drill framed a box at x:920 regardless of depth, so the camera shifted once
   * between levels 1 and 2 and then sat still for every level below.
   *
   * Here the card is real and measurable. Measuring it against the world box
   * converts its screen rect back into world space, which is the coordinate
   * `frame` speaks.
   */
  useLayoutEffect(() => {
    if (path.length < 2) return;
    const world = worldRef.current;
    const opened = world?.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(path[path.length - 1])}"]`,
    );
    if (!world || !opened) return;
    const node = nodeAt(path);
    const members = node?.children?.length ?? 0;
    // Same rule as drillInto's guard, and missed here the first time: a node
    // opened from a row holds its content in `anatomy` and has no children at
    // all. Bailing on children alone meant the camera never followed a row
    // drill — the level opened at y:578 running to y:1304 against a 900px
    // viewport, so the answer you asked for rendered below the fold.
    if (members === 0 && !node?.anatomy?.length) return;
    const s = ss.get() || 1;
    const wb = world.getBoundingClientRect();
    // Frame the whole SUBTREE, measured — not a box computed from constants.
    //
    // The computed box assumed children unfold rightward by CHILD_W + gaps.
    // They do not: each level indents by CHILD_PL (24px) and grows DOWNWARD,
    // so the real column is ~340px wide and 470-670px tall while the computed
    // box claimed 364-1324 wide and 607 tall. The camera was aiming at a
    // rectangle the content never occupied, which is why levels 3 and 4 sat
    // below the fold no matter what the width term said.
    //
    // The card's parent column already contains the card and everything nested
    // under it, so its rect IS the thing to frame. One measurement, no guesses.
    const col = opened.parentElement ?? opened;
    const cb = col.getBoundingClientRect();
    // Anchoring on the card's own rect instead of the column's was tried and
    // measured: identical tx/ty, identical card position, to the digit. The
    // remaining error is NOT the anchor reference. See D8.
    const ob = opened.getBoundingClientRect();
    // You read a subtree DOWNWARD from the card you just opened, so that card
    // belongs near the top of the screen with its content below it — not at
    // the midpoint of a column that overflows both edges. Fitting the whole
    // column instead would need ~0.6 scale, below the READ_MIN floor, so it
    // would be on screen and unreadable.
    frame(
      {
        x: (cb.left - wb.left) / s,
        y: (ob.top - wb.top) / s,
        w: cb.width / s,
        h: cb.height / s,
      },
      "top",
    );
    // Only when the PATH changes: re-running on every frame identity change
    // would fight the user's own panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.join("/")]);

  // Centre on mount, once the viewport has a real size. Jump rather than set:
  // the opening view should already be correct, not spring into place from the
  // placeholder offset.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const v = overviewView(vp.getBoundingClientRect());
    ss.jump(v.scale);
    sx.jump(v.x);
    sy.jump(v.y);
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
    if (drag.current && !moved.current && depth > 0) drillOut();
    drag.current = null;
    setDragging(false);
  };

  /* ── keyboard ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a card's code is typing, not a shortcut: "0" must not reset
      // the board under the caret, nor Escape pop a level mid-edit.
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,[contenteditable]")) return;
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (e.key === "=" || e.key === "+") zoomAt(cx, cy, 1.25);
      else if (e.key === "-" || e.key === "_") zoomAt(cx, cy, 0.8);
      else if (e.key === "0") {
        // All the way out, however deep you are.
        setTraced(null);
        setPath([]);
        // Layout too. Clearing the record covers cards that are unmounted
        // right now; the generation bump is what eases the mounted ones home.
        offsets.current.clear();
        setHomeGen((g) => g + 1);
        const v = overviewView(r);
        glideTo(v.x, v.y, v.scale);
      } else if (e.key === "Escape") {
        // Unwind one layer at a time: the trace first, then one level.
        if (traced) setTraced(null);
        else drillOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, drillOut, traced, glideTo]);

  return (
    // Scoped to the whole viewport rather than the world, so the correction is
    // in place no matter where a draggable ends up. Nothing else in here uses a
    // motion gesture — the canvas pans with plain pointer handlers — so this
    // only ever reaches the cards.
    <MotionConfig transformPagePoint={transformPagePoint}>
      {/* An edit can grow a card by a line, and nothing else tells the wires
          a card changed size, so every edit re-measures them. */}
      <EditsProvider onChange={onEdit}>
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
              reflowKey={path.join("/")}
              measureRef={remeasure}
            />

            {/* The rule between the spine and the tier beside it.
                Not a node, and it must never become one: obstacles are built
                from the anchor registry, so anything that registers there gets
                routed around. This is chrome the wires are meant to cross. */}
            <TierRule away={depth > 0} />

            {L0.map((node) => {
              const p = worldPos(node);
              // Out of scope: while one branch is open, the other roots leave
              // rather than lingering at low opacity. A dimmed card is still a card
              // competing for the eye — and its wires still cross the one you are
              // reading.
              const outOfScope = depth > 0 && path[0] !== node.id;
              return (
                <motion.div
                  key={node.id}
                  className="absolute"
                  // Kept mounted while out of scope: the anchor stays registered
                  // and nothing reflows, so coming back is a pure fade. Pointer
                  // events go away so an invisible card can't be clicked.
                  style={{
                    left: p.x,
                    top: p.y,
                    // The root card keeps its tier width whether open or not.
                    // Letting it stretch to its children made a one-line title card
                    // span 1100px, which read as a banner rather than a node.
                    width: cardWidth(node),
                    pointerEvents: outOfScope ? "none" : "auto",
                    // Set HERE rather than on the branch wrapper inside: this
                    // element carries `animate={{ scale }}`, and a transform
                    // makes it a stacking context, which would trap any z-index
                    // set below it. Roots are siblings, so without this a card
                    // dragged rightward slides UNDER the one it crosses.
                    zIndex: lifted === node.id ? 30 : undefined,
                  }}
                  animate={{
                    opacity: outOfScope ? 0 : 1,
                    scale: outOfScope ? 0.94 : 1,
                  }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Branch
                    node={node}
                    at={[]}
                    path={path}
                    anchor={anchor}
                    rowCtx={rowCtx}
                    inert={outOfScope}
                    onOpen={drillInto}
                    onClose={drillOut}
                    dragCtx={dragCtx}
                  />
                </motion.div>
              );
            })}

          </motion.div>
        </motion.div>
      </EditsProvider>
      {/* Outside the viewport, so a press on it never starts a pan. */}
      <LayerTrail path={path} onJump={jumpTo} />
    </MotionConfig>
  );
}

const LAYER_NAME = { surface: "surface", flow: "data flow", code: "code" } as const;

/**
 * Where you are, said in layers: the surface you started from, the flow you
 * opened under it, the code under that. The map's depth is not uniform, so
 * the trail is the one place that tells you which kind of level you are on —
 * and every step back up it is one click, rather than one Escape per level.
 */
function LayerTrail({
  path,
  onJump,
}: {
  path: string[];
  onJump: (i: number) => void;
}) {
  const steps = path.map((_, i) => nodeAt(path.slice(0, i + 1)));
  return (
    <nav
      aria-label="Layers"
      className="fixed left-4 top-4 z-40 flex max-w-[calc(100vw-32px)] flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[12px] border border-border-gray bg-pure-white px-3 py-2"
    >
      <Crumb
        layer={path.length ? null : LAYER_NAME.surface}
        title="Overview"
        current={path.length === 0}
        onClick={() => onJump(-1)}
      />
      {steps.map((node, i) =>
        node ? (
          <span key={node.id} className="flex items-center gap-1.5">
            <span aria-hidden className="text-[11px] text-faint">›</span>
            <Crumb
              layer={LAYER_NAME[layerOf(node.kind)]}
              title={node.title}
              mono={!!node.unit}
              current={i === steps.length - 1}
              onClick={() => onJump(i)}
            />
          </span>
        ) : null,
      )}
    </nav>
  );
}

function Crumb({
  layer,
  title,
  mono,
  current,
  onClick,
}: {
  layer: string | null;
  title: string;
  mono?: boolean;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={current}
      aria-current={current ? "location" : undefined}
      className={cn(
        "flex max-w-[220px] items-baseline gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-[background-color,color] duration-150",
        current ? "cursor-default" : "cursor-pointer hover:bg-surface",
      )}
    >
      {layer ? (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.09em] text-faint">
          {layer}
        </span>
      ) : null}
      <span
        className={cn(
          "truncate text-[11.5px]",
          mono && "font-mono",
          current ? "font-semibold text-ink" : "text-on-surface-variant",
        )}
      >
        {title}
      </span>
    </button>
  );
}

/**
 * The line between the spine and the tier beside it.
 *
 * The cards to its right are not surface you walk through: a store, the
 * dashboard that reads it, and the hole where the store's definition should
 * be. They were left unwired
 * once to say exactly that, and it did not say it — a card with no wires reads
 * as unfinished, not as a different kind of thing. A rule and a label say it in
 * the register the rest of the canvas uses, which frees the wires to go back to
 * meaning what they mean everywhere else.
 *
 * Deliberately not a card and not a node. It registers no anchor, so the wire
 * router never sees it — which is right, because the bus is supposed to cross
 * it. That crossing is the point: the tier is separate, and things still flow
 * into it.
 */
function TierRule({ away }: { away: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: TIER_RULE_X, top: 76 }}
      animate={{ opacity: away ? 0 : 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden
    >
      <p className="whitespace-nowrap pl-4 font-mono text-[11.5px] text-faint">
        behind the surface — where it lands, and who watches it
      </p>
      <div className="mt-2 h-[460px] border-l border-dashed border-border-gray" />
    </motion.div>
  );
}

/**
 * One node, and — if it is on the open path — the level beneath it, each of
 * which is another Branch.
 *
 * This is the only part that knows about depth, and all it knows is "am I on
 * the path". Nothing counts levels, so nothing caps them: a branch renders as
 * deep as the data goes. `at` is this node's parent path, so a click can name
 * its own position without the canvas tracking where anything sits.
 */
function Branch({
  node,
  at,
  path,
  anchor,
  rowCtx,
  inert,
  onOpen,
  onClose,
  dragCtx,
}: {
  node: Node;
  at: string[];
  path: string[];
  anchor: (id: string) => (el: HTMLElement | null) => void;
  rowCtx: RowCtx;
  inert?: boolean;
  onOpen: (node: Node, parentPath: string[]) => void;
  onClose: () => void;
  dragCtx: DragCtx;
}) {
  /**
   * Drag is started by hand from the card, never by the wrapper's own listener
   * — `dragListener={false}` below. Anatomy rows are buttons with their own
   * gestures, and a wrapper-wide listener would fight them for every press.
   */
  const controls = useDragControls();
  /**
   * Did this press turn into a drag? Same question the canvas asks itself about
   * panning, and the same answer: a press that moved is not a click. Motion
   * only fires onDragStart past PanSession's 3px threshold, which is the figure
   * the canvas already uses, so neither has to restate it.
   */
  const dragged = useRef(false);
  /** Held under the pointer, so the card lifts off the paper. */
  const [lifted, setLifted] = useState(false);

  /**
   * This branch's drag offset, seeded from the record so a card that was
   * dragged, collapsed and reopened comes back where you left it.
   *
   * Explicit motion values rather than letting drag keep its own: they are the
   * only handle on the offset afterwards, and `0` has to be able to ease it
   * back to zero.
   */
  const saved = dragCtx.offsets.current.get(node.id);
  const ox = useMotionValue(saved?.x ?? 0);
  const oy = useMotionValue(saved?.y ?? 0);

  const { offsets, onMove, onLift, homeGen } = dragCtx;
  useEffect(() => {
    if (homeGen === 0) return;
    if (ox.get() === 0 && oy.get() === 0) return;
    // Eased, not snapped. Going home is a COMMANDED move, and commanded moves
    // on this canvas ride the spring — the same rule that separates a drill
    // transition from raw wheel input.
    const back = [
      animate(ox, 0, { ...GLIDE, onUpdate: onMove }),
      animate(oy, 0, GLIDE),
    ];
    return () => {
      for (const c of back) c.stop();
    };
  }, [homeGen, ox, oy, onMove]);

  const here = [...at, node.id];
  // Am I on the open path at all?
  const onPath = here.every((id, i) => path[i] === id);
  // The child of mine that the path continues into, if any.
  const openChildId = onPath ? path[here.length] : undefined;

  /* Row children are shown ONE at a time; authored children are shown together.
     The two kinds of level mean different things. Authored siblings — "What you
     can send" beside "Subject and mode" — are a set you are meant to compare,
     so all of them appear. Row children are answers to six separate questions
     ("what happens to an image", "…to a PDF"), and you asked one. Rendering the
     other five is exactly the wall of context this tool exists to delete: one
     click produced six cards, the sixth sliced off the edge of the screen.

     So a row child appears only when the path names it. */
  const members = (node.children ?? []).filter(
    (c) => !c.fromRow || c.id === openChildId,
  );
  /** The level below me came from one of my own rows, not from authored children. */
  const rowOpened = members.some((c) => c.fromRow && c.id === openChildId);
  // The path has reached me, so my children are the level on screen.
  //
  // `>=`, not `>`. At equality I am the node that was just clicked and my
  // children are exactly what should appear; beyond it, one of my children is
  // itself open and renders its own subtree below. A strict `>` here meant the
  // deepest node on the path — always the one you just clicked — rendered
  // nothing, so every drill-in ended on an empty canvas.
  const showChildren = onPath && path.length >= here.length && members.length > 0;
  // I am the deepest open node — the one being read.
  const isLeafOfPath = onPath && path.length === here.length;
  const root = at.length === 0;
  // My children are a sequence, so the level below me reads downward.
  const isFlow = isFlowLevel(node);

  return (
    /**
     * The drag surface. It wraps the card AND the level below it, so moving a
     * card takes its subtree with it — which is what "move this thing" means
     * when the thing has children hanging off it.
     *
     * It has to be its own element rather than the wrappers at either call
     * site. A child level's entrance variant animates `y` (-6 -> 0), and `y` is
     * exactly what drag writes: sharing an element would have the level's own
     * arrival animation yank a dragged card back to where layout put it.
     *
     * `flex flex-col gap-2` moves here with it, because this is now the element
     * standing between the card and its children column.
     */
    <motion.div
      className="flex flex-col gap-2"
      drag
      // Direct input is 1:1 and stops when you stop. Momentum would keep the
      // card moving after release, which is the one thing the motion rules on
      // this canvas rule out.
      dragMomentum={false}
      dragListener={false}
      dragControls={controls}
      style={{ x: ox, y: oy, zIndex: lifted ? 30 : undefined }}
      onDragStart={() => {
        dragged.current = true;
        setLifted(true);
        // Roots are siblings of each other and so are the cards in a level;
        // either way the one under the pointer belongs on top. The root's own
        // wrapper is a stacking context, so it has to be told.
        onLift(at[0] ?? node.id);
      }}
      // Dragging writes a transform straight to the DOM, so nothing that the
      // wire layer listens for fires. Both ends of this are already throttled
      // to one call per frame — motion's onDrag, and bump's rAF — so this costs
      // one re-measure per frame, the same as panning already does.
      onDrag={() => {
        offsets.current.set(node.id, { x: ox.get(), y: oy.get() });
        onMove();
      }}
      onDragEnd={() => {
        setLifted(false);
        onLift(null);
      }}
    >
      <NodeCard
        node={node}
        ref={anchor(node.id)}
        compact={!root}
        inert={inert}
        lifted={lifted}
        selected={isLeafOfPath}
        // Anatomy shows on the node you have actually opened to, and on the
        // cards of the level you are looking at — not on every ancestor, which
        // would stack four expanded cards down the screen at once.
        //
        // A card whose open child came from one of its own rows keeps showing
        // its anatomy: those rows ARE the menu you chose from, and hiding them
        // would mean backing out a level just to read the next one. The row you
        // picked stays lit, so the list doubles as your position marker.
        detail={!root && (!showChildren || rowOpened)}
        ctx={rowCtx}
        // Openable is judged on the AUTHORED children, not the filtered ones.
        // `members` hides unopened row children, so a card whose only children
        // came from its rows would look childless and lose its click handler —
        // you could open it and then not close it again.
        onClick={
          (node.children?.length ?? 0) > 0
            ? () => {
                // A press that turned into a drag is not a click. Without this
                // every drag would also toggle the level it landed on.
                if (dragged.current) return;
                if (showChildren) onClose();
                else onOpen(node, at);
              }
            : undefined
        }
        // Not on the wrapper: a wrapper-wide listener would start a drag from
        // anywhere inside the card, including the anatomy rows, which own their
        // own press. Childless cards get this too — they still drag.
        onPointerDown={(e) => {
          // Cleared for EVERY press, including one that lands on a row and
          // starts no drag. Left set, a stale flag from the last drag would
          // swallow the next genuine click on this card.
          dragged.current = false;
          // Rows own their press — and so does a code block. `source` renders
          // verbatim lines you are meant to be able to select and copy, and a
          // drag starting there would take the card instead of the text.
          if ((e.target as HTMLElement).closest("[data-row],[data-copy]")) return;
          suppressSelection();
          controls.start(e);
        }}
      />

      <AnimatePresence>
        {showChildren ? (
          <motion.div
            // A level lays out one of two ways, and which one is a fact about
            // the level rather than a house style. A level that carries `edges`
            // is a SEQUENCE, so it reads downward, the same direction as the
            // spine it hangs off. A level without them is a set you are meant
            // to compare — "What you can send" beside "Subject and mode" — and
            // those sit side by side, where the eye can hold both at once.
            //
            // The row is still the default and still the common case: five of
            // the nine levels in this tree declare no edges. Its gutter is also
            // where the FK wires run, which is why it is as wide as it is.
            //
            // The gap is an inline style, not a Tailwind class: it has to come
            // from the same constant the camera and the world box size
            // themselves from, and `gap-[${CHILD_GAP}px]` would not survive the
            // class scanner — Tailwind reads source text, so a computed class
            // name produces no CSS at all.
            className={cn("items-start pl-6", isFlow ? "flex flex-col" : "flex")}
            style={{ gap: isFlow ? CHILD_VGAP : CHILD_GAP }}
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
                  // Rises and settles rather than appearing. Scale stays subtle
                  // — this reads as the card arriving, not as the camera
                  // moving, which the spring is already doing.
                  out: { opacity: 0, y: -6, scale: 0.97 },
                  in: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: CHILD_W }}
              >
                <Branch
                  node={child}
                  at={here}
                  path={path}
                  anchor={anchor}
                  rowCtx={rowCtx}
                  onOpen={onOpen}
                  onClose={onClose}
                  dragCtx={dragCtx}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function NodeCard({
  node,
  ref,
  compact,
  inert,
  lifted,
  selected,
  detail,
  ctx,
  onClick,
  onPointerDown,
}: {
  node: Node;
  ref: (el: HTMLElement | null) => void;
  compact?: boolean;
  /** Out of scope: the wrapper fades it, so the card just drops its affordances. */
  inert?: boolean;
  /** Held under the pointer right now. */
  lifted?: boolean;
  selected?: boolean;
  detail?: boolean;
  /** Row anchoring and trace state, threaded down to the anatomy rows. */
  ctx?: RowCtx;
  onClick?: () => void;
  /** Hands the press to the drag controls, unless it landed on a row. */
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  // Always a div, never a button. Anatomy rows are themselves buttons, and the
  // HTML parser refuses to nest interactive elements — it reparents the inner
  // ones out of the card, which detaches every wire anchor inside it. The card
  // takes its click via role/keyboard instead.
  return (
    <div
      ref={ref as never}
      data-node
      data-node-id={node.id}
      // Out of scope, and the wire layer needs to know. A faded root stays
      // mounted so its anchor survives, but it is not on the screen any more
      // and must not push wires around: the spine's roots sit in exactly the
      // column an open level unfolds into, so routing around them sends every
      // wire in that level on a detour around something nobody can see.
      data-away={inert ? "" : undefined}
      onClick={onClick}
      onPointerDown={inert ? undefined : onPointerDown}
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
        // The card itself is the handle. Transform is deliberately absent from
        // the transition list above and must stay that way: the drag writes one
        // every frame, and animating it would lag the card behind the pointer.
        !inert && "cursor-grab active:cursor-grabbing",
        // The one place this canvas earns a real shadow. Everything else sits
        // ON the paper and is separated by cream against white; a card held
        // under the pointer is literally off it, which is what `--shadow-lift`
        // was defined for and never used on. `box-shadow` is already in the
        // transition list above, so it eases in.
        lifted && "shadow-lift",
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
      <KindLabel kind={node.kind} />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] text-ink",
            // A code unit is named by its identifier, so it reads in mono like
            // every other thing on the board that names code.
            node.unit && "font-mono",
            compact ? "text-[12.5px]" : "text-[15px]",
          )}
        >
          {node.title}
        </span>
        <StateChip state={node.state} alarm={node.alarm} />
      </div>
      {node.unit ? (
        // The signature stands where the sub line would. It is the part of a
        // function a caller depends on, so it is edited where it reads; the
        // body is edited below, in the expanded card.
        <UnitHead id={node.id} unit={node.unit} />
      ) : (
        <p
          className={cn(
            "mt-0.5 truncate font-mono text-faint",
            compact ? "text-[10px]" : "text-[11.5px]",
          )}
        >
          {node.sub}
        </p>
      )}
      <AnimatePresence initial={false}>
        {detail && (node.detail || node.anatomy || node.unit) ? (
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
              {node.unit ? (
                <div className={cn(node.detail && "mt-2.5")}>
                  <UnitBody id={node.id} unit={node.unit} />
                </div>
              ) : null}
              {node.anatomy && ctx ? (
                <div className={cn((node.detail || node.unit) && "mt-2.5")}>
                  <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} />
                </div>
              ) : null}
              {/* Provenance, always. A claim with no location is the failure
                  mode this tool exists to avoid. */}
              {/* A code unit's location is already in its header. */}
              {node.evidence && !node.unit ? (
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
