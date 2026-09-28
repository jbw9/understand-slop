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
