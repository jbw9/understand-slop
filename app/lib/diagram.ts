import type { Anatomy, DiagramArrow, DiagramBox } from "@/lib/data";

/**
 * Where everything in a diagram goes, as plain numbers: the component draws
 * it, and `scripts/generate/audit-diagrams.mts` checks every map's diagrams
 * for text drawn over text without opening a browser. Text widths are
 * estimated from character counts, which is close enough at these fixed sizes.
 */

export const BOX_H = 58;
const ROW_GAP = 40;
const COL_GAP = 76;
const PAD = 18;
const LANE_GAP = 12;
/** Two arrows running opposite ways down one column sit this far apart. */
const PAIR_GAP = 7;
const LABEL_CHAR = 6.6;
const LABEL_H = 14;

type Block = Extract<Anatomy, { kind: "diagram" }>;
type Placed = { x: number; y: number; w: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type PlacedBox = Placed & { b: DiagramBox };
export type PlacedArrow = {
  from: string;
  to: string;
  d: string;
  tone: NonNullable<DiagramArrow["tone"]>;
  label?: { text: string; x: number; y: number; anchor: "start" | "middle" | "end" };
};

export function labelRect(l: NonNullable<PlacedArrow["label"]>): Rect {
  const w = l.text.length * LABEL_CHAR;
  const x = l.anchor === "start" ? l.x : l.anchor === "middle" ? l.x - w / 2 : l.x - w;
  return { x, y: l.y - 11, w, h: LABEL_H };
}

export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function layoutDiagram(block: Block) {
  const cols = Math.max(...block.boxes.map((b) => b.col)) + 1;
  const rows = Math.max(...block.boxes.map((b) => b.row)) + 1;
  // Each column is as wide as its longest label.
  const colW = Array.from({ length: cols }, (_, c) =>
    Math.max(
      150,
      ...block.boxes
        .filter((b) => b.col === c)
        .map((b) => Math.max(b.label.length * 8.4, (b.sub?.length ?? 0) * LABEL_CHAR) + 32),
    ),
  );
  // The gap between columns is as wide as the longest straight-across label
  // that has to sit in it; a fixed 76px clipped any label past ten characters
  // under the next box. Elbow labels sit between rows, clear of the boxes, so
  // they need no room here. Capped, so one label cannot push the picture off
  // the page.
  const gap = Math.min(
    260,
    Math.max(
      COL_GAP,
      ...block.arrows.map((a) => {
        const f = block.boxes.find((b) => b.id === a.from);
        const t = block.boxes.find((b) => b.id === a.to);
        if (!a.label || !f || !t || f.col === t.col || f.row !== t.row) return 0;
        return a.label.length * LABEL_CHAR + 28;
      }),
    ),
  );
  const colX = colW.map((_, c) => PAD + colW.slice(0, c).reduce((a, w) => a + w + gap, 0));
  let W = colX[cols - 1] + colW[cols - 1] + PAD;
  let H = PAD * 2 + rows * BOX_H + (rows - 1) * ROW_GAP;
  // Below the bottom row: the way round for a line that has no other, such as
  // one row's last box back to its first, and the picture grows to hold it.
  const under = H - PAD + ROW_GAP / 2;
  const at = new Map<string, PlacedBox>(
    block.boxes.map((b) => [b.id, { x: colX[b.col], y: PAD + b.row * (BOX_H + ROW_GAP), w: colW[b.col], b }]),
  );

  // Arrows between the same two boxes the same way are one line: their labels
  // are joined rather than drawn on the same spot (the overlap a reader
  // reported, "sidebar link" over "post dropdown").
  const merged: (DiagramArrow & { labels: string[] })[] = [];
  for (const a of block.arrows) {
    if (!at.has(a.from) || !at.has(a.to)) continue;
    const same = merged.find((m) => m.from === a.from && m.to === a.to);
    if (same) {
      if (a.label && !same.labels.includes(a.label)) same.labels.push(a.label);
      continue;
    }
    merged.push({ ...a, labels: a.label ? [a.label] : [] });
  }

  const boxRects: Rect[] = [...at.values()].map(({ x, y, w }) => ({ x, y, w, h: BOX_H }));
  // Where a line may run clear of every box: down the middle of each gap
  // between columns, and along the middle of each gap between rows.
  const gx = colX.slice(1).map((x) => x - gap / 2);
  const gy = Array.from({ length: rows - 1 }, (_, r) => PAD + (r + 1) * (BOX_H + ROW_GAP) - ROW_GAP / 2);
  const lanes = laneOffsets(merged, at);
  const drawn: { seg: Rect; from: string; to: string }[] = [];
  const routes = merged.map((a, i) => {
    const f = at.get(a.from)!;
    const t = at.get(a.to)!;
    // A and B in one column, arrows both ways: side by side, not one line.
    const back = f.x === t.x && merged.some((m) => m.from === a.to && m.to === a.from);
    const first = route(f, t, gap, back ? (t.y > f.y ? -PAIR_GAP : PAIR_GAP) : (lanes.get(i) ?? 0));
    // The plain route unless it cuts through a box or runs along another
    // arrow's line; then the cheapest detour that does neither. A fan-out or
    // fan-in sharing its trunk is the bundle reading as one, so it is free.
    const cost = (pts: Pt[], bonus = 0) => {
      const segs = segmentsOf(pts);
      let c = bonus;
      for (const s of segs) {
        c += s.w + s.h + 30;
        for (const b of boxRects) if (overlaps(s, inset(b))) c += 10000;
        for (const o of drawn) if (o.from !== a.from && o.to !== a.to) c += 20 * collinear(s, o.seg);
      }
      return c;
    };
    let best = { pts: first, c: cost(first, -20) };
    for (const pts of detours(f, t, gx, gy)) {
      const c = cost(pts);
      if (c < best.c) best = { pts, c };
    }
    if (segmentsOf(best.pts).some((s) => boxRects.some((b) => overlaps(s, inset(b)))))
      for (const pts of detours(f, t, [], [under])) {
        const c = cost(pts);
        if (c < best.c) [best, H] = [{ pts, c }, under + PAD];
      }
    for (const seg of segmentsOf(best.pts)) drawn.push({ seg, from: a.from, to: a.to });
    return best;
  });

  const arrows: PlacedArrow[] = merged.map((a, i) => ({
    from: a.from,
    to: a.to,
    d: `M${routes[i].pts.map((p) => p.join(" ")).join("L")}`,
    tone: a.tone ?? "plain",
    // Placed below, once every line is down.
    label: a.labels.length ? { text: a.labels.join(" · "), x: 0, y: 0, anchor: "start" as const } : undefined,
  }));

  // A label that lands on a box, another label or another arrow's line
  // moves until it is clear, to the nearest spot still beside its own line.
  const taken: Rect[] = [];
  const W0 = W;
  const runsOf = routes.map((r) => segmentsOf(r.pts));
  arrows.forEach((a, i) => {
    if (!a.label) return;
    const others = drawn.filter((d) => d.from !== a.from || d.to !== a.to).map((d) => d.seg);
    // Text on text or on a box is unreadable; text across a line is drawn
    // with a halo and stays legible, so it is only a mild cost.
    const clashes = (r: Rect) => {
      const room = { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 };
      // Past the right edge widens the picture, which can push it into a
      // scroll that hides the label's end: better on the line's other side.
      const out = (r.y < 0 || r.y + r.h > H || r.x < 0 ? 1000 : 0) + (r.x + r.w + PAD > W0 ? 50 : 0);
      return out + 100 * [...boxRects, ...taken].filter((o) => overlaps(room, o)).length + others.filter((o) => overlaps(room, o)).length;
    };
    // A run another arrow also draws — a fan-in's trunk — names none of them,
    // so a label goes on a run that is this arrow's alone when it can.
    const shared = runsOf[i].map((s) => runsOf.some((rs, j) => j !== i && rs.some((o) => collinear(s, o) > 4)));
    const spots = spotsOn(routes[i].pts, a.label.text.length * LABEL_CHAR, shared);
    let fit = spots[0], least = Infinity;
    for (const s of spots) {
      // Beside a shared run is a last resort: worse than crossing a line.
      const c = clashes(labelRect({ ...a.label, ...s })) + (s.shared ? 5 : 0);
      if (c < least) [fit, least] = [s, c];
      if (!c) break;
    }
    Object.assign(a.label, { x: fit.x, y: fit.y, anchor: fit.anchor });
    const r = labelRect(a.label);
    taken.push(r);
    W = Math.max(W, r.x + r.w + PAD);
  });

  return { W, H, gap, boxes: [...at.values()], boxRects, arrows, labels: taken };
}

type Pt = [number, number];
type Label = { x: number; y: number; anchor: "start" | "middle" | "end"; shared?: boolean };

/** The straight runs of a polyline, as zero-thickness rects. */
export function segmentsOf(pts: Pt[]): Rect[] {
  return pts.slice(1).map(([x, y], i) => {
    const [px, py] = pts[i];
    return { x: Math.min(x, px), y: Math.min(y, py), w: Math.abs(x - px) || 0.1, h: Math.abs(y - py) || 0.1 };
  });
}

const inset = (b: Rect): Rect => ({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 });

/** How far two runs lie along the same line. */
function collinear(a: Rect, b: Rect) {
  const horiz = (r: Rect) => r.h < 1;
  if (horiz(a) !== horiz(b)) return 0;
  if (horiz(a)) return Math.abs(a.y - b.y) < 4 ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) : 0;
  return Math.abs(a.x - b.x) < 4 ? Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
}

/**
 * Every place a label can sit and still read as this line's: beside a run,
 * slid along it or on its other side — never off it, where it would be read
 * as naming whatever line is nearest. Runs no other arrow shares come first,
 * longest first; a short one takes its label at either end, beside the box
 * it leaves or enters, rather than centred over the line it joins.
 */
function spotsOn(pts: Pt[], width: number, shared: boolean[]): Label[] {
  const runs = pts.slice(1).map(([x2, y2], i) => ({ x1: pts[i][0], y1: pts[i][1], x2, y2, len: Math.abs(x2 - pts[i][0]) + Math.abs(y2 - pts[i][1]), shared: Boolean(shared[i]) }));
  return runs
    .sort((a, b) => Number(a.shared) - Number(b.shared) || b.len - a.len)
    .flatMap(({ x1, y1, x2, y2, len, shared }): Label[] => spotsBeside(x1, y1, x2, y2, len, width).map((l) => ({ ...l, shared })));
}

/** Beside one run: slid along it or on its other side. */
function spotsBeside(x1: number, y1: number, x2: number, y2: number, len: number, width: number): Label[] {
  if (x1 === x2) {
    const mid = (y1 + y2) / 2 + 4;
    const room = Math.max(0, len / 2 - 10);
    return [0, -14, 14, -28, 28, -42, 42]
      .filter((d) => Math.abs(d) <= room)
      .flatMap((d): Label[] => [{ x: x1 + 8, y: mid + d, anchor: "start" }, { x: x1 - 8, y: mid + d, anchor: "end" }]);
  }
  const mid = (x1 + x2) / 2;
  const room = Math.max(0, (len - width) / 2);
  const right = x2 > x1;
  const ends: Label[] =
    len < width + 16
      ? [y1 - 6, y1 + 15].flatMap((y): Label[] => [
          { x: x1 + (right ? 4 : -4), y, anchor: right ? "start" : "end" },
          { x: x2 + (right ? -6 : 6), y, anchor: right ? "end" : "start" },
        ])
      : [];
  return [
    ...[0, -30, 30, -60, 60, -90, 90]
      .filter((d) => Math.abs(d) <= room)
      .flatMap((d): Label[] => [{ x: mid + d, y: y1 - 6, anchor: "middle" }, { x: mid + d, y: y1 + 15, anchor: "middle" }]),
    ...ends,
  ];
}

/**
 * The other ways from one box to another: out a side, down a column gap and
 * in a side; or out the top or bottom, along a row gap and in the top or
 * bottom.
 */
function detours(f: Placed, t: Placed, gx: number[], gy: number[]): Pt[][] {
  const out: Pt[][] = [];
  const fy = f.y + BOX_H / 2;
  const ty = t.y + BOX_H / 2;
  for (const g of gx) {
    const x1 = g > f.x ? f.x + f.w : f.x;
    const x2 = g > t.x ? t.x + t.w + 2 : t.x - 2;
    out.push([[x1, fy], [g, fy], [g, ty], [x2, ty]]);
  }
  const fc = f.x + f.w / 2;
  const tc = t.x + t.w / 2;
  if (fc !== tc)
    for (const g of gy) {
      const y1 = g > f.y ? f.y + BOX_H : f.y;
      const y2 = g > t.y ? t.y + BOX_H + 2 : t.y - 2;
      out.push([[fc, y1], [fc, g], [tc, g], [tc, y2]]);
    }
  return out;
}

/**
 * Elbow arrows that run down the same gap between columns would draw on top
 * of each other. A fan-out from one box, or a fan-in to one box, SHOULD share
 * its trunk — that is what makes it read as one bundle — so arrows are
 * grouped into bundles per gap and each bundle gets its own lane.
 */
function laneOffsets(arrows: { from: string; to: string }[], at: Map<string, Placed>) {
  const gaps = new Map<string, { i: number; from: string; to: string }[]>();
  arrows.forEach((a, i) => {
    const f = at.get(a.from);
    const t = at.get(a.to);
    if (!f || !t || f.x === t.x || f.y === t.y) return;
    const key = t.x > f.x ? `r${f.x + f.w}` : `l${f.x}`;
    gaps.set(key, [...(gaps.get(key) ?? []), { i, from: a.from, to: a.to }]);
  });
  const out = new Map<number, number>();
  for (const list of gaps.values()) {
    const count = (k: "from" | "to", v: string) => list.filter((x) => x[k] === v).length;
    const bundleOf = (x: { from: string; to: string }) =>
      count("from", x.from) > 1 ? `f:${x.from}` : count("to", x.to) > 1 ? `t:${x.to}` : `a:${x.from}>${x.to}`;
    const bundles = [...new Set(list.map(bundleOf))];
    for (const x of list) {
      const b = bundles.indexOf(bundleOf(x));
      out.set(x.i, (b - (bundles.length - 1) / 2) * LANE_GAP);
    }
  }
  return out;
}

/**
 * The plain right-angled path between two boxes. Same column: straight down
 * (or up), shifted sideways by `lane`. Otherwise out of the facing side,
 * along the gap between columns, and in.
 */
function route(f: Placed, t: Placed, gap: number, lane = 0): Pt[] {
  const fy = f.y + BOX_H / 2;
  const ty = t.y + BOX_H / 2;
  if (f.x === t.x) {
    const down = t.y > f.y;
    const y1 = down ? f.y + BOX_H : f.y;
    const y2 = down ? t.y - 2 : t.y + BOX_H + 2;
    const cx = f.x + f.w / 2 + lane;
    return [[cx, y1], [cx, y2]];
  }
  const right = t.x > f.x;
  const x1 = right ? f.x + f.w : f.x;
  const x2 = right ? t.x - 2 : t.x + t.w + 2;
  if (fy === ty) return [[x1, fy], [x2, fy]];
  const mx = (right ? x1 + gap / 2 : x1 - gap / 2) + lane;
  return [[x1, fy], [mx, fy], [mx, ty], [x2, ty]];
}
