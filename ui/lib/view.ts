/**
 * The presentation contract. Frozen for this round — builders read it, none of
 * them edit it.
 *
 * Everything here exists to answer one complaint: "I don't know what belongs to
 * what, and I don't know what I'm looking at." The rules are about naming and
 * orientation, not decoration.
 */

/**
 * A card's name is a LABEL, not a sentence.
 *
 * The board shipped with prose where names belong — "Agreeing to be read",
 * "Free Refund Check", "Where it all lands". A reader cannot tell from those
 * what part of the product they name, so the first level reads as ten riddles.
 *
 * The rule: `title` is the thing's real name in the product or the code, in
 * Title Case, 1-3 words. The sentence that used to be the title becomes `blurb`
 * and sits underneath, where a subtitle belongs.
 *
 * Good:  title "Consent"      blurb "IRS §7216 disclosure, shown before any upload"
 * Bad:   title "Agreeing to be read"
 */
export interface Naming {
  /** 1-3 words. The product's or the code's own word for this. */
  title: string;
  /** One sentence. What it does and why it is interesting. Never clipped. */
  blurb: string;
}

/**
 * Where a card's code actually lives.
 *
 * This is the direct answer to "what belongs to what". Features cut across
 * directories — `identity` spans `app/(protected)`, `lib/rules` and `app/api` —
 * so the footprint has to be stated, not inferred from the title.
 *
 * Rendered as a quiet monospace line under the blurb. Truncate the LIST (by
 * dropping directories and counting them) rather than the text of any entry.
 */
export interface Footprint {
  /** Repo-relative directories or files this card's content came from. */
  dirs: string[];
  /** Total distinct files behind this card and everything under it. */
  files: number;
}

/**
 * Text is never clipped mid-word.
 *
 * Measured on the shipped board: 7 of 10 subtitles were truncated, several by
 * 12-95px, on a viewport that was 85% empty. "the one test that isn't
 * implemented" — the most interesting claim on the screen — was cut at "isn'…".
 *
 * So: `blurb` wraps to at most BLURB_LINES lines and is never `truncate`d. If a
 * blurb does not fit in two lines it is too long and gets rewritten, not cut.
 */
export const BLURB_LINES = 2;

/**
 * Minimum readable width for the VALUE side of any two-column row.
 *
 * Measured failure: a `map` row was 212px wide, the label took 112px (53%), and
 * the value — the actual answer — got 32px, rendering one word per line over
 * twelve lines. The label is the question; the value is the answer; the answer
 * never gets less room than the question.
 */
export const ROW_LABEL_MAX_PCT = 40;
export const ROW_VALUE_MIN_PX = 160;

/**
 * Card sizing scales with content, deliberately.
 *
 * Considered and rejected: a hard cap of ~5 rows per card. A card's size is
 * information — `engine › Every formula` holding 13 formulas SHOULD look denser
 * than `store › What is stored in the clear` holding one fact. Capping every
 * card to the same height throws that signal away and hides the outliers that
 * most need authoring attention.
 *
 * What is NOT allowed is a card so tall it cannot be framed. Past
 * CARD_ROWS_SOFT rows, a card must carry a `summary` line stating the shape of
 * what it holds ("13 formulas, one per 1040-NR line"), so the reader knows what
 * they are scrolling through before they scroll it.
 */
export const CARD_ROWS_SOFT = 8;

/**
 * The three states, restated for renderers.
 *
 * `derived` carries NO mark — marking certainty creates a two-tier read where
 * anything unmarked looks like a failure. Only `partial` and `inferred` are
 * marked, and every mark must be able to say why when hovered.
 *
 * A legend is mandatory on screen. 7 of 10 root cards read `partial`, and with
 * nothing defining the word the board reads as "mostly broken" rather than
 * "honestly bounded".
 */
export const STATE_MEANING = {
  derived:
    "Resolved by the TypeScript compiler or read straight out of the file. Unmarked.",
  partial:
    "Found, but the analysis knows it is incomplete — the mark says what is missing.",
  inferred:
    "A guess from naming or layout. Never presented as fact.",
} as const;

/**
 * Sibling ordering.
 *
 * An arrow between two cards claims that one genuinely precedes the other. It
 * is drawn ONLY where that is true — a pipeline, a request path, a sequence of
 * writes. Siblings with no real ordering are a SET, not a flow, and render with
 * no wire plus a one-line note saying they are unordered.
 *
 * Inventing arrows to make a level look like a diagram is the failure this rule
 * exists to prevent: it turns a weak claim into a confident-looking one.
 */
export type Ordering = "sequence" | "set";

/* ────────────────────────────────────────────────────────────────────
   PROGRESSIVE DISCLOSURE — added after the Extraction level was measured
   at 732 words on one screen (Tax Engine: 1,085).
   ──────────────────────────────────────────────────────────────────── */

/**
 * A card shows WHAT it contains, never the contents themselves.
 *
 * The defect, measured on `extraction`: the card `BDA Parse` already had four
 * real children — "Stage the PDF in S3", "Sign the request by hand", "Invoke,
 * then poll", "Follow the pointer" — AND printed all four inline with their
 * full explanatory paragraphs, 240 words on one card. The next level was being
 * painted onto the current one, so drilling revealed nothing new and the level
 * read as an essay in columns.
 *
 * The rule: a step row on a card renders its TITLE and nothing else when it has
 * somewhere to go. Its `detail` belongs to the level behind the click. A row
 * with no child may keep one short line, because for that row there is no
 * "deeper" to defer to.
 *
 * This is what makes a level a menu rather than a document, and it is the whole
 * reason the tool is a map instead of a chat window.
 */
export const LEVEL_WORD_BUDGET = 120;

/**
 * Prose that may appear on a card that is NOT the one you opened to.
 *
 * `detail` on a sibling card is the single largest contributor to the word
 * count, and it is always answering a question the reader has not asked yet.
 * Zero means: siblings show title, blurb, shape and step titles only.
 */
export const SIBLING_PROSE_LINES = 0;

/**
 * Every card earns a SHAPE: something to recognise before reading anything.
 *
 * "Right now it's pretty boring to look at and it's pretty hard to understand
 * what's going on." A wall of uniform text gives the eye no purchase, so the
 * reader has to parse sentences to find out whether a card is even relevant.
 *
 * A shape is one of:
 *  - `marks`  brand glyphs for the real technologies involved (Bedrock, S3,
 *             Supabase, OpenAI). These are FACTS — every one is a dependency in
 *             the mapped repo's package.json, not decoration.
 *  - `figure` a small purpose-built diagram where the arrangement IS the
 *             finding: a fan-out to three models, a pipeline, a gate.
 *  - `count`  a single number with a unit, where magnitude is the point.
 *
 * A card with nothing true to draw gets none. An invented diagram is the same
 * failure as an invented arrow (D19).
 */
export type Shape =
  | { kind: "marks"; ids: string[]; note?: string }
  | { kind: "figure"; id: string; note?: string }
  | { kind: "count"; value: string; unit: string };

/* ────────────────────────────────────────────────────────────────────
   ROUND 3 — understand the repo without reading the code.
   "the description is very simple then it just dives straight into the
   code … the goal is not to inspect the code directly, that should be the
   last resort that's always available."
   ──────────────────────────────────────────────────────────────────── */

/**
 * Names a newcomer would use, not names the analysis invented.
 *
 * Shipped: "Org Wizard", "Five Stages", "Role Lookup", "Three Copies". Each is
 * a nickname for something the reader has not met yet, so it has to be decoded
 * before it can be read. A title says what the thing is in everyday words.
 *
 * Good:  "Organisation Sign-Up", "Interest Categories", "Choosing The Home Screen"
 * Bad:   "Org Wizard", "Five Stages", "Role Lookup"
 *
 * Code identifiers (`rsvp`, `fetchAllEvents`) belong in `detail`, set in
 * backticks, never in a title.
 */
export const PLAIN_TITLE_EXAMPLES = {
  good: ["Organisation Sign-Up", "Interest Categories", "Choosing The Home Screen"],
  bad: ["Org Wizard", "Five Stages", "Role Lookup"],
} as const;

/**
 * Show the thing itself, not a pointer to the code that holds it.
 *
 * Shipped: opening "Categories" showed "social, cultural, stem … and four
 * more" and then a code excerpt. The categories ARE the content. Real values
 * are drawn as data — `table` for lists and lookups, `schema` for rows,
 * `example` for what a stored value looks like, `screen` for what the user
 * sees, `sequence` for who talks to whom, `flow` for steps.
 *
 * A level's own content is no longer capped by LEVEL_WORD_BUDGET: that budget
 * measured one level painting the NEXT level's content onto its cards, and
 * that rule (a card names, never shows, what is behind it) still holds. The
 * open level itself may explain as much as it needs, in blocks, not walls.
 */
export const DETAIL_PARAGRAPHS_MAX = 1;
/** "this is way too long … replace the huge text block with simple diagrams" (D38). */
export const DETAIL_WORDS_MAX = 40;
export const DETAIL_SENTENCES_MAX = 2;

/**
 * Code is the last resort, always one click away — never the bottom layer.
 *
 * Every authored node carries `code` refs, read live in a drawer on its level.
 * A branch ends when there is nothing more to EXPLAIN, at whatever depth that
 * is — one level or seven. No branch is made deeper to reach code, and none is
 * cut short because it got there.
 */
export const CODE_IS_A_DRAWER = true;

/**
 * Two marks, in words, replace "partial" and "inferred" on screen.
 *
 *  - "Problem"      the node has `issues`; the count is shown on its card.
 *  - "Not certain"  `state` is not `derived`; `unsure` says why, on the level.
 *
 * "partial" meant two different things in the explorify map — "the answer is
 * not all in this repo" and "this has a bug" — and said neither.
 */
export const MARKS = {
  problem: "Has a known problem — listed under Watch out.",
  unsure: "Not certain — the reason is given on the level.",
} as const;
