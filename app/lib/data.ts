/**
 * Fixture for the prototype. No repository is analysed — this is the shape a
 * real `understand-slop map` run would emit for a mid-size SaaS codebase.
 *
 * The map is organised by CONCEPT, not by file. Someone new to a codebase asks
 * "how does billing work" and "what's in the database", not "what's in
 * identity.ts". Files appear only at the bottom, as the evidence for a claim.
 *
 * Every fact carries a state. `derived` is resolved by the TypeScript compiler
 * or read straight out of a migration; `partial` was found but the analysis
 * knows it is incomplete (and says why); `inferred` is a guess from naming or
 * layout and is never presented as fact.
 */

import type { Shape } from "@/lib/view";

export type State = "derived" | "partial" | "inferred";

/* ── anatomy: level 2 renders in the SHAPE of the thing ───────
   A database capability shows columns. An API capability shows routes. A
   pipeline shows ordered steps. One prose paragraph for all three would throw
   away the structure that makes each legible. */

export interface Column {
  name: string;
  type: string;
  key?: "PK" | "FK" | "UQ";
  nullable?: boolean;
  state: State;
  note?: string;
}

export interface Route {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: string;
  state: State;
  note?: string;
}

export interface Step {
  n: number;
  title: string;
  detail: string;
  state: State;
  /** What happens inside this step. Same contract as `Mapping.under`. */
  under?: Anatomy[];
}

export interface Pair {
  label: string;
  value: string;
  state: State;
}

/**
 * The bottom of the map. Real source, quoted verbatim from a real file at a
 * real line — never paraphrased, never reconstructed from memory. `why` is the
 * one place a synthesized explanation is allowed, and it is separated from the
 * code so nobody mistakes the commentary for the thing itself.
 */
export interface Source {
  kind: "source";
  /** Repo-relative path. */
  file: string;
  /** Line number of `code`'s first line, so the gutter tells the truth. */
  start: number;
  /** Verbatim. Leading indentation preserved. */
  code: string;
  /** Why it is this way. Synthesized — rendered as commentary, not as fact. */
  why?: string;
}

/**
 * A quantity worth comparing. `value` is what draws the bar; `display` is what
 * a human reads, because "40 per day, 10 per hour" is the fact and 40 is only
 * the part of it that has a length.
 */
export interface Bar {
  label: string;
  value: number;
  display: string;
  state: State;
  note?: string;
}

/**
 * One slice of a whole. Used where the RATIO is the finding — three prompt
 * blocks whose sizes are the entire reason the split exists read as a bar in
 * one glance and as an essay in three rows.
 */
export interface Part {
  label: string;
  weight: number;
  display: string;
  /** Tints the slice: the thing being contrasted, not decoration. */
  tone?: "hold" | "vary";
  state: State;
}

/** One accepted kind of thing. The label IS the content; no sentence needed. */
export interface Chip {
  label: string;
  note?: string;
  state: State;
}

/** A rewrite rule: what goes in, what comes out. */
export interface Mapping {
  from: string;
  to: string;
  state: State;
  /**
   * What actually happens between `from` and `to`. An arrow is a summary of a
   * path, and for some rows the path is the question — "image → base64 image
   * block" is four stages in three files drawn as one hop.
   *
   * Deliberately `Anatomy[]` and not `Node[]`. A node owns a grid position, a
   * camera frame and a wire anchor; a row that opened one would push the
   * deepest level past the viewport, which is the failure D8 records after
   * twelve attempts. This expands in place instead — the camera never moves,
   * so no framing maths is involved at all.
   *
   * A row with no `under` is a row whose arrow really is the whole fact. Most
   * rows are that, and adding this everywhere would restate the summary one
   * click down, which is the clutter this tool exists to avoid.
   */
  under?: Anatomy[];
}

/** One message in a `sequence`: who asks whom for what, in order. */
export interface Message {
  /** Must be one of the block's `actors`. */
  from: string;
  to: string;
  /** Plain words: "sends the email and a made-up password". */
  label: string;
  note?: string;
  state: State;
}

/**
 * One thing on a screen, top to bottom, read out of the JSX. Not a mock-up: a
 * list of what is there, so a reader knows what the user sees and taps.
 */
export interface ScreenItem {
  type: "heading" | "text" | "field" | "choice" | "button" | "list" | "image";
  label: string;
  /** What happens or what it holds: "must be 8+ characters", "opens RSVP". */
  note?: string;
}

/**
 * A place in the repository behind a node. Read live from disk when the reader
 * opens the code — never pasted — so it is available on EVERY level without
 * the fixture carrying a copy that can drift.
 */
export interface CodeRef {
  file: string;
  /** 1-indexed, inclusive. */
  start: number;
  end: number;
  /** Plain words: what these lines do. */
  label: string;
}

/**
 * Who put this here, when a thing on the map did not come from the code.
 *
 * Deliberately NOT a fourth `State`. `State` is an epistemic claim about how
 * well the analysis knows a fact about the repository — `derived` was resolved
 * by the compiler, `inferred` is a guess from naming. A reader's own note is
 * not a weaker form of those: it is true by a different authority, theirs. A
 * fourth state would make every unmarked thing look like an analysis failure,
 * which is the exact two-tier read D3 exists to prevent, and would put a
 * person's words on the same axis as a compiler's.
 *
 * So provenance is its own axis. A node or block carrying `origin` keeps
 * whatever `state` it has and renders an extra, quieter mark saying where it
 * came from. Code-derived content carries none and is unchanged.
 */
export interface Origin {
  /**
   * `user` wrote it themselves; `claude` drafted it and the user kept it. Both
   * are the reader's responsibility — the difference is who typed it, which is
   * worth saying because one of them can be wrong in a way the reader did not
   * read closely.
   */
  by: "user" | "claude";
  /** ISO 8601, when it was added. */
  at: string;
  /** What the reader asked, where that is what makes the addition make sense. */
  note?: string;
}

/** Something a developer should know before they touch this. */
export interface Issue {
  /** Plain words, a few: "Anyone can delete any account". */
  title: string;
  /** What goes wrong, for whom, and when. One to three sentences. */
  detail: string;
  /** file:line where it happens. */
  where?: string;
}

/**
 * A box in a `diagram`, placed on a grid: `col` left to right, `row` top to
 * bottom, both from 0. The renderer does the geometry, so a figure is authored
 * as WHAT connects to what, never as coordinates.
 */
export interface DiagramBox {
  id: string;
  /** 1-4 words. */
  label: string;
  /** A few words under the label: "row with this id". */
  sub?: string;
  col: number;
  row: number;
  /** `good` = where things end up fine; `warn` = a problem or dead end. */
  tone?: "plain" | "good" | "warn";
  /**
   * The id of the child node this box is part of (D40). The box then opens
   * that part, so the picture is the way down and the list below it is a
   * fallback, not the only route.
   *
   * Boxes outnumber parts — a level draws ~8 boxes and owns ~4 parts — and the
   * two name different things: a box is a thing at runtime (`individual
   * table`), a part is a chapter about it (`Checking Who You Are`). So the
   * link is authored, never matched on the label, and a box with no `opens`
   * stays inert scenery rather than promising a click it cannot honour.
   */
  opens?: string;
}

export interface DiagramArrow {
  from: string;
  to: string;
  /** A few words on the line: "not found", "publishes". */
  label?: string;
  tone?: "plain" | "good" | "warn";
  /**
   * `file:line` where this path happens in the code. Not drawn — the generator
   * must cite one and the checker confirms the line exists, so "every arrow is
   * a real path" (D19) is checked rather than trusted.
   */
  at?: string;
}

export type Anatomy =
  // How the pieces connect — the main picture of a level. Every arrow is a
  // real path in the code (D19); a dead end is drawn `warn`, not left out.
  | { kind: "diagram"; caption: string; boxes: DiagramBox[]; arrows: DiagramArrow[] }
  // The real values, as a table: the categories themselves, the 61 campuses,
  // the fields a form sends. One column is a list.
  | { kind: "table"; caption?: string; columns: string[]; rows: string[][]; state: State }
  // Who talks to whom, in order — phone, Supabase, email, a table.
  | { kind: "sequence"; caption?: string; actors: string[]; rows: Message[] }
  // What the user sees on one screen. `shot` is a real capture of the app
  // (scripts/capture/phone.mjs, sample data), served from app/public — e.g.
  // "/shots/explorify/ce-home.png". With a shot, `items` that carry a `note`
  // become the callouts beside it; without one, `items` are drawn (D37).
  // `device` is what the screen runs on, from the app's own framework: a
  // mobile app's (React Native, Expo, Flutter) is `phone`, a page in a
  // browser is `web`; absent reads as `web`. `route` is the URL path a web
  // screen lives at ("/settings/billing"), never a file path.
  | { kind: "screen"; title: string; caption?: string; shot?: string; device?: "phone" | "web"; route?: string; items: ScreenItem[] }
  // What a stored value looks like. Synthesized and labelled as an example.
  | { kind: "example"; caption: string; value: string; notes?: Pair[] }
  | { kind: "schema"; table: string; rows: Column[]; rel?: string[] }
  | { kind: "routes"; rows: Route[] }
  | { kind: "flow"; rows: Step[] }
  | { kind: "facts"; rows: Pair[] }
  // Measured against each other. A number nobody can compare is just text.
  | { kind: "bars"; unit: string; rows: Bar[] }
  // Measured against the whole.
  | { kind: "parts"; total: string; rows: Part[] }
  // A closed set. Five one-line sentences describing five accepted formats is
  // an essay about a list; the list itself is the fact.
  | { kind: "chips"; caption?: string; rows: Chip[] }
  // in → out. A mapping drawn as a mapping.
  | { kind: "map"; caption?: string; rows: Mapping[] }
  // Something the reader added, or kept from Claude, because the map did not
  // say it. Prose, because the thing that made an explanation land is often a
  // sentence; `origin` is required, since a note only exists because a person
  // put it there.
  | { kind: "note"; title?: string; body: string; origin: Origin }
  | Source;

export interface Node {
  id: string;
  /**
   * The thing's own name, 1-3 words, Title Case. A LABEL, not a sentence.
   *
   * The board shipped with prose here — "Agreeing to be read", "Where it all
   * lands" — and a reader cannot tell from those what part of the product they
   * name, so the first level read as ten riddles. The sentence belongs in
   * `sub`. See `lib/view.ts`.
   */
  title: string;
  /** One line, plain English. What this IS — never a file path. */
  sub: string;
  /**
   * Where this card's code actually lives: the direct answer to "what belongs
   * to what". Features cut across directories (`identity` spans
   * `app/(protected)`, `lib/rules` and `app/api`), so the footprint is stated
   * rather than left to be inferred from the title.
   */
  footprint?: { dirs: string[]; files: number };
  /**
   * Set on cards holding more rows than `CARD_ROWS_SOFT`: the shape of what is
   * inside, so the reader knows what they are scrolling before they scroll it.
   * e.g. "13 formulas, one per 1040-NR line".
   */
  summary?: string;
  /** How this node's CHILDREN relate to each other. */
  group?: Group;
  /**
   * Something to recognise before reading anything: brand marks for the real
   * technologies involved, a small diagram where the arrangement is the
   * finding, or a single number. See `Shape` in `lib/view.ts`.
   *
   * Only ever drawn from facts the analysis actually has. A card with nothing
   * true to draw gets none — an invented diagram is an invented arrow (D19).
   */
  shape?: Shape;
  state: State;
  /**
   * Set only where the reader added or edited this. A generated or authored
   * node has none. See `Origin`: this does not weaken or replace `state`.
   */
  origin?: Origin;
  alarm?: boolean;
  ghost?: boolean;
  col: number;
  row: number;
  /**
   * At most two short sentences (≤ 40 words) — the one thing to know before
   * looking at the pictures. Everything else is a block: steps are a `flow` or
   * `sequence`, connections a `diagram`, values a `table`. A paragraph that
   * explains the code is exactly what this tool replaces (D38).
   */
  detail?: string;
  /** Where this lives in the code. Every authored node has at least one. */
  code?: CodeRef[];
  /**
   * What the repository's own docs say about this: passages of its Markdown
   * (a design note, a recorded decision, a plan) that explain WHY the code is
   * the way it is, or what it is meant to become. Only passages that bear on
   * this node, each labelled with what it says, never the code's stand-in:
   * `code` is still where it lives. Most nodes have none.
   */
  docs?: CodeRef[];
  /** Known problems, shown as "Watch out" on this level. */
  issues?: Issue[];
  /**
   * Why this is not certain, in plain words. Required when `state` is not
   * `derived` — a mark with no reason is the "what does partial mean" defect.
   */
  unsure?: string;
  /** Where the claim came from. Always a real location. */
  evidence?: string;
  anatomy?: Anatomy[];
  /**
   * What is underneath. Depth is a property of the BRANCH, not a global level:
   * a node with children can be opened, one without is a leaf, and nothing
   * caps how far that nests. Some branches stop at two because nothing
   * different lives below them; the ones that keep going do so because each
   * level answers a question its parent could not.
   */
  children?: Node[];
  /** Edges among this node's own children, drawn when it is the open node. */
  edges?: Edge[];
  /**
   * Synthesized from a row that carried `under`, rather than authored.
   *
   * The distinction is what a level MEANS. Authored children are siblings you
   * are meant to see together — "Subject and mode" next to "What you can send"
   * is a comparison. Row children are answers to six different questions, and
   * you asked one: rendering the other five is the wall of context this tool
   * exists to remove. `Branch` shows only the row child on the open path.
   */
  fromRow?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  state: State;
  alarm?: boolean;
  label?: string;
  /**
   * Position in a real sequence, 1-indexed.
   *
   * An edge claims that `from` genuinely precedes `to` — a pipeline stage, a
   * request path, an ordered write. Siblings with no true ordering get no edge
   * at all and render as a SET (see `Group.ordering`), because inventing
   * arrows to make a level look like a diagram turns a weak claim into a
   * confident-looking one.
   */
  order?: number;
}

/**
 * How a set of siblings relates to each other.
 *
 * The board shipped with 6 edges, all at the root, and none below it — so
 * every level past the first was a silent pile of cards with no stated
 * relationship. Saying "these are unordered" is information; saying nothing
 * reads as missing analysis.
 */
export interface Group {
  ordering: "sequence" | "set";
  /** Shown when `set`: why these belong together despite having no order. */
  note?: string;
}

/* ── row-level links ──────────────────────────────────────────
   The edges developers actually want to trace. Endpoints are ROWS, not cards:
   a foreign key points at the exact column it references, a route points at
   the step that serves it. Card-to-card edges ("Billing relates to Database")
   are nearly contentless; these are the ones that answer a question.

   Row id = `${capabilityId}:${rowKey}` — see rowId() below. */

export interface Link {
  from: string;
  to: string;
  state: State;
  alarm?: boolean;
  label?: string;
}

/** One mapping run: which repository, at which commit, and how it is cut. */
export interface Run {
  command: string;
  /** The checkout's directory name, looked for under the usual code folders (rootOf in lib/maps.ts) — also where the code level reads. */
  repo: string;
  commit: string;
  files: number;
  elapsed: string;
  /** Absolute path of the mapped checkout. Set by the generator; overrides `repo`. */
  root?: string;
  /** Which model ran each generator stage. Absent on hand-authored maps. */
  models?: Record<string, string>;
  /** Web address of the repository, read from the checkout's git remote when the page is built. */
  url?: string;
}

/** Stable id for an anatomy row, so a wire can anchor to it. */
export function rowId(owner: string, key: string | number) {
  return `${owner}:${key}`;
}
