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
export const STROKE: Record<WireKind, string> = {
  derived: "var(--color-deep-green)",
  partial: "var(--color-amber-ink)",
  alarm: "var(--color-clay-ink)",
  inferred: "var(--color-muted-slate)",
};

export const DASHED: Record<WireKind, string | undefined> = {
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

/** A card the wires have to route around, in world coordinates. */
interface Obstacle {
  el: HTMLElement;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A rounded orthogonal path through a list of corners.
 *
 * The three-segment wires build their own strings inline, which is readable
 * because each has exactly one corner pair and a tip to place. A detour has
 * four corners, and that is where a hand-written path string stops being
 * something anyone can check by eye.
 *
 * The radius shrinks to fit the shorter of the two segments meeting at a
 * corner, so a tight jog rounds as much as it can rather than drawing its
 * curve past the turn.
 */
function roundedPath(pts: { x: number; y: number }[], r: number) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    // Which way the path ARRIVES at this corner decides which coordinate the
    // approach backs off along, and which one the departure advances along.
    const arrivesH = Math.abs(p.y - a.y) < 0.5;
    const inLen = arrivesH ? Math.abs(p.x - a.x) : Math.abs(p.y - a.y);
    const outLen = arrivesH ? Math.abs(b.y - p.y) : Math.abs(b.x - p.x);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const sx = arrivesH ? p.x - Math.sign(p.x - a.x) * rr : p.x;
    const sy = arrivesH ? p.y : p.y - Math.sign(p.y - a.y) * rr;
    const ex = arrivesH ? p.x : p.x + Math.sign(b.x - p.x) * rr;
    const ey = arrivesH ? p.y + Math.sign(b.y - p.y) * rr : p.y;
    d += ` L ${sx} ${sy} Q ${p.x} ${p.y} ${ex} ${ey}`;
  }
  const end = pts[pts.length - 1];
  return `${d} L ${end.x} ${end.y}`;
}

/**
 * Where a dead-straight run has to step aside, or null if it is clear.
 *
 * Two endpoints that share an axis used to short-circuit to one segment, which
 * is right only when nothing stands between them. In a level that STACKS, that
 * is precisely when something does: a sequence whose edge skips a card —
 * `gen-prompt -> gen-parallel` over `gen-cache` — shares the column's centre
 * line with the card it has to miss, so the straight run is drawn through it.
 *
 * The corridor-settling loops above cannot catch this. They move the turn
 * along the routing axis, and a run with no turn has nothing for them to move.
 *
 * Returns the offset axis to detour onto and the span to hold it over, chosen
 * from the UNION of everything blocking — one detour around all of them, not a
 * weave between them.
 */
function blockedRun(
  axis: number,
  from: number,
  to: number,
  boxes: Obstacle[],
  vertical: boolean,
  clear: number,
) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let ahead = Infinity;
  let behind = -Infinity;
  let nearSide = Infinity;
  let farSide = -Infinity;
  for (const box of boxes) {
    const alongLo = vertical ? box.top : box.left;
    const alongHi = vertical ? box.bottom : box.right;
    const acrossLo = vertical ? box.left : box.top;
    const acrossHi = vertical ? box.right : box.bottom;
    // Not in the span, or not on the line: not in the way.
    if (alongHi < lo + 1 || alongLo > hi - 1) continue;
    if (axis <= acrossLo - clear || axis >= acrossHi + clear) continue;
    ahead = Math.min(ahead, alongLo - clear);
    behind = Math.max(behind, alongHi + clear);
    nearSide = Math.min(nearSide, acrossLo - clear);
    farSide = Math.max(farSide, acrossHi + clear);
  }
  if (behind === -Infinity) return null;
  // Round whichever side is the shorter way past the blockage.
  const side = Math.abs(axis - nearSide) <= Math.abs(axis - farSide) ? nearSide : farSide;
  // In TRAVEL order, which is not span order: a run going up meets the
  // blocker's lower edge first. And never step aside before the run starts or
  // rejoin after it ends, or the detour draws a stub out of a card's far side.
  const dir = to >= from ? 1 : -1;
  return {
    side,
    leave: dir > 0 ? Math.max(ahead, from) : Math.min(behind, from),
    rejoin: dir > 0 ? Math.min(behind, to) : Math.max(ahead, to),
  };
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
  measureRef,
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
  /**
   * Filled with this layer's own rAF-coalesced re-measure, for a caller that
   * moves a node without remounting it. See the assignment below.
   */
  measureRef?: RefObject<(() => void) | null>;
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
    // Fan-in lanes for PLAIN card wires. Five edges arriving at one card all
    // aimed at its centre, which stacked them into a single thick smear at the
    // landing point. Grouping by target lets each arrival get its own offset
    // along the target's edge, so five separate facts read as five wires.
    const fanKey: string[] = wires.map((wire) =>
      wire.relation ? "" : `to:${wire.to}`,
    );
    const fanLane = assignLanes(fanKey);
    const fanSize = new Map<string, number>();
    for (const k of fanKey) if (k) fanSize.set(k, (fanSize.get(k) ?? 0) + 1);

    // Where each fan's writers sit, as a GROUP.
    //
    // A bus has to pick an axis, and one wire's own geometry is the wrong
    // thing to ask. Four writers stacked in a column with the target off to
    // their side are a sideways convergence, including the one writer that
    // happens to sit level with the target — asked individually, that one
    // would answer "below me" and route itself out of the bundle.
    const fanHub = new Map<
      string,
      { x: number; y: number; n: number; minX: number; maxX: number; left: number; right: number }
    >();
    for (const [i, wire] of wires.entries()) {
      const key = fanKey[i];
      if (!key) continue;
      const el = nodes.current?.get(wire.from);
      if (!el) continue;
      const r = cardOf(el).getBoundingClientRect();
      const cx = ((r.left + r.right) / 2 - base.left) / k;
      const cy = ((r.top + r.bottom) / 2 - base.top) / k;
      const at = fanHub.get(key) ?? {
        x: 0,
        y: 0,
        n: 0,
        minX: Infinity,
        maxX: -Infinity,
        left: Infinity,
        right: -Infinity,
      };
      at.x += cx;
      at.y += cy;
      at.n += 1;
      at.minX = Math.min(at.minX, cx);
      at.maxX = Math.max(at.maxX, cx);
      at.left = Math.min(at.left, (r.left - base.left) / k);
      at.right = Math.max(at.right, (r.right - base.left) / k);
      fanHub.set(key, at);
    }

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

    // Every card on screen, in world space. A wire has to route around the
    // boxes it does not connect, not just the two it does — that is the whole
    // difference between a diagram and a bowl of spaghetti.
    // Keyed by the card ELEMENT, because a wire has to be able to recognise
    // its own endpoints here. The boxes are fresh objects built per pass, so
    // an identity test against the wire's A/B boxes can never match — it
    // silently made every wire dodge its own source and target, and since the
    // last matching blocker wins, the target routinely undid the avoidance
    // that a genuine obstacle had just applied.
    const obstacles = [...(nodes.current?.values() ?? [])].flatMap((el) => {
      const rc = (el.closest("[data-node]") as HTMLElement | null) ?? el;
      // A card that has faded out is not on the screen, so it is not in the
      // way. It is still mounted — that is what keeps its anchor registered —
      // and on a vertical board it sits in precisely the column an open level
      // unfolds into, so leaving it here made every wire in that level detour
      // around a card nobody can see.
      if (rc.hasAttribute("data-away")) return [];
      const box = rc.getBoundingClientRect();
      return {
        el: rc,
        left: (box.left - base.left) / k,
        right: (box.right - base.left) / k,
        top: (box.top - base.top) / k,
        bottom: (box.bottom - base.top) / k,
      };
    });

    const next: Path[] = [];
    for (const [wireAt, wire] of wires.entries()) {
      const a = nodes.current?.get(wire.from);
      const b = nodes.current?.get(wire.to);
      if (!a || !b) continue;
      // The cards this wire actually connects. `a` and `b` may be row anchors
      // rather than cards, and `obstacles` is keyed by card, so both sides have
      // to be resolved the same way for the exclusion to match.
      const cardA = cardOf(a);
      const cardB = cardOf(b);
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

      // Spread arrivals along the target's edge. With n wires landing on one
      // card, offsets run symmetrically about its centre so the bundle
      // straddles the midline instead of piling onto a single point. Capped so
      // a busy target keeps its arrivals inside its own edge.
      const fk = fanKey[wireAt];
      const n = fk ? (fanSize.get(fk) ?? 1) : 1;
      const spread = n > 1 ? Math.min(30, (horizontal ? B.bottom - B.top : B.right - B.left) / (n + 1)) : 0;
      const fan = fk ? fanLane[wireAt] * spread : 0;

      // THE BUS.
      //
      // Five things write to the store. Routed individually they arrived on
      // three different edges of one card — two on the left, two dropping onto
      // the top 40px apart, two stacked on the right 20px apart — plus a long
      // haul crossing the canvas to get there. No per-edge routing fixes that;
      // six arrowheads on one box is six relationships competing for the same
      // landing strip.
      //
      // Infrastructure diagrams solve this with a bus: every writer drops onto
      // one shared lane above the target and the lane enters it once. Five
      // edges then read as one convergence, which is what it actually is.
      if (fk && n >= 3) {
        const busR = 7;
        const hub = fanHub.get(fk);
        const cx = hub ? hub.x / hub.n : ax;
        const cy = hub ? hub.y / hub.n : ay;
        // WHICH WAY THE LANE RUNS.
        //
        // The bus was written when the writers lay across a row and the store
        // sat under them, so the lane was always horizontal. Turn the board on
        // its side and that breaks in a way worth naming: with every writer in
        // one column they share an x, so every one of them drops at the SAME
        // place and the drops stack into a single line running down the spine
        // — directly over the spine's own sequence wires.
        //
        // So the axis is chosen, not assumed, and it is asked of the GROUP.
        // One wire's own geometry is the wrong thing to ask: the writer that
        // happens to sit level with the target would answer "beside me" and
        // route itself out of the bundle.
        //
        // Both conditions have to hold. The target has to be off to one side,
        // AND the writers have to be a column — otherwise the lane would sit
        // past the rightmost of a spread-out group and the ones behind it would
        // run their stubs across each other to reach it. A spread group with a
        // target below it is what the horizontal lane below is already for.
        const column = hub ? hub.maxX - hub.minX < 40 : false;
        const laneDown = column && Math.abs(bx - cx) >= Math.abs(by - cy);

        if (laneDown && hub) {
          const rightward = bx >= cx;
          // Stands 26px off the COLUMN, not off the target — the same 26px the
          // horizontal lane keeps above the box it enters, measured from the
          // other end.
          //
          // Off the target instead would be the obvious transposition and is
          // wrong: it makes every writer's stub as long as the whole gutter, so
          // four parallel lines cross the tier rule where one line should.
          const laneX = rightward ? hub.right + 26 : hub.left - 26;
          const enterY = (B.top + B.bottom) / 2;
          // A writer clear of the lane leaves through its facing side edge. One
          // that overlaps it has no room to run sideways, so it leaves through
          // its nearest horizontal edge — the transpose of the allowance the
          // horizontal lane makes for a writer sharing the target's row.
          const clear = rightward ? A.right <= laneX : A.left >= laneX;
          const startX = clear ? (rightward ? A.right : A.left) : ax;
          const startY = clear ? ay : enterY >= ay ? A.bottom : A.top;
          const outward = laneX >= startX ? 1 : -1;
          const alongDown = enterY >= startY ? 1 : -1;
          const inward = rightward ? 1 : -1;
          const tipX = rightward ? B.left - 3 : B.right + 3;
          const canRound =
            Math.abs(enterY - startY) > busR * 2 + 2 && Math.abs(laneX - startX) > busR * 2 + 2;
          const dd = canRound
            ? `M ${startX} ${startY}` +
              ` H ${laneX - outward * busR}` +
              ` Q ${laneX} ${startY} ${laneX} ${startY + alongDown * busR}` +
              ` V ${enterY - alongDown * busR}` +
              ` Q ${laneX} ${enterY} ${laneX + inward * busR} ${enterY}` +
              ` H ${tipX}`
            : `M ${startX} ${startY} H ${laneX} V ${enterY} H ${tipX}`;
          next.push({ d: dd, kind: wire.kind, depth: wire.depth, x1: startX, y1: startY });
          continue;
        }

        const laneY = B.top - 26;
        const enterX = (B.left + B.right) / 2;
        // Leave the source from whichever vertical edge faces the target, drop
        // to the lane, run along it, and descend once into the target.
        // A writer sitting ABOVE the lane drops out of its bottom edge. One
        // level with the target — admin shares the store's row — has no room
        // to drop, so it leaves from its own top edge and runs up, which drew
        // a stub poking out of the card. Those join the lane from the side
        // instead, at their nearest vertical edge.
        const above = A.bottom <= laneY;
        const startY = above ? A.bottom : A.top;
        const dropX = above ? ax : A.left <= B.right ? A.left : A.right;
        const alongRight = enterX >= dropX ? 1 : -1;
        const canRound = Math.abs(enterX - dropX) > busR * 2 + 2 && Math.abs(laneY - startY) > busR * 2 + 2;
        const dd = canRound
          ? `M ${dropX} ${startY}` +
            ` V ${laneY - busR}` +
            ` Q ${dropX} ${laneY} ${dropX + alongRight * busR} ${laneY}` +
            ` H ${enterX - alongRight * busR}` +
            ` Q ${enterX} ${laneY} ${enterX} ${laneY + busR}` +
            ` V ${B.top - 3}`
          : `M ${dropX} ${startY} V ${laneY} H ${enterX} V ${B.top - 3}`;
        next.push({ d: dd, kind: wire.kind, depth: wire.depth, x1: dropX, y1: startY });
        continue;
      }

      // Orthogonal, not bezier.
      //
      // These are the plain card wires — every edge on the overview. They used
      // to draw as a cubic with a pull of up to 0.45x the distance, which is
      // what sent long links bowing straight through whatever card sat between
      // their endpoints. A curve cannot be told to avoid anything; it goes
      // where its control points send it.
      //
      // Architectural diagrams don't do that. C4, ER, and every Sugiyama-
      // layered renderer route edges as horizontal and vertical runs through
      // the space BETWEEN nodes, because an orthogonal path can be moved off
      // an obstacle one segment at a time while still arriving perpendicular
      // to the box it points at. Same three segments as the FK wires above, so
      // both wire systems read as one language.
      const r = 7;
      const clear = 18; // how far a detour stands off a card it routes around

      /**
       * A run whose endpoints share an axis, drawn straight if it can be and
       * stepped around whatever is in it if it cannot.
       *
       * Closes over this wire's obstacles and its own two cards, because the
       * one thing a wire must never dodge is itself.
       */
      const straightOrDetour = (
        start: { x: number; y: number },
        end: { x: number; y: number },
        vertical: boolean,
      ) => {
        const others = obstacles.filter((box) => box.el !== cardA && box.el !== cardB);
        const hit = blockedRun(
          vertical ? start.x : start.y,
          vertical ? start.y : start.x,
          vertical ? end.y : end.x,
          others,
          vertical,
          clear,
        );
        if (!hit) {
          return vertical
            ? `M ${start.x} ${start.y} V ${end.y}`
            : `M ${start.x} ${start.y} H ${end.x}`;
        }
        const pts = vertical
          ? [
              start,
              { x: start.x, y: hit.leave },
              { x: hit.side, y: hit.leave },
              { x: hit.side, y: hit.rejoin },
              { x: end.x, y: hit.rejoin },
              end,
            ]
          : [
              start,
              { x: hit.leave, y: start.y },
              { x: hit.leave, y: hit.side },
              { x: hit.rejoin, y: hit.side },
              { x: hit.rejoin, y: end.y },
              end,
            ];
        return roundedPath(pts, r);
      };

      if (horizontal) {
        const rightward = bx > ax;
        x1 = rightward ? A.right : A.left;
        y1 = ay;
        x2 = rightward ? B.left : B.right;
        y2 = by + fan;
        const dir = rightward ? 1 : -1;
        const tip = x2 - dir * 3;

        // The corridor this wire turns in. Start at the midpoint of the gap,
        // then walk it clear of anything standing in the way: a vertical run
        // at `mid` must not cut through a card, or the line crosses content
        // exactly the way the old curve did.
        let mid = (x1 + x2) / 2;
        const top = Math.min(y1, y2);
        const bot = Math.max(y1, y2);
        // Settle rather than sweep once: pushing clear of one card can land
        // the corridor inside the next, and a single pass leaves it there.
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (const box of obstacles) {
            if (box.el === cardA || box.el === cardB) continue;
            if (box.bottom < top - 1 || box.top > bot + 1) continue;
            if (mid > box.left - clear && mid < box.right + clear) {
              // Push the turn to whichever side of the blocker is nearer, but
              // never past the endpoint it has to reach.
              const left = box.left - clear;
              const right = box.right + clear;
              const pick = Math.abs(mid - left) <= Math.abs(mid - right) ? left : right;
              const to = dir > 0 ? Math.min(Math.max(pick, x1 + r), tip - r) : Math.max(Math.min(pick, x1 - r), tip + r);
              if (Math.abs(to - mid) > 0.5) moved = true;
              mid = to;
            }
          }
          if (!moved) break;
        }

        const vSign = y2 > y1 ? 1 : -1;
        const canRound = Math.abs(y2 - y1) > r * 2 + 2 && Math.abs(mid - x1) > r && Math.abs(tip - mid) > r;
        d = canRound
          ? `M ${x1} ${y1} H ${mid - dir * r}` +
            ` Q ${mid} ${y1} ${mid} ${y1 + vSign * r}` +
            ` V ${y2 - vSign * r}` +
            ` Q ${mid} ${y2} ${mid + dir * r} ${y2}` +
            ` H ${tip}`
          : Math.abs(y2 - y1) < 1
            ? straightOrDetour({ x: x1, y: y1 }, { x: tip, y: y2 }, false)
            : `M ${x1} ${y1} H ${mid} V ${y2} H ${tip}`;
      } else {
        const downward = by > ay;
        x1 = ax;
        y1 = downward ? A.bottom : A.top;
        x2 = bx + fan;
        y2 = downward ? B.top : B.bottom;
        const dir = downward ? 1 : -1;
        const tip = y2 - dir * 3;

        let mid = (y1 + y2) / 2;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (const box of obstacles) {
            if (box.el === cardA || box.el === cardB) continue;
            if (box.right < left - 1 || box.left > right + 1) continue;
            if (mid > box.top - clear && mid < box.bottom + clear) {
              const above = box.top - clear;
              const below = box.bottom + clear;
              const pick = Math.abs(mid - above) <= Math.abs(mid - below) ? above : below;
              const to = dir > 0 ? Math.min(Math.max(pick, y1 + r), tip - r) : Math.max(Math.min(pick, y1 - r), tip + r);
              if (Math.abs(to - mid) > 0.5) moved = true;
              mid = to;
            }
          }
          if (!moved) break;
        }

        const hSign = x2 > x1 ? 1 : -1;
        const canRound = Math.abs(x2 - x1) > r * 2 + 2 && Math.abs(mid - y1) > r && Math.abs(tip - mid) > r;
        d = canRound
          ? `M ${x1} ${y1} V ${mid - dir * r}` +
            ` Q ${x1} ${mid} ${x1 + hSign * r} ${mid}` +
            ` H ${x2 - hSign * r}` +
            ` Q ${x2} ${mid} ${x2} ${mid + dir * r}` +
            ` V ${tip}`
          : Math.abs(x2 - x1) < 1
            ? straightOrDetour({ x: x1, y: y1 }, { x: x2, y: tip }, true)
            : `M ${x1} ${y1} V ${mid} H ${x2} V ${tip}`;
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

    // A card dragged by hand moves without remounting: no ref fires, no
    // scroll, no resize, so nothing above hears it. Handing the caller this
    // same schedule keeps the re-measure INSIDE this component — only
    // WireLayer re-renders. Routing it through Canvas state instead (a bumped
    // `version`, or `reflowKey`) re-renders every Branch, NodeCard and
    // AnatomyView on the board sixty times a second to move one card, and
    // nothing here is memoised. Panning costs nothing by comparison: it writes
    // motion values and never touches React state at all.
    if (measureRef) measureRef.current = schedule;

    return () => {
      if (measureRef) measureRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
  }, [canvasRef, measure, measureRef]);

  if (paths.length === 0) return null;

  return (
    <svg
      // `overflow-visible` because an <svg> root clips at its viewport by
      // default, and this one is sized to the world box. A card dragged past
      // that edge renders fine — the world div does not clip — while its wires
      // are silently cut, which is the confusing half of the failure.
      className="pointer-events-none absolute inset-0 z-10 hidden overflow-visible md:block"
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
            // Stroked chevron, not a filled wedge — a solid triangle reads as
            // an arrow bolted onto the wire. But at markerWidth 4 against a
            // 1.5px stroke it was invisible at overview zoom, which left every
            // edge undirected: you could see two cards were related and not
            // which way it ran. Direction is half the information in a flow
            // diagram, so it has to survive a glance.
            markerWidth="7"
            markerHeight="7"
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
