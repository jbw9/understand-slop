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
};

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
        className="block h-auto rounded-[10px] border border-border-gray bg-surface-container-low/40"
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
