/**
 * The things a card can show instead of another paragraph.
 *
 * "There are no logos, diagrams, or anything that makes it appealing. Right now
 * it's very text-heavy." The shapes in `Shape` are the answer, and the rule
 * that governs them is D19's: an invented picture is the same failure as an
 * invented arrow. Every glyph here names a real dependency in the mapped repo's
 * package.json.
 *
 * Everything is hand-authored inline SVG. There is no icon library in this
 * project and there is deliberately not going to be one — a brand-mark set is
 * nine paths, and a dependency that ships four thousand icons to render nine is
 * a worse trade than the drawing.
 *
 * On the marks specifically: these are simplified geometric interpretations —
 * a recognisable silhouette at 14px, single-colour, inheriting `currentColor`.
 * They are NOT the corporate artwork and do not claim to be. The job is "you
 * recognise this is the AWS one before you read the word AWS", which a
 * silhouette does at a glance and a faithful reproduction would do no better at
 * this size.
 */

/* ────────────────────────────────────────────────────────────────────
   TASK 1 — BRAND MARKS
   ──────────────────────────────────────────────────────────────────── */

/**
 * The glyph table, keyed by the id the fixture uses.
 *
 * Each entry draws inside a 16×16 box and uses `currentColor` only, so a chip
 * can tint the pair — glyph and name — as one thing. Anything not in here
 * renders as a name-only chip rather than crashing or guessing a drawing: an id
 * we have no mark for is a missing fact, and a wrong glyph would assert one.
 */
const MARKS: Record<string, { name: string; draw: React.ReactNode }> = {
  aws: {
    name: "AWS",
    // The smile, and the wordmark's stacked-block feel above it.
    draw: (
      <>
        <path
          d="M3 6.4c1.1.7 2.9 1.1 5 1.1s3.9-.4 5-1.1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M2.2 10.6c2 1.5 4.4 2.2 5.8 2.2s3.8-.7 5.8-2.2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
        {/* The smile's upward flick. Solid, not stroked — a 1.3px open chevron
            at this size disappeared and the mark read as two plain curves. */}
        <path d="M12.3 9.5l2.2-.5-.6 2.2z" fill="currentColor" />
      </>
    ),
  },
  bedrock: {
    name: "Bedrock",
    // Strata: a foundation model service drawn as bedded layers.
    draw: (
      <>
        <path d="M2 11.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M3 8.7h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M4.5 6h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M6.5 3.4h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
  },
  s3: {
    name: "S3",
    // A straight-sided bucket with a banded seam. The tapered version read as a
    // trash can at 14px — the taper plus the rim ellipse IS a wastebasket
    // silhouette, and "delete" is the worst possible wrong reading for storage.
    draw: (
      <>
        <path d="M3.2 3.6h9.6v8.8a1.2 1.2 0 01-1.2 1.2H4.4a1.2 1.2 0 01-1.2-1.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        <ellipse cx="8" cy="3.6" rx="4.8" ry="1.7" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M3.2 8.6h9.6" stroke="currentColor" strokeWidth="1.1" />
      </>
    ),
  },
  supabase: {
    name: "Supabase",
    // The two offset lightning halves, as one folded bolt.
    draw: (
      <path
        d="M8.8 1.6L3.1 8.4a.5.5 0 00.38.83H7.5v5.2l5.7-6.8a.5.5 0 00-.38-.83H8.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  openai: {
    name: "OpenAI",
    // The interlocked hexagonal knot, reduced to a hexagon with its seams.
    draw: (
      <>
        <path
          d="M8 1.9l5.3 3.05v6.1L8 14.1 2.7 11.05v-6.1z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M8 5.1v5.8M5.3 6.6l5.4 2.8M10.7 6.6L5.3 9.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  postgres: {
    name: "Postgres",
    // Cylinder. The elephant does not survive 14px.
    draw: (
      <>
        <ellipse cx="8" cy="4" rx="4.8" ry="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M3.2 4v8c0 1.1 2.15 2 4.8 2s4.8-.9 4.8-2V4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M3.2 8c0 1.1 2.15 2 4.8 2s4.8-.9 4.8-2" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </>
    ),
  },
  nextjs: {
    name: "Next.js",
    // The circle with the rising diagonal of the N.
    draw: (
      <>
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M5.6 10.8V5.2l5.2 6.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M10.4 5.2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
  },
  zod: {
    name: "Zod",
    // The shield-ish chevron with the Z inside it.
    draw: (
      <>
        <path d="M2.4 4.6L8 1.8l5.6 2.8L8 14.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        <path d="M5.6 5.6h4.8L5.6 9.9h4.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  pdf: {
    name: "pdf-lib",
    // A folded page. The only one of these that is a file format, not a vendor.
    draw: (
      <>
        <path d="M3.4 1.6h5.2L12.6 5.4v9H3.4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        <path d="M8.4 1.7v3.6h3.8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        {/* Text lines, not the letters "PDF" — three glyphs inside a 9px page
            collapse into a smudge. Ruled lines still say "document". */}
        <path d="M5.6 8.4h4.8M5.6 10.6h4.8M5.6 12.2h2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },

  /* explorify — every id below is a real dependency of that repo: `expo` in
     package.json, `react-native-google-places-autocomplete` in package.json,
     Flask in api/requirements.txt, and Deno as the runtime the two
     supabase/functions/ files import from deno.land and esm.sh. */
  expo: {
    name: "Expo",
    // The chevron, open at the base.
    draw: (
      <path
        d="M8 2.6l5.6 10.4h-2.3L8 6.9 4.7 13H2.4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  googlemaps: {
    name: "Google Places",
    // A map pin: the address field is Places autocomplete.
    draw: (
      <>
        <path d="M8 14.4s4.6-4.7 4.6-8.1a4.6 4.6 0 00-9.2 0c0 3.4 4.6 8.1 4.6 8.1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        <circle cx="8" cy="6.3" r="1.6" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </>
    ),
  },
  flask: {
    name: "Flask",
    // A lab flask — the Python API.
    draw: (
      <>
        <path d="M6.4 2.2v4.3L2.9 12.7a.9.9 0 00.8 1.3h8.6a.9.9 0 00.8-1.3L9.6 6.5V2.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
        <path d="M5.4 2.2h5.2M4.6 10.4h6.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  deno: {
    name: "Deno",
    // A circle with an eye: the edge functions' runtime.
    draw: (
      <>
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <circle cx="9.6" cy="5.8" r="0.9" fill="currentColor" />
        <path d="M6.2 9.2c.8 1.6 1.3 3 1.4 4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </>
    ),
  },
};

/** The brand marks there is a drawing for — the only ids a generated map may use. */
export const MARK_IDS = Object.keys(MARKS);

/**
 * The technologies behind a level, inline in its title row (D39). They used to
 * own a 300px column beside the header — tiny glyphs in a big empty space —
 * so they now sit where the eye already is. The note becomes the tooltip.
 */
export function InlineMarks({ ids, note }: { ids: string[]; note?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" title={note}>
      {ids.map((id) => {
        const mark = MARKS[id];
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 border border-border-gray bg-card px-2.5 py-1 text-[12px] font-medium text-on-surface-variant"
          >
            {mark ? (
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="shrink-0">
                {mark.draw}
              </svg>
            ) : null}
            {mark ? mark.name : id}
          </span>
        );
      })}
    </span>
  );
}
