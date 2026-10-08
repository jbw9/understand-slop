import { z } from "zod";

/**
 * The map: a STORY an LLM writes for a codebase, plus the INDEX a machine
 * reads from the repo.
 *
 * In a real repo the two are separate files: `.slop/story.json` (written by
 * the /slop-map Claude Code skill, committed) and the index, rebuilt from the
 * code every time the map is served (lib/server/repo.ts merges them). The two
 * bundled demos in public/maps/ are already merged: one `MapFile` each.
 * `scripts/emit_schema.mjs` writes both shapes as JSON Schema
 * (public/maps/story.schema.json and map.schema.json).
 *
 * The split that matters: the LLM never writes code. Cards point at code by
 * symbol id (`code`) or snippet id (`source` blocks); the bodies, line ranges,
 * signatures and calls live in `index`, which is read from the repo, so a quote
 * can't be retyped wrong.
 */

export const State = z.enum(["derived", "partial", "inferred"]);
export const NodeKind = z.enum(["journey", "page", "element", "flow", "store", "module", "class", "function"]);

/* ── anatomy blocks: the shapes a card's body can take ───────────── */

export type AnatomyFile =
  | { kind: "schema"; table: string; rows: z.infer<typeof Column>[]; rel?: string[] }
  | { kind: "routes"; rows: z.infer<typeof Route>[] }
  | { kind: "flow"; rows: StepFile[] }
  | { kind: "facts"; rows: z.infer<typeof Pair>[] }
  | { kind: "bars"; unit: string; rows: z.infer<typeof Bar>[] }
  | { kind: "parts"; total: string; rows: z.infer<typeof Part>[] }
  | { kind: "chips"; caption?: string; rows: z.infer<typeof Chip>[] }
  | { kind: "map"; caption?: string; rows: MappingFile[] }
  | { kind: "source"; snippet?: string; symbol?: string; file?: string; at?: string; lines?: number; why?: string };
interface StepFile {
  n: number;
  title: string;
  detail: string;
  state: z.infer<typeof State>;
  under?: AnatomyFile[];
}
interface MappingFile {
  from: string;
  to: string;
  state: z.infer<typeof State>;
  under?: AnatomyFile[];
}

const Column = z.object({
  name: z.string(),
  type: z.string(),
  key: z.enum(["PK", "FK", "UQ"]).optional(),
  nullable: z.boolean().optional(),
  state: State,
  note: z.string().optional(),
});
const Route = z.object({
  method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
  path: z.string(),
  auth: z.string(),
  state: State,
  note: z.string().optional(),
});
const Pair = z.object({ label: z.string(), value: z.string(), state: State });
const Bar = z.object({ label: z.string(), value: z.number(), display: z.string(), state: State, note: z.string().optional() });
const Part = z.object({
  label: z.string(),
  weight: z.number(),
  display: z.string(),
  tone: z.enum(["hold", "vary"]).optional(),
  state: State,
});
const Chip = z.object({ label: z.string(), note: z.string().optional(), state: State });

export const Anatomy: z.ZodType<AnatomyFile> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("schema"), table: z.string(), rows: z.array(Column), rel: z.array(z.string()).optional() }),
    z.object({ kind: z.literal("routes"), rows: z.array(Route) }),
    z.object({
      kind: z.literal("flow"),
      rows: z.array(
        z.object({ n: z.number(), title: z.string(), detail: z.string(), state: State, under: z.array(Anatomy).optional() }),
      ),
    }),
    z.object({ kind: z.literal("facts"), rows: z.array(Pair) }),
    z.object({ kind: z.literal("bars"), unit: z.string(), rows: z.array(Bar) }),
    z.object({ kind: z.literal("parts"), total: z.string(), rows: z.array(Part) }),
    z.object({ kind: z.literal("chips"), caption: z.string().optional(), rows: z.array(Chip) }),
    z.object({
      kind: z.literal("map"),
      caption: z.string().optional(),
      rows: z.array(z.object({ from: z.string(), to: z.string(), state: State, under: z.array(Anatomy).optional() })),
    }),
    /**
     * Verbatim code, named one of three ways (exactly one per block):
     * `symbol` quotes a whole unit from the index; `file` + `at` + `lines`
     * quotes `lines` lines starting where `file` reads `at` (compared
     * trimmed; several lines joined by "\n" when one line isn't unique) —
     * for code that isn't a function, like a config block; `snippet` is a key into `index.snippets`, which is what the
     * other two become once the story is merged with the repo.
     */
    z.object({
      kind: z.literal("source"),
      snippet: z.string().optional(),
      symbol: z.string().optional(),
      file: z.string().optional(),
      at: z.string().optional(),
      lines: z.number().int().positive().optional(),
      why: z.string().optional(),
    }),
  ]),
);

/* ── the index: machine-filled from the repo ───────────────────── */

export const Lang = z.enum(["ts", "tsx", "rs", "text"]);

export const Symbol = z.object({
  kind: z.enum(["function", "class", "method"]),
  lang: Lang,
  file: z.string(),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  /** The head of the body, read as one line (see readSignature in lib/signature.ts). */
  signature: z.string(),
  /** Verbatim from `start` to `end`. */
  body: z.string(),
  /** False when only an excerpt of the unit is held. */
  complete: z.boolean().default(true),
  /** Other symbol ids this one calls, in order of first appearance. */
  calls: z.array(z.string()).default([]),
  /** For a method: the id of its class. */
  parent: z.string().nullable().default(null),
});

export const Snippet = z.object({
  file: z.string(),
  start: z.number().int().positive(),
  lang: Lang,
  body: z.string(),
});

/* ── the narrative: what an LLM writes ─────────────────────────── */

/** Narrative a card adds to a symbol it shows. */
const CodeNote = z.object({
  symbol: z.string(),
  /** Stable card id; defaults to `<owner>~<name>` (`<class card>.<name>` for a method). */
  id: z.string().optional(),
  sub: z.string().optional(),
  detail: z.string().optional(),
  state: State.optional(),
  alarm: z.boolean().optional(),
});

/**
 * A card's code: a symbol id, or one with its own id and narrative. A class's
 * methods (symbols whose `parent` is the class) become its child cards on
 * their own; `methods` only adds ids and narrative to some of them.
 */
export const CodeRef = z.union([
  z.string(),
  CodeNote.extend({ methods: z.array(CodeNote).optional() }),
]);

export const MapNode = z.object({
  id: z.string(),
  /** The card this one sits inside; null for a root (the surface). */
  parent: z.string().nullable(),
  kind: NodeKind.optional(),
  title: z.string(),
  /** One line, plain English. What this IS. */
  sub: z.string(),
  state: State,
  alarm: z.boolean().optional(),
  ghost: z.boolean().optional(),
  detail: z.string().optional(),
  evidence: z.string().optional(),
  anatomy: z.array(Anatomy).optional(),
  code: z.array(CodeRef).optional(),
});

export const MapEdge = z.object({
  /** Both ends are children of this card; null for edges between roots. */
  parent: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  state: State,
  alarm: z.boolean().optional(),
});

const RowRef = z.object({ node: z.string(), row: z.string() });
export const MapLink = z.object({
  from: RowRef,
  to: RowRef,
  label: z.string().optional(),
  state: State,
  alarm: z.boolean().optional(),
});

const Repo = z.object({
  name: z.string(),
  /** Filled in from git when the story is merged; a story need not say. */
  commit: z.string().default("—"),
  files: z.number().int().nonnegative().default(0),
  path: z.string().optional(),
});

export const Index = z.object({
  symbols: z.record(z.string(), Symbol).default({}),
  snippets: z.record(z.string(), Snippet).default({}),
});

/** What the /slop-map skill writes to `.slop/story.json`: no code, only ids. */
export const Story = z.object({
  version: z.literal(1),
  repo: Repo,
  nodes: z.array(MapNode),
  edges: z.array(MapEdge).default([]),
  links: z.array(MapLink).default([]),
});

/** A story with its index: what the loader reads. */
export const MapFile = Story.extend({
  index: Index,
  /** Warnings from merging the story with its repo (an ambiguous anchor, say). */
  notes: z.array(z.string()).default([]),
});

export type StoryT = z.infer<typeof Story>;
export type MapFileT = z.infer<typeof MapFile>;
export type SnippetT = z.infer<typeof Snippet>;
export type MapNodeT = z.infer<typeof MapNode>;
export type SymbolT = z.infer<typeof Symbol>;
