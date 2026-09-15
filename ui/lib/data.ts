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
}

export type Anatomy =
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
  | Source;

export interface Node {
  id: string;
  title: string;
  /** One line, plain English. What this IS — never a file path. */
  sub: string;
  state: State;
  alarm?: boolean;
  ghost?: boolean;
  col: number;
  row: number;
  /** Sentence shown when the node is focused, before you go deeper. */
  detail?: string;
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
}

export interface Edge {
  from: string;
  to: string;
  state: State;
  alarm?: boolean;
  label?: string;
}

export const RUN = {
  command: "understand-slop map .",
  repo: "acme/platform",
  commit: "4d91e07",
  files: 612,
  elapsed: "6.4s",
};

/* ── level 0 — what the product DOES ──────────────────────────
   Cut by product step, not by architectural layer. The layer cut
   ("API surface", "Database", "Background work") names things a developer
   already knows exist; it says nothing about what this particular product is,
   so every card reads the same and none of them is a question anyone asked.
   Read left to right, this is the path a customer actually takes.

   The grouping itself is `inferred` and every card says so. Which files
   constitute "Getting files in" is a judgement call made from naming and
   layout — it is not something a compiler resolved, and it is the least
   certain thing on this screen. What sits UNDER each card is derived; the
   boxes drawn around them are not. */

export const L0: Node[] = [
  {
    id: "signin",
    title: "Getting in",
    sub: "Signing in and staying signed in",
    state: "inferred",
    col: 0,
    row: 0,
    detail:
      "Email magic links and Google OAuth. A session is a JWT in an httpOnly cookie, checked by middleware on every /app and /api request — and never revocable once issued.",
    evidence: "src/lib/auth/*.ts, src/app/api/auth/",
  },
  {
    id: "workspace",
    title: "Joining a workspace",
    sub: "Orgs, invites, and who may do what",
    state: "inferred",
    col: 0,
    row: 1,
    detail:
      "Everything belongs to an org. A user can be in several with a different role in each, and three roles nest: member, then admin, then owner.",
    evidence: "src/lib/auth/rbac.ts, drizzle/schema.ts:31",
  },
  {
    id: "projects",
    title: "Making a project",
    sub: "The thing customers actually create",
    state: "inferred",
    col: 1,
    row: 0,
    detail:
      "The core object. A project belongs to one org, holds uploaded files, and is edited by members. Creating one checks the org's plan first.",
    evidence: "src/server/projects/*.ts",
  },
  {
    id: "uploads",
    title: "Getting files in",
    sub: "Upload straight to storage",
    state: "inferred",
    col: 1,
    row: 1,
    detail:
      "The browser asks for a presigned URL and PUTs the bytes to S3 itself. The app server never touches the file, only the key.",
    evidence: "src/server/storage/s3.ts, src/app/api/projects/[id]/files/",
  },
  {
    id: "processing",
    title: "Processing after upload",
    sub: "What happens once you stop looking",
    state: "inferred",
    col: 2,
    row: 0,
    detail:
      "BullMQ on Redis. Thumbnails, reindexing, and emails run after the response. 7 of 9 job types resolve statically; 2 do not.",
    evidence: "src/server/jobs/handlers.ts:77",
  },
  {
    id: "billing",
    title: "Paying for it",
    sub: "Plans, and what a plan unlocks",
    state: "inferred",
    col: 2,
    row: 1,
    detail:
      "Stripe Checkout for purchase, webhooks for state. An org's plan gates seat count and project limits — so this reaches back into everything above it.",
    evidence: "src/server/billing/*.ts",
  },
  {
    id: "db",
    title: "Where it all lands",
    sub: "Postgres — 14 tables",
    state: "derived",
    col: 3,
    row: 0,
    // The one card that is NOT a product step, and is marked `derived` rather
    // than `inferred` because nothing was grouped to produce it — the tables
    // are read straight out of the schema. Every step above writes here, so it
    // reads as the floor they all stand on rather than a sixth step.
    detail:
      "Postgres via Drizzle. 14 tables, 9 carrying an org_id for tenant isolation. Migrations are checked in and sequential.",
    evidence: "drizzle/schema.ts, drizzle/migrations/",
  },
  {
    id: "storage",
    title: "File storage",
    sub: "Uploads and generated assets",
    state: "partial",
    col: 3,
    row: 1,
    // Carries what the collapsed S3 capability card used to say. A level was
    // removed here, so its content had to move up rather than disappear —
    // including the finding, which is the part that would have been easiest to
    // lose and the only part anyone needs to act on.
    detail:
      "One bucket, acme-platform-uploads, behind presigned URLs — the browser uploads directly and the server only ever sees the key. Public access is blocked and every read is presigned with a 60s expiry. No lifecycle rule exists in this repo, and an upload the client never confirms leaves an object nothing points at.",
    evidence: "src/server/storage/s3.ts",
  },
  {
    id: "obs",
    title: "Observability",
    sub: "Not found in this repo",
    state: "inferred",
    ghost: true,
    col: 4,
    row: 1,
    detail:
      "No tracing, metrics, or structured logging library is imported anywhere. Either it lives in infrastructure outside this repo, or it does not exist.",
    evidence: "no match for otel|datadog|sentry in package.json",
  },
];

/* The customer's path, plus the two places it reaches sideways. A layer cut
   drew "client → api → db", which is true of almost every web application and
   therefore says nothing about this one. These edges say what happens next. */
export const E0: Edge[] = [
  { from: "signin", to: "workspace", state: "derived", label: "lands you in" },
  { from: "workspace", to: "projects", state: "derived", label: "scopes" },
  { from: "projects", to: "uploads", state: "derived", label: "holds" },
  { from: "uploads", to: "processing", state: "derived", label: "triggers" },
  { from: "uploads", to: "storage", state: "derived", label: "bytes go to" },
  // Billing is not a step in the path — it gates two of the steps above it,
  // which is the whole reason a plan change can break project creation.
  { from: "billing", to: "workspace", state: "derived", label: "gates seats" },
  { from: "billing", to: "projects", state: "derived", label: "gates limits" },
  // Everything lands in the same place.
  { from: "signin", to: "db", state: "derived" },
  { from: "workspace", to: "db", state: "derived" },
  { from: "projects", to: "db", state: "derived" },
  { from: "billing", to: "db", state: "derived" },
  { from: "processing", to: "db", state: "partial", label: "2 handlers unresolved" },
  { from: "processing", to: "storage", state: "derived" },
];

/* ── level 1 — capabilities inside each domain ────────────── */

export const L1: Record<string, Node[]> = {
  signin: [
    {
      id: "auth-signin",
      title: "Sign in",
      sub: "Magic link · Google OAuth",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/app/api/auth/magic-link/route.ts",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "POST /api/auth/magic-link", detail: "Email submitted. Rate limited to 5 per hour per address.", state: "derived" },
            { n: 2, title: "Token minted and stored", detail: "32-byte random token, SHA-256 hashed into auth_tokens, 15 minute expiry.", state: "derived" },
            { n: 3, title: "Email sent via Resend", detail: "Link points at /auth/verify?token=…", state: "derived" },
            { n: 4, title: "GET /auth/verify", detail: "Token looked up by hash, marked used, session JWT set as httpOnly cookie.", state: "derived" },
            { n: 5, title: "Redirect to /app", detail: "Or to the ?next= param if it is a same-origin path.", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "auth-session",
      title: "Sessions",
      sub: "JWT cookie, 30 day sliding expiry",
      state: "derived",
      col: 0,
      row: 1,
      evidence: "src/lib/auth/session.ts:22",
      anatomy: [
        // A session is a token with a LIFECYCLE, not a bag of properties. As a
        // label/value list its most important fact — that the last step never
        // happens — sat in row five looking like a spec detail. As a sequence,
        // the missing end of the path is the thing you see.
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Minted at verify", detail: "HS256 over sub, org_id, role, iat, exp. Secret from AUTH_SECRET.", state: "derived" },
            { n: 2, title: "Set as a cookie", detail: "httpOnly, Secure, SameSite=Lax. Never readable from JavaScript.", state: "derived" },
            { n: 3, title: "Read on every request", detail: "Middleware verifies the signature and reads org_id and role off the claims.", state: "derived" },
            { n: 4, title: "Refreshed in place", detail: "30 day expiry, pushed forward on each request — an active session never ends.", state: "derived" },
            { n: 5, title: "Revoked — never", detail: "There is no revocation path. A stolen token stays valid until it expires.", state: "partial" },
          ],
        },
      ],
    },
  ],
  // The role hierarchy moved here from the old auth grouping. Signing in and
  // being allowed to do something are different questions asked at different
  // moments, and filing them together is a layer-cut habit.
  workspace: [
    {
      id: "auth-rbac",
      title: "Permissions",
      sub: "3 roles · checked in 28 places",
      state: "partial",
      col: 0,
      row: 0,
      detail:
        "owner / admin / member, checked by a requireRole helper. 4 handlers query the org directly instead of using it.",
      evidence: "src/lib/auth/rbac.ts:31",
      anatomy: [
        // Roles nest: each one is the one below it plus more. Rendered as three
        // sibling label/value rows that relationship was invisible — you had to
        // read all three and work it out. As a sequence it reads in one glance,
        // and the handlers that skip the check land at the end as the finding
        // they are, rather than as a fourth peer role.
        {
          kind: "flow",
          rows: [
            { n: 1, title: "member", detail: "Read and write the projects they are on. The floor — every role has this.", state: "derived" },
            { n: 2, title: "admin", detail: "Everything a member can do, plus invite and remove members and act on any project.", state: "derived" },
            { n: 3, title: "owner", detail: "Everything an admin can do, plus billing, deleting the org, and transferring ownership.", state: "derived" },
            { n: 4, title: "4 handlers skip this", detail: "They query the org row directly instead of calling requireRole. Inconsistent — not necessarily wrong, but nothing records why.", state: "partial" },
          ],
        },
      ],
    },
  ],
  billing: [
    {
      id: "bill-checkout",
      title: "Checkout",
      sub: "Stripe hosted, 3 plans",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/app/api/billing/checkout/route.ts:22",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "POST /api/billing/checkout", detail: "Body names a price ID. Caller must be org owner.", state: "derived" },
            { n: 2, title: "Session created at Stripe", detail: "checkout.sessions.create with client_reference_id = org_id.", state: "derived" },
            { n: 3, title: "Browser redirected to Stripe", detail: "Card details never touch this server.", state: "derived" },
            { n: 4, title: "Webhook confirms", detail: "checkout.session.completed writes the subscription row.", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "bill-subs",
      title: "Subscriptions",
      sub: "Plan state and entitlements",
      state: "derived",
      col: 0,
      row: 1,
      evidence: "drizzle/schema.ts:140",
      anatomy: [
        {
          kind: "schema",
          table: "subscriptions",
          rows: [
            { name: "id", type: "uuid", key: "PK", state: "derived" },
            { name: "org_id", type: "uuid", key: "FK", state: "derived", note: "→ organizations.id, unique" },
            { name: "stripe_subscription_id", type: "text", key: "UQ", state: "derived" },
            { name: "status", type: "enum", state: "derived", note: "active · past_due · canceled · trialing" },
            { name: "plan", type: "enum", state: "derived", note: "free · team · enterprise" },
            { name: "seats", type: "integer", state: "derived" },
            { name: "current_period_end", type: "timestamptz", state: "derived" },
            { name: "canceled_at", type: "timestamptz", nullable: true, state: "derived" },
          ],
          rel: [
            "One row per org (org_id is unique) — an org cannot hold two plans.",
            "Read on every request through the entitlements cache, not joined per query.",
          ],
        },
      ],
    },
    {
      id: "bill-hooks",
      title: "Stripe webhooks",
      sub: "6 events handled",
      state: "partial",
      alarm: true,
      col: 0,
      row: 2,
      detail:
        "The handler is behind the global rate limiter. Stripe retries from a rotating IP pool, so a burst can be 429'd — and Stripe counts a 429 as a failed delivery.",
      evidence: "src/middleware.ts:71",
      anatomy: [
        // Inbound events, each with an effect — the same shape as a route
        // table, which is what these are in everything but transport. Row keys
        // are the event names, unchanged, because four wires land on them.
        {
          kind: "facts",
          rows: [
            { label: "checkout.session.completed", value: "Creates the subscription row", state: "derived" },
            { label: "customer.subscription.updated", value: "Updates status, seats, period end", state: "derived" },
            { label: "customer.subscription.deleted", value: "Marks canceled, downgrades to free", state: "derived" },
            { label: "invoice.payment_failed", value: "Sets past_due, enqueues dunning email", state: "derived" },
            { label: "Signature check", value: "stripe.webhooks.constructEvent — correct", state: "derived" },
            { label: "Rate limited", value: "Yes, by IP — no call edge proves it, matched from the middleware glob", state: "partial" },
          ],
        },
      ],
    },
  ],
  db: [
    {
      id: "db-orgs",
      title: "Organizations & members",
      sub: "Tenancy lives here",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "drizzle/schema.ts:31",
      anatomy: [
        {
          kind: "schema",
          table: "organizations",
          rows: [
            { name: "id", type: "uuid", key: "PK", state: "derived" },
            { name: "name", type: "text", state: "derived" },
            { name: "slug", type: "text", key: "UQ", state: "derived" },
            { name: "api_key_hash", type: "text", nullable: true, state: "derived", note: "SHA-256, looked up on every x-api-key request" },
            { name: "created_at", type: "timestamptz", state: "derived" },
          ],
        },
        {
          kind: "schema",
          table: "memberships",
          rows: [
            { name: "user_id", type: "uuid", key: "PK", state: "derived", note: "composite with org_id" },
            { name: "org_id", type: "uuid", key: "PK", state: "derived" },
            { name: "role", type: "enum", state: "derived", note: "owner · admin · member" },
            { name: "invited_by", type: "uuid", nullable: true, key: "FK", state: "derived" },
          ],
          rel: [
            "Join table: a user can belong to many orgs with a different role in each.",
            "9 of 14 tables carry org_id. Isolation is enforced in application code, not by row-level security.",
          ],
        },
      ],
    },
    // Users sits next to Organizations because three of the five foreign keys
    // run between those two tables (user_id, invited_by, created_by). Ordering
    // them apart forced every one of those wires to traverse the whole diagram
    // and cut through whatever card sat in the middle — a layout problem that
    // no amount of elbow routing can solve.
    {
      id: "db-users",
      title: "Users & tokens",
      sub: "Accounts and auth material",
      state: "derived",
      col: 0,
      row: 1,
      evidence: "drizzle/schema.ts:12",
      anatomy: [
        {
          kind: "schema",
          table: "users",
          rows: [
            { name: "id", type: "uuid", key: "PK", state: "derived" },
            { name: "email", type: "citext", key: "UQ", state: "derived" },
            { name: "name", type: "text", nullable: true, state: "derived" },
            { name: "avatar_url", type: "text", nullable: true, state: "derived" },
            { name: "last_seen_at", type: "timestamptz", nullable: true, state: "derived" },
          ],
          rel: [
            "No password column — authentication is magic link or OAuth only.",
            "auth_tokens holds single-use magic link hashes with a 15 minute expiry.",
          ],
        },
      ],
    },
    {
      id: "db-projects",
      title: "Projects & files",
      sub: "The core domain tables",
      state: "derived",
      col: 0,
      row: 2,
      evidence: "drizzle/schema.ts:78",
      anatomy: [
        {
          kind: "schema",
          table: "projects",
          rows: [
            { name: "id", type: "uuid", key: "PK", state: "derived" },
            { name: "org_id", type: "uuid", key: "FK", state: "derived", note: "→ organizations.id" },
            { name: "name", type: "text", state: "derived" },
            { name: "status", type: "enum", state: "derived", note: "draft · active · archived" },
            { name: "created_by", type: "uuid", key: "FK", state: "derived" },
            { name: "settings", type: "jsonb", state: "partial", note: "No schema on this column — shape is whatever was written" },
            { name: "deleted_at", type: "timestamptz", nullable: true, state: "derived", note: "Soft delete; 3 queries forget to filter it" },
          ],
          rel: [
            "project_files holds one row per upload, pointing at an S3 key.",
            "Soft-deleted projects are still returned by 3 queries that omit the deleted_at filter.",
          ],
        },
      ],
    },
  ],
  // Was `api`. The route table did not move — it was re-filed under the step
  // whose requests it serves, next to the write path those routes call into.
  // Grouping every handler together because they share a directory is the
  // layer cut in miniature: it puts "POST /api/projects" further from the code
  // that creates a project than from a Stripe webhook.
  //
  // This key holds the whole of one product step: the routes that come in, the
  // service code they call, and the pages that call them. Under the layer cut
  // those three sat in three different domains.
  projects: [
    {
      id: "api-projects",
      title: "Project endpoints",
      sub: "18 routes",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/app/api/projects/",
      anatomy: [
        {
          kind: "routes",
          rows: [
            { method: "GET", path: "/api/projects", auth: "session", state: "derived", note: "Scoped to the caller's org" },
            { method: "POST", path: "/api/projects", auth: "session + admin", state: "derived" },
            { method: "GET", path: "/api/projects/[id]", auth: "session + membership", state: "derived" },
            { method: "PATCH", path: "/api/projects/[id]", auth: "session + admin", state: "derived" },
            { method: "DELETE", path: "/api/projects/[id]", auth: "session + owner", state: "partial", note: "Bypassed when x-internal-token matches — no comment, no test" },
            { method: "POST", path: "/api/projects/[id]/files", auth: "session", state: "derived", note: "Returns a presigned S3 PUT" },
          ],
        },
      ],
    },
    {
      id: "proj-crud",
      title: "Create & edit",
      sub: "The main write path",
      state: "derived",
      col: 0,
      row: 1,
      evidence: "src/server/projects/service.ts",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Validate with zod", detail: "Rejects before touching the database.", state: "derived" },
            { n: 2, title: "Check entitlement", detail: "Project count against the org's plan limit.", state: "derived" },
            { n: 3, title: "Insert row", detail: "org_id taken from the session, never from the body.", state: "derived" },
            { n: 4, title: "Enqueue reindex", detail: "Fire-and-forget; failure is logged, not surfaced.", state: "partial" },
          ],
        },
      ],
    },
    // The pages that drive this step. An "App shell" card listing every page in
    // the product answered "what pages exist", which nobody asks; filed against
    // the step they serve, the same four routes answer "how do I get here".
    {
      id: "cl-app",
      title: "Pages that drive this",
      sub: "4 of the 11 authed pages",
      state: "derived",
      col: 0,
      row: 2,
      detail:
        "Server Components throughout; 4 client components use SWR. Every page below sits behind the session check.",
      evidence: "src/app/(app)/",
      anatomy: [
        // These are pages, so they render as the route table they are. The
        // "Data fetching" row that used to sit among them was a different kind
        // of fact wearing the same clothes — it moved up into `detail`.
        {
          kind: "routes",
          rows: [
            { method: "GET", path: "/app", auth: "session", state: "derived", note: "Project list" },
            { method: "GET", path: "/app/projects/[id]", auth: "session + membership", state: "derived", note: "Project detail and editor" },
            { method: "GET", path: "/app/settings/members", auth: "session + admin", state: "derived", note: "Invite and role management" },
            { method: "GET", path: "/app/settings/billing", auth: "session + owner", state: "derived", note: "Plan and invoices" },
          ],
        },
      ],
    },
  ],
  // Was `jobs`. Inbound webhooks live here rather than with the other route
  // files: an event arriving from Stripe with nobody watching is the same kind
  // of thing as a queued job, and a different kind of thing from a page
  // request. Filing it by directory put it next to the project routes, which
  // is where it looked least like what it is.
  processing: [
    {
      id: "api-webhooks",
      title: "Inbound webhooks",
      sub: "3 routes · signature auth",
      state: "partial",
      alarm: true,
      col: 0,
      row: 0,
      detail: "These are the only routes without a session. They authenticate by signature — and they sit behind the IP rate limiter.",
      evidence: "src/app/api/webhooks/",
      anatomy: [
        {
          kind: "routes",
          rows: [
            { method: "POST", path: "/api/webhooks/stripe", auth: "Stripe signature", state: "partial", note: "Rate limited by IP — Stripe retries from rotating IPs" },
            { method: "POST", path: "/api/webhooks/resend", auth: "Svix signature", state: "derived", note: "Delivery and bounce events" },
            { method: "POST", path: "/api/webhooks/github", auth: "HMAC sha256", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "jobs-queue",
      title: "Queue & dispatch",
      sub: "BullMQ · 9 types, 7 resolved",
      state: "partial",
      col: 0,
      row: 1,
      detail:
        "JOB_HANDLERS is indexed by a runtime job.type string, so the reachable set is not statically closed.",
      evidence: "src/server/jobs/handlers.ts:77",
      anatomy: [
        {
          kind: "facts",
          rows: [
            { label: "sendWelcomeEmail", value: "Resolved", state: "derived" },
            { label: "syncStripeCustomer", value: "Resolved", state: "derived" },
            { label: "reconcileInvoices", value: "Resolved", state: "derived" },
            { label: "expireTrials", value: "Resolved", state: "derived" },
            { label: "generateThumbnail", value: "Resolved", state: "derived" },
            { label: "reindexProject", value: "Resolved", state: "derived" },
            { label: "sendDunningEmail", value: "Resolved", state: "derived" },
            { label: "2 more", value: "Registered at module load by register-billing.ts:14 — names are a guess", state: "inferred" },
          ],
        },
      ],
    },
  ],
  // Was folded in with project CRUD. Upload is its own step in the product —
  // it is the one place bytes leave the browser, and the one place an orphan
  // can be created — so it gets its own card rather than being a second row
  // under "Create & edit".
  uploads: [
    {
      id: "proj-uploads",
      title: "File uploads",
      sub: "Direct to S3",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/server/storage/s3.ts:44",
      anatomy: [
        {
          kind: "flow",
          rows: [
            { n: 1, title: "Client asks for a URL", detail: "POST /api/projects/[id]/files with filename and content type.", state: "derived" },
            { n: 2, title: "Server presigns a PUT", detail: "5 minute expiry, key is org/{org_id}/project/{id}/{uuid}.", state: "derived" },
            { n: 3, title: "Browser PUTs to S3", detail: "Bytes never pass through the app server.", state: "derived" },
            { n: 4, title: "Client confirms", detail: "Row written to project_files. An upload that is never confirmed leaves an orphan object.", state: "partial" },
          ],
        },
      ],
    },
  ],
  // Collapsed deliberately. "File storage" contained exactly one capability
  // card, "S3 bucket", whose anatomy was five unrelated assertions — a level
  // that existed only so there would be a level. Everything it said that was
  // worth saying now sits on the domain card itself, one click earlier. If a
  // second storage capability ever appears, this comes back.
  storage: [],
  obs: [],
};

export const E1: Record<string, Edge[]> = {
  signin: [
    { from: "auth-signin", to: "auth-session", state: "derived", label: "issues" },
  ],
  // auth-session → auth-rbac used to live here. It now crosses a domain
  // boundary (Getting in → Joining a workspace), and E1 only draws edges
  // WITHIN one open domain — so it would render as a wire to nothing. The
  // relationship still exists; it is carried by the row-level LINKS instead.
  workspace: [],
  billing: [
    { from: "bill-checkout", to: "bill-hooks", state: "derived", label: "confirms via" },
    { from: "bill-hooks", to: "bill-subs", state: "derived", label: "writes" },
  ],
  // Intentionally empty. Every edge worth drawing between these three cards is
  // a foreign key, and the FK wires say it precisely — they land on the exact
  // column. A card-level "db-orgs → db-projects (org_id)" alongside a row-level
  // "projects.org_id → organizations.id" is the same fact drawn twice, once
  // vaguely, and the vague copy is the one that cuts across the middle card.
  db: [],
  // The api-projects → api-webhooks edge is gone with the layer cut. It was
  // `inferred` and said only "these two route files sit near each other",
  // which was an artifact of grouping by directory rather than by what the
  // product does. Under the product cut they are in different steps and the
  // edge has nothing to say.
  processing: [],
  // proj-crud → proj-uploads also crosses a boundary now (Making a project →
  // Getting files in), so it moves to E0 as projects → uploads.
  projects: [],
  uploads: [],
  storage: [],
  obs: [],
};

/** Questions the analysis could not answer. Surfaced, never hidden. */
export const OPEN = [
  {
    kind: "dynamic dispatch",
    at: "src/server/jobs/handlers.ts:77",
    text: "Two job types are registered at module load, so the set of reachable handlers is not statically closed.",
    node: "processing",
  },
  {
    kind: "framework callback",
    at: "src/middleware.ts:71",
    text: "The matcher glob '/api/:path*' sweeps in the Stripe webhook. Next registers middleware itself, so no call edge proves which routes are fronted.",
    node: "billing",
  },
  {
    kind: "untyped column",
    at: "drizzle/schema.ts:96",
    text: "projects.settings is jsonb with no schema. Its shape is whatever has been written to it.",
    node: "db",
  },
  {
    kind: "no rationale",
    at: "src/lib/auth/rbac.ts:31",
    text: "4 handlers query the org directly instead of calling requireRole. Whether that is deliberate is not recorded anywhere.",
    node: "workspace",
  },
  {
    kind: "absent",
    at: "package.json",
    text: "No observability library is imported. Either it lives outside this repo or it does not exist.",
    node: "obs",
  },
];

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

/** Stable id for an anatomy row, so a wire can anchor to it. */
export function rowId(owner: string, key: string | number) {
  return `${owner}:${key}`;
}

export const LINKS: Link[] = [
  // Foreign keys — the classic thing you trace through a schema.
  { from: rowId("bill-subs", "org_id"), to: rowId("db-orgs", "id"), state: "derived", label: "FK" },
  { from: rowId("db-projects", "org_id"), to: rowId("db-orgs", "id"), state: "derived", label: "FK" },
  { from: rowId("db-projects", "created_by"), to: rowId("db-users", "id"), state: "derived", label: "FK" },
  { from: rowId("db-orgs", "user_id"), to: rowId("db-users", "id"), state: "derived", label: "FK" },
  { from: rowId("db-orgs", "org_id"), to: rowId("db-orgs", "id"), state: "derived", label: "FK" },
  { from: rowId("db-orgs", "invited_by"), to: rowId("db-users", "id"), state: "derived", label: "FK" },

  // Write paths — which step writes which column.
  { from: rowId("bill-checkout", 4), to: rowId("bill-subs", "stripe_subscription_id"), state: "derived", label: "writes" },
  { from: rowId("bill-hooks", "checkout.session.completed"), to: rowId("bill-subs", "status"), state: "derived", label: "writes" },
  { from: rowId("bill-hooks", "customer.subscription.updated"), to: rowId("bill-subs", "seats"), state: "derived", label: "writes" },
  { from: rowId("bill-hooks", "customer.subscription.updated"), to: rowId("bill-subs", "current_period_end"), state: "derived", label: "writes" },
  { from: rowId("bill-hooks", "customer.subscription.deleted"), to: rowId("bill-subs", "canceled_at"), state: "derived", label: "writes" },

  // Reads — an auth claim read out of a column. Both endpoints moved when the
  // session card became a lifecycle: "Claims" is now step 1 (minted, where the
  // claims are written) and "Transport" is step 2 (set as a cookie).
  { from: rowId("auth-session", 1), to: rowId("db-orgs", "role"), state: "derived", label: "reads" },
  { from: rowId("auth-signin", 2), to: rowId("db-users", "email"), state: "derived", label: "looks up" },
  { from: rowId("auth-signin", 4), to: rowId("auth-session", 2), state: "derived", label: "sets" },

  // Routes into the write path.
  { from: rowId("api-projects", "POST /api/projects"), to: rowId("proj-crud", 1), state: "derived", label: "handled by" },
  { from: rowId("proj-crud", 3), to: rowId("db-projects", "org_id"), state: "derived", label: "writes" },
  { from: rowId("proj-crud", 4), to: rowId("jobs-queue", "reindexProject"), state: "derived", label: "enqueues" },
  { from: rowId("api-projects", "POST /api/projects/[id]/files"), to: rowId("proj-uploads", 2), state: "derived", label: "handled by" },
  { from: rowId("proj-uploads", 4), to: rowId("db-projects", "settings"), state: "partial", label: "unconfirmed uploads orphan" },

  // The alarming one: the webhook route is swept in by the middleware glob.
  { from: rowId("api-webhooks", "POST /api/webhooks/stripe"), to: rowId("bill-hooks", "Rate limited"), state: "partial", alarm: true, label: "rate limited by IP" },

  // The storage level collapsed, taking `st-s3:Key layout` with it. The link it
  // anchored was the weakest in the fixture — an `inferred` guess that an S3
  // key string contains a project id, drawn from naming alone. Re-pointing it
  // at the domain card would have preserved a wire by making it vaguer, which
  // is the trade this whole pass exists to stop making.
];

/** Every link touching a row, in both directions. */
export function linksFor(id: string) {
  return LINKS.filter((l) => l.from === id || l.to === id);
}
