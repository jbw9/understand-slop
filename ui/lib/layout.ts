import { layerOf, type Edge, type Node } from "@/lib/data";

/**
 * Where each root sits on the map, worked out from the data — so any repo's
 * map lays itself out.
 *
 * LINEAR: the surface is one column, read top to bottom in dependency order
 * (a topological sort of the root edges, ties broken by authored order), so
 * the journey reads like a list and most edges point straight down to the
 * next card. An edge that skips cards becomes an arc in the gutter to the
 * LEFT of the column, each in its own lane so arcs never sit on each other.
 * Stores go in a column to the RIGHT, behind a rule, each level with the
 * cards that touch it. Nothing is hard-coded per repo.
 */

export const MAP_CARD_W = 280;
export const MAP_CARD_H = 84;
/** One step down the column: a card, plus room for an arrow and its label. */
export const MAP_STEP = 132;
const LANE_W = 26;
const TIER_GAP = 260;
/** Room left of the arcs for their labels, in px per label character. */
const LABEL_CH = 6.7;

export interface MapLayout {
  at: Record<string, { x: number; y: number }>;
  /** Position of each surface card in the column, top first. */
  index: Record<string, number>;
  /** The gutter lane (0 = nearest the column) of each arc, by `from>to`. */
  lane: Record<string, number>;
  /** Where the rule before the store column stands, if there are stores. */
  tierX: number | null;
  w: number;
  h: number;
}

export const edgeKey = (e: Edge) => `${e.from}>${e.to}`;

export function layoutRoots(roots: Node[], edges: Edge[]): MapLayout {
  const isSide = (n: Node) => layerOf(n.kind) !== "surface";
  const main = roots.filter((n) => !isSide(n));
  const side = roots.filter(isSide);
  const mainIds = new Set(main.map((n) => n.id));

  // Topological order over edges between surface cards. Of the cards ready
  // to place, the earliest authored goes first; a cycle falls back to
  // authored order for whatever is left.
  const inner = edges.filter((e) => mainIds.has(e.from) && mainIds.has(e.to) && e.from !== e.to);
  const indeg = new Map(main.map((n) => [n.id, 0]));
  for (const e of inner) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const order: Node[] = [];
  const left = [...main];
  while (left.length) {
    const k = left.findIndex((n) => (indeg.get(n.id) ?? 0) === 0);
    const [n] = left.splice(k < 0 ? 0 : k, 1);
    order.push(n);
    for (const e of inner) if (e.from === n.id) indeg.set(e.to, (indeg.get(e.to) ?? 0) - 1);
  }
  const index: MapLayout["index"] = {};
  order.forEach((n, i) => (index[n.id] = i));

  // Arcs: surface edges that don't go to the very next card. Shortest spans
  // take the inner lanes, so a short arc is never wrapped around by a long one
  // it doesn't need to cross.
  const arcs = inner
    .filter((e) => index[e.to] !== index[e.from] + 1)
    .map((e) => ({ e, lo: Math.min(index[e.from], index[e.to]), hi: Math.max(index[e.from], index[e.to]) }))
    .sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.lo - b.lo);
  const lanes: { lo: number; hi: number }[][] = [];
  const lane: MapLayout["lane"] = {};
  for (const a of arcs) {
    let l = 0;
    while (lanes[l]?.some((o) => a.lo < o.hi && o.lo < a.hi)) l++;
    (lanes[l] ??= []).push(a);
    lane[edgeKey(a.e)] = l;
  }
  const labelRoom = Math.max(0, ...arcs.map((a) => (a.e.label?.length ?? 0) * LABEL_CH + 16));
  const columnX = arcs.length ? 40 + lanes.length * LANE_W + labelRoom : 0;

  const at: MapLayout["at"] = {};
  order.forEach((n, i) => (at[n.id] = { x: columnX, y: i * MAP_STEP }));

  // Stores sit level with the cards they touch (the mean of their centres),
  // then are pushed apart top to bottom so none overlap.
  const sideX = columnX + MAP_CARD_W + TIER_GAP;
  const want = side.map((n, k) => {
    const ys = edges
      .filter((e) => (e.to === n.id && mainIds.has(e.from)) || (e.from === n.id && mainIds.has(e.to)))
      .map((e) => at[e.to === n.id ? e.from : e.to].y);
    return { n, y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : k * MAP_STEP, k };
  });
  want.sort((a, b) => a.y - b.y || a.k - b.k);
  let floor = -Infinity;
  for (const w of want) {
    const y = Math.max(w.y, floor);
    at[w.n.id] = { x: sideX, y };
    floor = y + MAP_STEP;
  }

  const bottom = Math.max(0, ...Object.values(at).map((p) => p.y)) + MAP_CARD_H;
  return {
    at,
    index,
    lane,
    tierX: side.length ? columnX + MAP_CARD_W + TIER_GAP / 2 : null,
    w: (side.length ? sideX : columnX) + MAP_CARD_W,
    h: bottom,
  };
}

export const MAP_LANE_W = LANE_W;
