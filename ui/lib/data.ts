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

export type Anatomy =
  | { kind: "schema"; table: string; rows: Column[]; rel?: string[] }
  | { kind: "routes"; rows: Route[] }
  | { kind: "flow"; rows: Step[] }
  | { kind: "facts"; rows: Pair[] };

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

/* ── level 0 — the domains ────────────────────────────────── */

export const L0: Node[] = [
  {
    id: "client",
    title: "Web client",
    sub: "What users see and click",
    state: "derived",
    col: 0,
    row: 0,
    detail:
      "Next.js App Router. 34 pages, of which 11 are behind auth and 4 are admin-only.",
    evidence: "app/**/page.tsx",
  },
  {
    id: "auth",
    title: "Auth & identity",
    sub: "Who you are, what you may do",
    state: "derived",
    col: 0,
    row: 1,
    detail:
      "Email magic links and Google OAuth. Sessions are JWTs in an httpOnly cookie, checked by middleware on every /app and /api request.",
    evidence: "src/lib/auth/*.ts",
  },
  {
    id: "api",
    title: "API surface",
    sub: "How the client talks to the server",
    state: "derived",
    col: 1,
    row: 0,
    detail:
      "41 route handlers under /api. All but 3 require a session; those 3 are webhooks authenticated by signature instead.",
    evidence: "src/app/api/**/route.ts",
  },
  {
    id: "billing",
    title: "Billing",
    sub: "Plans, payment, and what a plan unlocks",
    state: "derived",
    col: 1,
    row: 1,
    detail:
      "Stripe Checkout for purchase, webhooks for state. An org's plan gates seat count and project limits.",
    evidence: "src/server/billing/*.ts",
  },
  {
    id: "projects",
    title: "Projects",
    sub: "The thing customers actually make",
    state: "derived",
    col: 2,
    row: 0,
    detail:
      "The core domain object. A project belongs to one org, holds uploaded files, and is edited by members with a role.",
    evidence: "src/server/projects/*.ts",
  },
  {
    id: "db",
    title: "Database",
    sub: "Postgres — 14 tables",
    state: "derived",
    col: 2,
    row: 1,
    detail:
      "Postgres via Drizzle. 14 tables, 9 with an org_id for tenant isolation. Migrations are checked in and sequential.",
    evidence: "drizzle/schema.ts, drizzle/migrations/",
  },
  {
    id: "jobs",
    title: "Background work",
    sub: "What happens after the response",
    state: "partial",
    col: 3,
    row: 0,
    detail:
      "BullMQ on Redis. 9 job types, of which 7 resolve statically; 2 are registered at module load and cannot be traced from the queue.",
    evidence: "src/server/jobs/handlers.ts:77",
  },
  {
    id: "storage",
    title: "File storage",
    sub: "Uploads and generated assets",
    state: "derived",
    col: 3,
    row: 1,
    detail:
      "S3 behind presigned URLs. The browser uploads directly; the server only ever sees the key.",
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

export const E0: Edge[] = [
  { from: "client", to: "api", state: "derived", label: "fetch" },
  { from: "client", to: "auth", state: "derived", label: "session" },
  { from: "api", to: "auth", state: "derived", label: "guards" },
  { from: "api", to: "billing", state: "derived" },
  { from: "api", to: "projects", state: "derived" },
  { from: "billing", to: "db", state: "derived" },
  { from: "projects", to: "db", state: "derived" },
  { from: "auth", to: "db", state: "derived" },
  { from: "projects", to: "jobs", state: "derived", label: "enqueue" },
  { from: "projects", to: "storage", state: "derived" },
  { from: "jobs", to: "db", state: "partial", label: "2 handlers unresolved" },
  { from: "jobs", to: "storage", state: "derived" },
];

/* ── level 1 — capabilities inside each domain ────────────── */

export const L1: Record<string, Node[]> = {
  auth: [
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
        {
          kind: "facts",
          rows: [
            { label: "Transport", value: "httpOnly, Secure, SameSite=Lax cookie", state: "derived" },
            { label: "Algorithm", value: "HS256, secret from AUTH_SECRET", state: "derived" },
            { label: "Lifetime", value: "30 days, refreshed on each request", state: "derived" },
            { label: "Claims", value: "sub, org_id, role, iat, exp", state: "derived" },
            { label: "Revocation", value: "None — a stolen token is valid until expiry", state: "derived" },
          ],
        },
      ],
    },
    {
      id: "auth-rbac",
      title: "Permissions",
      sub: "3 roles · checked in 28 places",
      state: "partial",
      col: 0,
      row: 2,
      detail:
        "owner / admin / member, checked by a requireRole helper. 4 handlers query the org directly instead of using it.",
      evidence: "src/lib/auth/rbac.ts:31",
      anatomy: [
        {
          kind: "facts",
          rows: [
            { label: "owner", value: "Billing, delete org, transfer ownership", state: "derived" },
            { label: "admin", value: "Invite and remove members, all project actions", state: "derived" },
            { label: "member", value: "Read and write projects they are on", state: "derived" },
            { label: "Bypasses requireRole", value: "4 handlers — inconsistent, not necessarily wrong", state: "partial" },
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
    {
      id: "db-projects",
      title: "Projects & files",
      sub: "The core domain tables",
      state: "derived",
      col: 0,
      row: 1,
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
    {
      id: "db-users",
      title: "Users & tokens",
      sub: "Accounts and auth material",
      state: "derived",
      col: 0,
      row: 2,
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
  ],
  api: [
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
      id: "api-webhooks",
      title: "Inbound webhooks",
      sub: "3 routes · signature auth",
      state: "partial",
      alarm: true,
      col: 0,
      row: 1,
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
  ],
  jobs: [
    {
      id: "jobs-queue",
      title: "Queue & dispatch",
      sub: "BullMQ · 9 types, 7 resolved",
      state: "partial",
      col: 0,
      row: 0,
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
  projects: [
    {
      id: "proj-crud",
      title: "Create & edit",
      sub: "The main write path",
      state: "derived",
      col: 0,
      row: 0,
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
    {
      id: "proj-uploads",
      title: "File uploads",
      sub: "Direct to S3",
      state: "derived",
      col: 0,
      row: 1,
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
  client: [
    {
      id: "cl-app",
      title: "App shell",
      sub: "11 authed pages",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/app/(app)/",
      anatomy: [
        {
          kind: "facts",
          rows: [
            { label: "/app", value: "Project list", state: "derived" },
            { label: "/app/projects/[id]", value: "Project detail and editor", state: "derived" },
            { label: "/app/settings/members", value: "Invite and role management", state: "derived" },
            { label: "/app/settings/billing", value: "Plan and invoices", state: "derived" },
            { label: "Data fetching", value: "Server Components; 4 client components use SWR", state: "derived" },
          ],
        },
      ],
    },
  ],
  storage: [
    {
      id: "st-s3",
      title: "S3 bucket",
      sub: "Presigned access only",
      state: "derived",
      col: 0,
      row: 0,
      evidence: "src/server/storage/s3.ts",
      anatomy: [
        {
          kind: "facts",
          rows: [
            { label: "Bucket", value: "acme-platform-uploads", state: "derived" },
            { label: "Key layout", value: "org/{org_id}/project/{project_id}/{uuid}", state: "derived" },
            { label: "Public access", value: "Blocked — every read is presigned, 60s expiry", state: "derived" },
            { label: "Lifecycle rule", value: "None found in this repo", state: "inferred" },
            { label: "Orphans", value: "Unconfirmed uploads are never cleaned up", state: "partial" },
          ],
        },
      ],
    },
  ],
  obs: [],
};

export const E1: Record<string, Edge[]> = {
  auth: [
    { from: "auth-signin", to: "auth-session", state: "derived", label: "issues" },
    { from: "auth-session", to: "auth-rbac", state: "derived", label: "claims" },
  ],
  billing: [
    { from: "bill-checkout", to: "bill-hooks", state: "derived", label: "confirms via" },
    { from: "bill-hooks", to: "bill-subs", state: "derived", label: "writes" },
  ],
  db: [
    { from: "db-orgs", to: "db-projects", state: "derived", label: "org_id" },
    { from: "db-orgs", to: "db-users", state: "derived", label: "memberships" },
  ],
  api: [{ from: "api-projects", to: "api-webhooks", state: "inferred" }],
  jobs: [],
  projects: [{ from: "proj-crud", to: "proj-uploads", state: "derived" }],
  client: [],
  storage: [],
  obs: [],
};

/** Questions the analysis could not answer. Surfaced, never hidden. */
export const OPEN = [
  {
    kind: "dynamic dispatch",
    at: "src/server/jobs/handlers.ts:77",
    text: "Two job types are registered at module load, so the set of reachable handlers is not statically closed.",
    node: "jobs",
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
    node: "auth",
  },
  {
    kind: "absent",
    at: "package.json",
    text: "No observability library is imported. Either it lives outside this repo or it does not exist.",
    node: "obs",
  },
];
