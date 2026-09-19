"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, type RowCtx } from "@/components/anatomy";
import { StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { E0, L0, LINKS, allNodes, levelAt, nodeAt } from "@/lib/taxbuddy";
import type { Edge, Node } from "@/lib/data";

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
  // The path SERPENTINES rather than running flat. Seven steps in one row is
  // 3220px wide, and since the overview fits the whole board to the viewport,
  // that opens at ~0.4 on a laptop — every card too small to read. Wrapping
  // brings the board to 1740x697, which opens at ~0.83. Width is not free
  // here: it is paid for in legibility, and the 4/3 split below is already
  // one column wider than the old six-step board's 1280x697 (which opened at
  // 1.00). A third row would buy back that scale and cost a second reversal
  // to follow, which reads worse than slightly smaller cards.
  //
  // Row 1, left to right. Four steps here rather than three: the filer's path
  // is seven steps, and 7 x 460 is 3220px — well past the width that forced
  // the wrap in the first place. 4/3 splits it more evenly than 3/4 and keeps
  // the turn under `reading`, which is the widest thing on the board.
  consent: { x: 0, y: 80, w: 360 },
  eligibility: { x: 460, y: 80, w: 360 },
  "income-docs": { x: 920, y: 80, w: 360 },
  extraction: { x: 1380, y: 80, w: 360 },
  // Row 2 reads RIGHT TO LEFT, continuing the spine: extraction drops to
  // identity directly below it, then the flow runs back leftward. The order
  // here is what keeps the sequence unbroken across the wrap — the enlarged
  // arrowheads are what keep the reversal readable.
  identity: { x: 1380, y: 310, w: 360 },
  engine: { x: 920, y: 310, w: 360 },
  packet: { x: 460, y: 310, w: 360 },

  // ⚠ NOT on the path, and its POSITION has to say so.
  //
  // This card used to sit at x:0,y:310 — the empty slot left by the row-2 turn.
  // That is precisely where the eye expects the step AFTER `packet`, because
  // row 2 reads right-to-left and x:0 is where it lands. The serpentine, not
  // E0, is what a reader follows, so an unconnected card parked at the end of
  // it reads as the next step no matter how few edges touch it. Giving it its
  // own tier below the spine is the fix: nothing continues leftward past
  // `packet`, and this sits under the board as the separate front door it is.
  "refund-check": { x: 0, y: 560, w: 440 },

  // BOTTOM TIER — not a step. Every root above writes here, and when a store
  // sits at the END of a path those edges have to span the whole board and cut
  // through whatever card is in the way. Underneath instead, every writer drops
  // a short distance into it. Wider because the subtitle carries four facts.
  store: { x: 700, y: 560, w: 440 },
  // The hole sits directly under the store whose stage column it describes.
  // Widened to match: a card whose own title truncates is the wrong way to
  // show an absence.
  unreachable: { x: 700, y: 740, w: 440 },
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
// Widest a single open level can get, measured over every node in the tree
// rather than a fixed two. A branch four deep unfolds one level at a time, so
// the widest level anywhere is still the bound that matters.
const WIDEST_OPEN = Math.max(
  0,
  ...allNodes().map((n) => {
    const k = n.children?.length ?? 0;
    return k ? CHILD_PL + k * CHILD_W + (k - 1) * CHILD_GAP : 0;
  }),
);
const WORLD = {
  w: Math.max(...L0.map((n) => worldPos(n).x)) + WIDEST_OPEN + 160,
  h: Math.max(...L0.map((n) => worldPos(n).y)) + CARD_H + OPEN_CHILD_H + 160,
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

  /**
   * The open path, root-first. `[]` is the overview, `["generating"]` has one
   * subsystem open, `["generating","gen-parallel","gen-callb"]` is three deep.
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
      // Frame the card AND the level it is about to spawn. Centring on the
      // title card alone parked the camera on a 304px box while ~1200px of
      // content unfolded to its right.
      // Clamped at one column: a node opened from a row has no children, and
      // the fan-out formula with members=0 yields -116px — a negative box the
      // camera would aim at the wrong place entirely.
      const w =
        CHILD_PL + Math.max(1, members) * CHILD_W + Math.max(0, members - 1) * CHILD_GAP;
      // Real opened height, not a per-member estimate: an expanded schema card
      // runs ~410px, so a 84 + n*62 guess centred well above the content.
      const h = CARD_H + CHILD_GAP + OPEN_CHILD_H;
      frame({ x: p.x, y: p.y, w, h });
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
      // lastIndexOf, NOT indexOf. A row that lives inside another row's `under`
      // gets an id with two colons — `eng-path:2:not expired`, whose owner is
      // `eng-path:2`, not `eng-path`. Taking the FIRST colon resolved the owner
      // one level too shallow, so nodeAt found nothing and the click was a
      // silent no-op: the row lit on hover and the level never opened. Nothing
      // in the fixture nested `under` inside `under` until the taxBuddy pass,
      // which is why this survived.
      const owner = id.slice(0, id.lastIndexOf(":"));
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
        />

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
              className="absolute flex flex-col gap-2"
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
              />
            </motion.div>
          );
        })}

      </motion.div>
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
}: {
  node: Node;
  at: string[];
  path: string[];
  anchor: (id: string) => (el: HTMLElement | null) => void;
  rowCtx: RowCtx;
  inert?: boolean;
  onOpen: (node: Node, parentPath: string[]) => void;
  onClose: () => void;
}) {
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

  return (
    <>
      <NodeCard
        node={node}
        ref={anchor(node.id)}
        compact={!root}
        inert={inert}
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
            ? () => (showChildren ? onClose() : onOpen(node, at))
            : undefined
        }
      />

      <AnimatePresence>
        {showChildren ? (
          <motion.div
            // A level lays out in columns, not one stack. A single 380px column
            // runs off the bottom of the viewport and wastes the whole width of
            // the canvas; side-by-side keeps a level readable in one screenful.
            // The gutter is also where the FK wires run, and it has to be wide
            // enough that every wire crossing it gets its own vertical track.
            className="flex items-start gap-[140px] pl-6"
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
                className="flex flex-col gap-2"
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
                />
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
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
      data-node-id={node.id}
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
