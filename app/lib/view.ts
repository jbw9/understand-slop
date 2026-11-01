/**
 * The presentation rules a renderer reads.
 *
 * Everything here exists to answer one complaint: "I don't know what belongs to
 * what, and I don't know what I'm looking at." The rules are about naming and
 * orientation, not decoration.
 */

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
 *  - `count`  a single number with a unit, where magnitude is the point.
 *
 * A card with nothing true to draw gets none. An invented diagram is the same
 * failure as an invented arrow (D19).
 */
export type Shape =
  | { kind: "marks"; ids: string[]; note?: string }
  | { kind: "count"; value: string; unit: string };
