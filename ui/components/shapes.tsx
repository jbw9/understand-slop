import { cn } from "@/lib/utils";
import type { Shape } from "@/lib/view";

/**
 * The things a card can show instead of another paragraph.
 *
 * "There are no logos, diagrams, or anything that makes it appealing. Right now
 * it's very text-heavy." The three shapes in `Shape` are the answer, and the
 * rule that governs all of them is D19's: an invented diagram is the same
 * failure as an invented arrow. Every glyph here names a real dependency in the
 * mapped repo's package.json; every figure draws an arrangement the analysis
 * actually found, including the parts of it that are broken.
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border-gray bg-pure-white px-2.5 py-1 text-[12px] font-medium text-on-surface-variant"
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

/** One glyph + name, or just the name when we have no mark for the id. */
function Mark({ id }: { id: string }) {
  const mark = MARKS[id];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-border-gray bg-surface-container-low/70 py-1 pl-1.5 pr-2.5 text-muted-slate">
      {mark ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          role="img"
          aria-label={mark.name}
          className="shrink-0 text-on-surface-variant"
        >
          <title>{mark.name}</title>
          {mark.draw}
        </svg>
      ) : null}
      <span className={cn("text-[10.5px] font-medium leading-none", !mark && "pl-1")}>
        {mark ? mark.name : id}
      </span>
    </span>
  );
}

function Marks({ ids, note }: { ids: string[]; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((id) => (
          <Mark key={id} id={id} />
        ))}
      </div>
      {note ? <p className="text-[10px] leading-snug text-faint">{note}</p> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   TASK 2 — FIGURES

   Each is 240×120 and is drawn so the ARRANGEMENT carries the finding: a
   fan-out that is three legs wide because three readers is the point, a
   pipeline whose second-to-last hop doubles back on itself because the
   pointer-to-a-pointer is the documented trap, a gate with a road around it
   because that hole is what the analysis actually found.

   Colour follows the state families in STYLE.md: green/solid where the
   compiler resolved it, amber/dashed where it is `partial`.
   ──────────────────────────────────────────────────────────────────── */

const FIG_W = 240;
const FIG_H = 120;

/** Shared type-size + colour vocabulary for figure interiors. */
const NODE_FILL = "var(--color-pure-white)";
const LINE = "var(--color-wire)";
const GREEN = "var(--color-deep-green)";
const AMBER = "var(--color-amber-ink)";
const INK = "var(--color-on-surface)";
const FAINT = "var(--color-faint)";

/** A labelled box. `tone` picks the state family; `dashed` means partial. */
function Box({
  x,
  y,
  w,
  h,
  label,
  sub,
  tone = "plain",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  tone?: "plain" | "green" | "amber";
}) {
  const stroke = tone === "green" ? GREEN : tone === "amber" ? AMBER : "var(--color-border-strong)";
  const fill =
    tone === "amber" ? "var(--color-amber-surface)" : tone === "green" ? "var(--color-mint-success)" : NODE_FILL;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="4"
        fill={fill}
        stroke={stroke}
        strokeWidth="1"
        strokeDasharray={tone === "amber" ? "3 2.5" : undefined}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 1 : y + h / 2 + 3.2}
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill={tone === "amber" ? AMBER : INK}
      >
        {label}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

/**
 * An arrow. Dashed + amber when the step it draws is `partial`.
 *
 * Every arrow in every figure below is a real precedence in the mapped repo —
 * the same bar D19 sets for the wires between cards. There are no arrows here
 * drawn to make a figure look symmetrical.
 */
function Arrow({ d, tone = "plain" }: { d: string; tone?: "plain" | "green" | "amber" }) {
  const stroke = tone === "green" ? GREEN : tone === "amber" ? AMBER : LINE;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth="1.1"
      strokeDasharray={tone === "amber" ? "3 2.5" : undefined}
      markerEnd={`url(#slop-arrow-${tone})`}
    />
  );
}

/** Arrowheads, one per tone. Ids are namespaced — several figures share a page. */
function Defs() {
  return (
    <defs>
      {(
        [
          ["plain", LINE],
          ["green", GREEN],
          ["amber", AMBER],
        ] as const
      ).map(([tone, color]) => (
        <marker
          key={tone}
          id={`slop-arrow-${tone}`}
          viewBox="0 0 8 8"
          refX="6.4"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M1 1.4L6.4 4 1 6.6z" fill={color} />
        </marker>
      ))}
    </defs>
  );
}

const FIGURES: Record<string, { title: string; draw: React.ReactNode }> = {
  /**
   * The fan-out the user asked for by name: "for the BDA put diagrams of how it
   * routes to the different models and what models are currently used."
   *
   * The model names ARE the information, so they are set in the boxes rather
   * than in a legend. The arrangement says the rest: A and B share one input
   * (the same markdown — so they share its mistakes), C comes off the PDF
   * upstream of the parser, which is why it is the only leg that can catch the
   * parser being wrong.
   */
  "three-legs": {
    title:
      "One document read three ways: haiku-4-5 and minimax-m2.5 over BDA's markdown, haiku over the raw PDF, converging on a comparison",
    draw: (
      <>
        <Box x={2} y={52} w={52} h={22} label="PDF" />
        <Box x={2} y={14} w={52} h={24} label="markdown" sub="from BDA" />
        <Arrow d="M28 52V41" />

        <Box x={82} y={6} w={78} h={24} label="haiku-4-5" sub="A · bda-primary" tone="green" />
        <Box x={82} y={38} w={78} h={24} label="minimax-m2.5" sub="B · cross-read" />
        <Box x={82} y={74} w={78} h={24} label="haiku" sub="C · pdf-direct" />

        {/* A and B both hang off the markdown — one shared input, hence one shared blind spot. */}
        <Arrow d="M54 26h14v-8h11" />
        <Arrow d="M54 26h14v24h11" />
        {/* C leaves from the PDF itself, upstream of the parser. */}
        <Arrow d="M54 63h14v23h11" />

        <Box x={188} y={38} w={50} h={28} label="compare" sub="arbiter" tone="green" />
        <Arrow d="M160 18h11v29h14" tone="green" />
        <Arrow d="M160 50h28" />
        <Arrow d="M160 86h11V57h14" />

        <text x={120} y={112} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          A and B share the markdown; only C can catch the parser
        </text>
      </>
    ),
  },

  /**
   * The BDA pipeline, drawn so the two-hop pointer indirection is visible as a
   * shape rather than stated as a sentence. The result names a metadata file;
   * that file names the output path; only then is there markdown. That doubling
   * back is the documented trap, so it gets its own row and its own label.
   */
  "bda-pipeline": {
    title:
      "PDF staged in S3, invoked async, polled, then two pointer hops — job result names a metadata file, which names the markdown path",
    draw: (
      <>
        <Box x={2} y={4} w={36} h={26} label="PDF" />
        <Arrow d="M38 17h12" />
        <Box x={50} y={4} w={52} h={26} label="S3" sub="staging/input" />
        <Arrow d="M102 17h12" />
        <Box x={114} y={4} w={72} h={26} label="InvokeData" sub="AutomationAsync" />
        <Arrow d="M186 17h12" />
        {/* Polling is a repeat, not a step: the schedule and the give-up count
            are in the box rather than drawn as a loop arc, which at this size
            reads as a smudge rather than as a cycle. */}
        <Box x={198} y={4} w={40} h={26} label="poll ↻" sub="4s,1s… ×10" />

        <Arrow d="M218 30v20" />

        {/* Hop one. */}
        <Box x={168} y={50} w={70} h={24} label="job result" sub="names a file" />
        <Arrow d="M168 62h-24" />
        <Box x={78} y={50} w={66} h={24} label="metadata" sub="names a path" />
        <Arrow d="M78 62H50" />
        <Box x={2} y={50} w={48} h={24} label="markdown" tone="green" />

        <text x={120} y={92} textAnchor="middle" fontSize="7" fontWeight="600" fill={AMBER}>
          two pointer hops
        </text>
        <text x={120} y={104} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          the result points at a file that points at the output
        </text>
        <text x={120} y={114} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          a page BDA cannot represent becomes an empty string, silently
        </text>
      </>
    ),
  },

  /**
   * Three ordered gates. This one genuinely is a sequence — gate 2 only runs
   * when gate 1 fails, gate 3 only judges what gate 2 returned — so it is drawn
   * as a ladder with the failure edge made explicit. The pass edge leaving gate
   * 1 is the common case and says so.
   */
  "resolution-ladder": {
    title:
      "Three ordered gates: does the arithmetic foot, then re-read with pdftotext, then guard on digit count",
    draw: (
      <>
        <Box x={6} y={8} w={100} h={26} label="Does it foot?" sub="parts sum to total" />
        <Arrow d="M106 21h48" tone="green" />
        <Box x={154} y={8} w={80} h={26} label="accepted" tone="green" />

        <Arrow d="M56 34v14" tone="amber" />
        <text x={62} y={45} fontSize="6.5" fill={AMBER}>
          doesn&apos;t foot
        </text>

        <Box x={6} y={48} w={100} h={26} label="pdftotext" sub="second text layer" />
        <Arrow d="M56 74v14" />
        <Box x={6} y={88} w={100} h={26} label="Guard on digits" sub="fewer than 2 = unusable" />

        <Arrow d="M106 101h40" tone="amber" />
        <Box x={146} y={88} w={88} h={26} label="no text layer" sub="or a genuine scan" tone="amber" />

        <text x={188} y={58} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          each gate runs only when
        </text>
        <text x={188} y={68} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          the one above it failed
        </text>
      </>
    ),
  },

  /**
   * The consent gate — drawn with the hole in it.
   *
   * The obvious figure here is one gate that every upload passes through, and
   * that figure would be a lie. The fixture is explicit: the wizard upload sits
   * behind the consent modal, and the public `/check` funnel reaches the same
   * extraction stack with no account and no consent screen. That second path is
   * marked `partial` in the data and is drawn here as a dashed road AROUND the
   * gate, because the bypass is the finding. Drawing the tidy version would be
   * D19's invented arrow wearing a different hat.
   */
  "consent-gate": {
    title:
      "Wizard uploads pass the §7216 consent gate; the public /check funnel reaches the same extraction stack without one",
    draw: (
      <>
        <Box x={2} y={8} w={58} h={26} label="Wizard" sub="signed in" />
        <Arrow d="M60 21h14" tone="green" />

        <Box x={74} y={6} w={76} h={30} label="Consent" sub="§7216, write-once" tone="green" />
        <Arrow d="M150 21h14" tone="green" />

        <Box x={164} y={6} w={74} h={30} label="extraction" sub="same stack" />

        <Box x={2} y={62} w={58} h={26} label="/check" sub="no account" tone="amber" />
        {/* The road around the gate: it skirts every consent step and rejoins
            the same extraction box from below. The detour IS the finding. */}
        <Arrow d="M60 75h141V36" tone="amber" />

        <text x={130} y={70} textAnchor="middle" fontSize="7" fontWeight="600" fill={AMBER}>
          no consent step
        </text>
        <text x={120} y={100} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          whether §7216 attaches to the public funnel is a
        </text>
        <text x={120} y={110} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          legal question the repo cannot answer
        </text>
      </>
    ),
  },

  /**
   * explorify's launch routing. There is no role column: the app asks
   * `individual` first, then `organizations`, and the table that answers IS
   * the role. The third exit — an id in neither table — has no branch in
   * app/_layout.tsx, so it is drawn amber rather than left out.
   */
  "role-by-table": {
    title:
      "A signed-in id is looked up in individual, then organizations; the table that answers decides the home screen, and an id in neither gets no route",
    draw: (
      <>
        <Box x={2} y={44} w={56} h={30} label="signed in" sub="user id" />
        <Arrow d="M58 54h10V19h11" />

        <Box x={82} y={6} w={72} h={26} label="individual?" sub="row with this id" />
        <Arrow d="M154 19h21" tone="green" />
        <Box x={178} y={6} w={60} h={26} label="/individual" tone="green" />

        <Arrow d="M118 32v13" />
        <text x={122} y={42} fontSize="6.5" fill={FAINT}>
          not found
        </text>

        <Box x={82} y={48} w={72} h={26} label="organizations?" sub="row with this id" />
        <Arrow d="M154 61h21" tone="green" />
        <Box x={178} y={48} w={60} h={26} label="/org" tone="green" />

        {/* No else-branch exists for this exit; it is the finding. */}
        <Arrow d="M118 74v27h57" tone="amber" />
        <Box x={178} y={88} w={60} h={26} label="no route" sub="in neither" tone="amber" />

        <text x={40} y={100} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          no role column:
        </text>
        <text x={40} y={110} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          the table is the role
        </text>
      </>
    ),
  },

  /**
   * Every writer of explorify's `events.rsvp`. It is one JSON string, and each
   * writer reads it, edits it in memory, and writes the whole string back —
   * with no lock, so two writers in flight lose one. The Saved-tab cancel
   * treats the object as an array and throws, and check-in writes from a copy
   * loaded on an earlier screen; both are amber because both are broken.
   */
  "rsvp-writers": {
    title:
      "Four writers rewrite events.rsvp, one JSON string: join, cancel, a Saved-tab cancel that throws, and an org check-in that writes a stale copy",
    draw: (
      <>
        <Box x={2} y={4} w={96} h={22} label="Join" sub="adds a key" />
        <Box x={2} y={32} w={96} h={22} label="Cancel" sub="button, details page" />
        <Box x={2} y={60} w={96} h={22} label="Cancel (Saved tab)" sub="expects an array, throws" tone="amber" />
        <Box x={2} y={88} w={96} h={22} label="Check-in" sub="org, stale copy" tone="amber" />

        <Arrow d="M98 15H124V48H147" />
        <Arrow d="M98 43H130V54H147" />
        <Arrow d="M98 71H130V62H147" tone="amber" />
        <Arrow d="M98 99H124V70H147" tone="amber" />

        <Box x={150} y={40} w={88} h={36} label="events.rsvp" sub="one JSON string" />

        <text x={194} y={14} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          read · edit · write
        </text>
        <text x={194} y={24} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          the whole string
        </text>
        <text x={194} y={96} textAnchor="middle" fontSize="7" fontWeight="600" fill={AMBER}>
          no lock
        </text>
        <text x={194} y={106} textAnchor="middle" fontSize="6.5" fill={AMBER}>
          last write wins
        </text>
      </>
    ),
  },

  /**
   * explorify's event lifecycle as the code has it. Draft and Published are a
   * real boolean; Archive is not a state at all, only a date comparison on the
   * dashboard. The `archive-event` edge function sits beside it unconnected,
   * because nothing calls it and it is still Supabase's hello-world template.
   */
  "event-states": {
    title:
      "Form to draft (published false) to published (true); Archive is only a date filter, and the archive-event function is an uncalled template",
    draw: (
      <>
        <Box x={2} y={12} w={44} h={28} label="Form" />
        <Arrow d="M46 26h13" />
        <Box x={62} y={8} w={72} h={36} label="Draft" sub="published = false" />
        <text x={146} y={5} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          publish
        </text>
        <Arrow d="M134 26h21" tone="green" />
        <Box x={158} y={8} w={80} h={36} label="Published" sub="published = true" tone="green" />

        <Arrow d="M198 44v23" tone="amber" />
        <text x={194} y={58} textAnchor="end" fontSize="6.5" fill={FAINT}>
          date passes
        </text>
        <Box x={158} y={70} w={80} h={30} label="Archive" sub="a date filter" tone="amber" />

        {/* Deliberately unconnected: nothing invokes it. */}
        <Box x={62} y={70} w={72} h={30} label="archive-event" sub="template, never called" tone="amber" />

        <text x={120} y={114} textAnchor="middle" fontSize="6.5" fill={FAINT}>
          no code ever writes an archived state
        </text>
      </>
    ),
  },
};

function Figure({ id, note }: { id: string; note?: string }) {
  const fig = FIGURES[id];
  if (!fig) return null;
  return (
    // A figure renders at its DESIGNED width or not at all.
    //
    // Measured on the Extraction level: `w-full` inside the anatomy column gave
    // these 113px against a 240px viewBox, which scaled their 6.5px labels to an
    // effective 5.6px — a diagram whose text cannot be read is decoration, which
    // is exactly what D25 says these must never be. The column is narrower than
    // the drawing, so the drawing sets the floor and the card gives it room.
    <div className="flex min-w-0 flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${FIG_W} ${FIG_H}`}
        role="img"
        aria-label={fig.title}
        style={{ minWidth: FIG_W, width: "100%" }}
        // Unframed, like a diagram (D41): a picture is the level, not an
        // illustration pasted onto it.
        className="block h-auto"
      >
        <title>{fig.title}</title>
        <Defs />
        {fig.draw}
      </svg>
      {note ? <p className="text-[10px] leading-snug text-faint">{note}</p> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   TASK 3 — COUNT
   ──────────────────────────────────────────────────────────────────── */

/**
 * One number, large, where the magnitude is the whole point.
 *
 * Tabular numerals per STYLE.md — a count that changes must not jitter.
 */
function Count({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="tnum font-mono text-[26px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </span>
      <span className="text-[10.5px] leading-none text-muted-slate">{unit}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

/**
 * The one entry point. Returns `null` for a shape we cannot draw truthfully —
 * a card with nothing true to show gets nothing, never a placeholder.
 */
export function ShapeView({
  shape,
  className,
}: {
  shape: Shape;
  className?: string;
}) {
  // A figure id we have no drawing for renders nothing at all. An empty
  // bordered box would claim there is a diagram here and then fail to show it.
  if (shape.kind === "figure" && !FIGURES[shape.id]) return null;

  return (
    <div className={cn("w-full", className)}>
      {shape.kind === "marks" ? (
        <Marks ids={shape.ids} note={shape.note} />
      ) : shape.kind === "figure" ? (
        <Figure id={shape.id} note={shape.note} />
      ) : (
        <Count value={shape.value} unit={shape.unit} />
      )}
    </div>
  );
}
