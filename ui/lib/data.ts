/**
 * Fixture for the prototype. No repository is analysed — this is the shape a
 * real `understand-slop diff` run would emit, captured from one realistic
 * scenario: an agent was asked to "add rate limiting to the API routes" and
 * touched 11 files.
 *
 * Every fact carries a state. `derived` is resolved by the TypeScript compiler,
 * `partial` was found but the analysis knows it is incomplete (and says why),
 * `inferred` is not derivable from code at all.
 */

export type State = "derived" | "partial" | "inferred";

export type Level = 0 | 1 | 2;

export interface Detail {
  title: string;
  loc?: string;
  state: State;
  alarm?: boolean;
  /** Lead paragraph — the finding, in plain English. */
  lead: string;
  /** Why the analysis could not finish, when state is not `derived`. */
  caveat?: string;
  facts?: { label: string; value: string }[];
  code?: { path: string; line: number; body: string };
}

export interface Node {
  id: string;
  title: string;
  sub: string;
  state: State;
  alarm?: boolean;
  /** A hole in the analysis, drawn as a hole rather than hidden. */
  ghost?: boolean;
  /** One line revealed on the card at the deepest zoom level. */
  detail?: string;
  /** Grid column/row within its level's layout. */
  col: number;
  row: number;
  span?: number;
  children?: string[];
}

export interface Edge {
  from: string;
  to: string;
  state: State;
  alarm?: boolean;
  label?: string;
}

export const RUN = {
  command: "understand-slop diff HEAD~1",
  commit: "8f3a1c9",
  prompt: "add rate limiting to the API routes",
  model: "claude-sonnet-4-5",
  files: 11,
  added: 387,
  removed: 24,
  elapsed: "1.8s",
};

export const VERDICT = {
  lead: "A Redis-backed sliding-window limiter was wired into 6 of 9 route handlers and the global middleware",
  hot: "which means the Stripe webhook is now rate limited too",
  state: "inferred" as State,
};

export const RADIUS = { direct: 11, transitive: 43, unresolved: 5 };

/* ── level 0 — subsystems ─────────────────────────────────── */

export const L0: Node[] = [
  { id: "entry", title: "Entry", sub: "2 files · middleware, env", state: "derived", col: 0, row: 1, children: ["mwfile", "envfile"] },
  { id: "core", title: "Rate limiting core", sub: "4 new files", state: "inferred", col: 1, row: 0, children: ["limiter", "identity", "policies", "rredis", "lua"] },
  { id: "routes", title: "Route handlers", sub: "6 modified", state: "inferred", col: 1, row: 2, children: ["mw", "checkout", "magic", "projects", "del"] },
  { id: "stores", title: "Data stores", sub: "3 reached", state: "derived", col: 2, row: 0, children: ["redis", "pg", "queue"] },
  { id: "ext", title: "External", sub: "2 third-party APIs", state: "derived", col: 2, row: 2, children: ["stripe", "resend"] },
  { id: "hole", title: "2 handlers unresolved", sub: "dynamic dispatch", state: "partial", ghost: true, col: 2, row: 3 },
];

export const E0: Edge[] = [
  { from: "entry", to: "core", state: "derived", label: "constructs" },
  { from: "entry", to: "routes", state: "partial", alarm: true, label: "matcher glob" },
  { from: "routes", to: "core", state: "derived", label: "consume()" },
  { from: "core", to: "stores", state: "derived", label: "reads / writes" },
  { from: "routes", to: "ext", state: "derived", label: "calls out" },
  { from: "routes", to: "hole", state: "partial", label: "job.type" },
];

/* ── level 1 — inside each subsystem ──────────────────────── */

export const L1: Record<string, Node[]> = {
  core: [
    { id: "limiter", title: "RateLimiter.consume", sub: "limiter.ts:74", state: "derived", col: 1, row: 0, detail: "7 call sites, all compiler-resolved. None in the webhook route — that one is limited only by the middleware." },
    { id: "identity", title: "identify", sub: "identity.ts:23", state: "derived", col: 1, row: 1, detail: "Adds a DB round trip to every unauthenticated request carrying x-api-key." },
    { id: "policies", title: "policyFor", sub: "policies.ts:51 · 4 of 11 keys", state: "partial", col: 1, row: 2, detail: "Key is a template literal of two runtime values, so 4 of 11 policies have no resolvable read." },
    { id: "rredis", title: "rateRedis", sub: "redis.ts:12", state: "derived", col: 1, row: 3, detail: "A second Redis connection. No recorded rationale for not reusing the session pool." },
    { id: "lua", title: "slidingWindow()", sub: "untyped past package boundary", state: "partial", ghost: true, col: 2, row: 3, detail: "Built at runtime by defineCommand; resolves to any. Return shape unverified." },
  ],
  routes: [
    { id: "mw", title: "middleware", sub: "middleware.ts:44", state: "partial", alarm: true, col: 1, row: 0, detail: "Matcher '/api/:path*' sweeps in the Stripe webhook. No call edge proves it — Next registers middleware itself." },
    { id: "checkout", title: "POST /billing/checkout", sub: "route.ts:22", state: "derived", col: 1, row: 1, detail: "Limited inline and by the middleware, so it decrements two counters per request." },
    { id: "magic", title: "POST /auth/magic-link", sub: "route.ts:17", state: "derived", col: 1, row: 2, detail: "consume() at :17, then Resend at :34." },
    { id: "projects", title: "GET · POST /projects", sub: "route.ts:19, :48", state: "derived", col: 1, row: 3, detail: "Rewriting :19 orphaned withThrottle — still exported, now written and read by nothing." },
    { id: "del", title: "DELETE /projects/[id]", sub: "route.ts:88 · bypass", state: "partial", col: 1, row: 4, detail: "Returns before the limiter on an internal token header. No comment, no test." },
  ],
  stores: [
    { id: "redis", title: "Redis", sub: "rate:{scope}:{identity}", state: "derived", col: 1, row: 0, detail: "One round trip per request: ZREMRANGEBYSCORE + ZADD + ZCARD + PEXPIRE via EVALSHA." },
    { id: "pg", title: "Postgres", sub: "organizations", state: "derived", col: 1, row: 1, detail: "New SELECT on every x-api-key request. These previously touched no DB before routing." },
    { id: "queue", title: "BullMQ", sub: "jobs · retry path", state: "partial", col: 1, row: 2, detail: "Retry path reachable only through the dynamic handler lookup at handlers.ts:77." },
  ],
  ext: [
    { id: "stripe", title: "api.stripe.com", sub: "checkout.sessions.create", state: "derived", col: 1, row: 0, detail: "POST /v1/checkout/sessions, downstream of a route that is now rate limited." },
    { id: "resend", title: "api.resend.com", sub: "emails.send", state: "derived", col: 1, row: 1, detail: "POST /emails from the magic-link handler at :34." },
  ],
  entry: [
    { id: "mwfile", title: "src/middleware.ts", sub: "+47 −9", state: "derived", col: 1, row: 0, detail: "Constructs the limiter at :31, calls it at :44. The matcher at :71 decides what it fronts." },
    { id: "envfile", title: "src/env.ts", sub: "+6", state: "derived", col: 1, row: 1, detail: "Adds RATE_LIMIT_REDIS_URL to the server env schema. Purely additive." },
  ],
  hole: [],
};

export const E1: Record<string, Edge[]> = {
  core: [
    { from: "core", to: "limiter", state: "derived" },
    { from: "core", to: "identity", state: "derived" },
    { from: "core", to: "policies", state: "partial" },
    { from: "core", to: "rredis", state: "derived" },
    { from: "rredis", to: "lua", state: "partial", label: "defineCommand" },
  ],
  routes: [
    { from: "routes", to: "mw", state: "partial", alarm: true },
    { from: "routes", to: "checkout", state: "derived" },
    { from: "routes", to: "magic", state: "derived" },
    { from: "routes", to: "projects", state: "derived" },
    { from: "routes", to: "del", state: "partial" },
  ],
  stores: [
    { from: "stores", to: "redis", state: "derived" },
    { from: "stores", to: "pg", state: "derived" },
    { from: "stores", to: "queue", state: "partial" },
  ],
  ext: [
    { from: "ext", to: "stripe", state: "derived" },
    { from: "ext", to: "resend", state: "derived" },
  ],
  entry: [
    { from: "entry", to: "mwfile", state: "derived" },
    { from: "entry", to: "envfile", state: "derived" },
  ],
  hole: [],
};

/* ── level 2 — the detail behind any node ─────────────────── */

export const DETAIL: Record<string, Detail> = {
  entry: {
    title: "Entry",
    loc: "2 files",
    state: "derived",
    lead: "Where requests arrive before any route handler runs. The middleware was modified to construct the limiter and call it globally.",
    facts: [
      { label: "src/middleware.ts", value: "+47 −9" },
      { label: "src/env.ts", value: "+6" },
    ],
  },
  core: {
    title: "Rate limiting core",
    loc: "4 new files · grouping is inferred",
    state: "inferred",
    lead: "Four new files in one new directory, mutually importing, with no other importers before this change.",
    caveat:
      "This grouping is a guess, not structure. It was inferred from directory layout and import density — nothing here is load-bearing, and you can disagree with it.",
    facts: [
      { label: "limiter.ts", value: "+118" },
      { label: "policies.ts", value: "+64" },
      { label: "identity.ts", value: "+41" },
      { label: "redis.ts", value: "+29" },
    ],
  },
  routes: {
    title: "Route handlers",
    loc: "6 modified files · grouping is inferred",
    state: "inferred",
    lead: "Each diff is the same three-line shape: import, consume, 429 early return. Six of these also sit behind the global middleware, so they decrement two separate counters per request and can 429 at half the intended rate.",
    caveat:
      "Grouped by diff shape and directory, not by a structural fact the compiler can confirm.",
  },
  stores: {
    title: "Data stores",
    loc: "3 reached",
    state: "derived",
    lead: "Side effects the new code performs. The Redis connection is new — separate from the existing sessionRedis pool at src/lib/redis.ts:9.",
  },
  ext: {
    title: "External",
    loc: "2 third-party APIs",
    state: "derived",
    lead: "Outbound calls downstream of the limited routes. Both are now behind a rate limit that did not previously exist.",
  },
  hole: {
    title: "2 handlers unresolved",
    loc: "src/server/jobs/handlers.ts:77",
    state: "partial",
    lead: "Seven of nine handler entries resolve from the JOB_HANDLERS object literal. Two more are installed at module load by register-billing.ts:14.",
    caveat:
      "JOB_HANDLERS is indexed by a runtime job.type string, so the set of reachable functions is not statically closed. By name match the missing two look like handleDunningRetry and handleSubscriptionSweep — that is a guess, not a resolved edge.",
    facts: [
      { label: "resolved", value: "7 of 9" },
      { label: "sendWelcomeEmail", value: "derived" },
      { label: "syncStripeCustomer", value: "derived" },
      { label: "reconcileInvoices", value: "derived" },
      { label: "expireTrials", value: "derived" },
    ],
    code: {
      path: "src/server/jobs/handlers.ts",
      line: 77,
      body: `const handler = JOB_HANDLERS[job.type as JobType];
if (!handler) throw new UnknownJobError(job.type);
return handler(job.payload, { limiter });`,
    },
  },
  mw: {
    title: "middleware",
    loc: "src/middleware.ts:44",
    state: "partial",
    alarm: true,
    lead: "The Stripe webhook route is now rate limited by IP. Stripe retries from a rotating egress pool, so a burst of deliveries from one Stripe IP will receive 429 — and Stripe treats that as a delivery failure.",
    caveat:
      "No call edge proves this. Next.js registers the middleware itself, so there is no call site in the repo; this was matched by expanding the glob at middleware.ts:71 against the route tree.",
    facts: [
      { label: "routes fronted", value: "9" },
      { label: "also limited inline", value: "6" },
      { label: "proven by call edge", value: "none" },
    ],
    code: {
      path: "src/middleware.ts",
      line: 71,
      body: `export const config = {
  matcher: ['/api/:path*'],
};`,
    },
  },
  limiter: {
    title: "RateLimiter.consume",
    loc: "src/lib/rate-limit/limiter.ts:74",
    state: "derived",
    lead: "Seven call sites, all resolved by the compiler. No call site exists in the webhook route — it is limited only by the middleware.",
    facts: [
      { label: "middleware.ts", value: ":44" },
      { label: "projects/route.ts", value: ":19, :48" },
      { label: "projects/[id]/route.ts", value: ":61" },
      { label: "billing/checkout/route.ts", value: ":22" },
      { label: "auth/magic-link/route.ts", value: ":17" },
      { label: "limiter.test.ts", value: ":31" },
    ],
    code: {
      path: "src/app/api/billing/checkout/route.ts",
      line: 22,
      body: `const { allowed, retryAfter } = await limiter.consume(identity, 'billing:checkout');
if (!allowed) {
  return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
}`,
    },
  },
  identity: {
    title: "identify",
    loc: "src/lib/rate-limit/identity.ts:23",
    state: "derived",
    lead: "Runs a database query on every unauthenticated API request that carries an x-api-key header. This is a new round trip on the hot path.",
    code: {
      path: "src/lib/rate-limit/identity.ts",
      line: 23,
      body: `const row = await db.oneOrNone(
  'SELECT id, plan FROM organizations WHERE api_key_hash = $1',
  [hash(key)],
);`,
    },
  },
  policies: {
    title: "policyFor",
    loc: "src/lib/rate-limit/policies.ts:51",
    state: "partial",
    lead: "Resolves a rate policy for a scope and tier, falling back to the POLICIES table on a cache miss.",
    caveat:
      "POLICIES is read with a template-literal key built from two runtime values, so 4 of 11 declared policy keys have no statically resolvable read. Those four may be dead configuration, or reachable only in production tiers — the analysis cannot tell you which.",
    code: {
      path: "src/lib/rate-limit/policies.ts",
      line: 44,
      body: `const policy = POLICIES[\`\${scope}:\${tier}\`];`,
    },
  },
  rredis: {
    title: "rateRedis",
    loc: "src/lib/rate-limit/redis.ts:12",
    state: "derived",
    lead: "A second Redis connection, separate from the existing sessionRedis pool at src/lib/redis.ts:9.",
    caveat:
      "Nothing in the change explains why a separate connection was opened rather than reusing the pool. No recorded rationale found — ask whoever ran the agent.",
    code: {
      path: "src/lib/rate-limit/redis.ts",
      line: 12,
      body: `export const rateRedis = new Redis(serverEnv.RATE_LIMIT_REDIS_URL);`,
    },
  },
  lua: {
    title: "slidingWindow()",
    loc: "src/lib/rate-limit/redis.ts:21",
    state: "partial",
    lead: "Generated at runtime by ioredis defineCommand.",
    caveat:
      "There is no declaration in @types/ioredis, so the call resolves to any. The return shape is unverified past the package boundary — every field read off this result is unchecked.",
    code: {
      path: "src/lib/rate-limit/redis.ts",
      line: 21,
      body: `rateRedis.defineCommand('slidingWindow', {
  numberOfKeys: 1,
  lua: SLIDING_WINDOW_LUA,
});`,
    },
  },
  del: {
    title: "DELETE /projects/[id]",
    loc: "src/app/api/projects/[id]/route.ts:88",
    state: "partial",
    lead: "This handler returns before reaching the limiter when an internal token header matches.",
    caveat:
      "An intentional-looking bypass with no comment and no test. Whether it is deliberate is not recorded anywhere in the repo.",
    code: {
      path: "src/app/api/projects/[id]/route.ts",
      line: 88,
      body: `if (req.headers.get('x-internal-token') === serverEnv.INTERNAL_TOKEN) {
  return handleDelete(params.id);
}`,
    },
  },
  checkout: {
    title: "POST /billing/checkout",
    loc: "src/app/api/billing/checkout/route.ts:22",
    state: "derived",
    lead: "Calls consume() inline, then creates a Stripe checkout session. Also behind the global middleware, so this route decrements two counters per request.",
    code: {
      path: "src/app/api/billing/checkout/route.ts",
      line: 22,
      body: `const { allowed, retryAfter } = await limiter.consume(identity, 'billing:checkout');
if (!allowed) {
  return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
}`,
    },
  },
  magic: {
    title: "POST /auth/magic-link",
    loc: "src/app/api/auth/magic-link/route.ts:17",
    state: "derived",
    lead: "Calls consume() at :17, then sends an email through Resend at :34.",
  },
  projects: {
    title: "GET · POST /projects",
    loc: "src/app/api/projects/route.ts:19, :48",
    state: "derived",
    lead: "Rewriting line 19 removed the last caller of withThrottle. It is still exported and still imported by src/lib/http/index.ts:4, so the bundler will not drop it — and its Redis keys throttle:ip:* are now written by nothing and read by nothing.",
    code: {
      path: "src/lib/http/throttle.ts",
      line: 18,
      body: `export async function withThrottle<T>(ip: string, fn: () => Promise<T>): Promise<T> {
  const n = await sessionRedis.incr(\`throttle:ip:\${ip}\`);`,
    },
  },
  redis: {
    title: "Redis",
    loc: "rate:{scope}:{identity}",
    state: "derived",
    lead: "One round trip per request: ZREMRANGEBYSCORE + ZADD + ZCARD + PEXPIRE, executed as a single Lua script via EVALSHA.",
  },
  pg: {
    title: "Postgres",
    loc: "organizations",
    state: "derived",
    lead: "New SELECT on every API request carrying an x-api-key header. Previously these requests touched no database before routing.",
  },
  queue: {
    title: "BullMQ",
    loc: "src/server/jobs/handlers.ts:82",
    state: "partial",
    lead: "Queue.add on the retry path when a handler throws RateLimitedError.",
    caveat:
      "That path is reachable only through the dynamic handler lookup at line 77, so whether the two unattributed handlers can throw it is unresolved.",
  },
  stripe: {
    title: "api.stripe.com",
    loc: "billing/checkout/route.ts:38",
    state: "derived",
    lead: "POST https://api.stripe.com/v1/checkout/sessions via stripe.checkout.sessions.create.",
  },
  resend: {
    title: "api.resend.com",
    loc: "auth/magic-link/route.ts:34",
    state: "derived",
    lead: "POST https://api.resend.com/emails via resend.emails.send.",
  },
  mwfile: {
    title: "src/middleware.ts",
    loc: "+47 −9",
    state: "derived",
    lead: "Constructs the limiter at :31 and calls it globally at :44. The matcher at :71 determines which routes it fronts.",
  },
  envfile: {
    title: "src/env.ts",
    loc: "+6",
    state: "derived",
    lead: "Adds RATE_LIMIT_REDIS_URL to the server env schema. Purely additive.",
  },
};

/* ── the unresolved list, surfaced as a first-class panel ──── */

export const UNRESOLVED = [
  {
    kind: "framework callback",
    at: "src/middleware.ts:71",
    text: "Next.js invokes middleware itself from the config.matcher glob. There is no call site in the repo, so which routes the limiter actually fronts cannot be derived.",
    node: "mw",
  },
  {
    kind: "dynamic dispatch",
    at: "src/server/jobs/handlers.ts:77",
    text: "JOB_HANDLERS is indexed by a runtime job.type string. Two entries are installed at module load, so the reachable set is not statically closed.",
    node: "hole",
  },
  {
    kind: "computed access",
    at: "src/lib/rate-limit/policies.ts:44",
    text: "POLICIES is read with a template-literal key built from two runtime values. 4 of 11 declared keys have no resolvable read.",
    node: "policies",
  },
  {
    kind: "computed access",
    at: "src/app/api/projects/[id]/route.ts:88",
    text: "DELETE returns before reaching the limiter when an internal token header matches — a bypass with no comment and no test.",
    node: "del",
  },
  {
    kind: "external",
    at: "src/lib/rate-limit/redis.ts:21",
    text: "slidingWindow() is generated at runtime by ioredis defineCommand and resolves to any. The return shape is unverified.",
    node: "lua",
  },
];
