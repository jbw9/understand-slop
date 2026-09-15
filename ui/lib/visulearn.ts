/**
 * VisuLearn — a real repository, read at /Users/jonathanmacmini/Desktop/Code/VisuLearn.
 *
 * Every fact below was read out of the source. Where something could not be
 * determined from the repo it is marked `inferred` or `partial` and says why,
 * rather than being filled in plausibly. Code at the leaves is quoted verbatim
 * with real line numbers.
 *
 * Cut by PRODUCT STEP: what a learner does, in order. The layer cut for this
 * repo would be "app / api / lib / db / cdk", which is true of the directory
 * tree and says nothing about a product whose entire premise is "ask a
 * question, get an animation instead of a text wall".
 *
 * DEPTH IS NOT UNIFORM. A branch goes as deep as it has genuinely different
 * things to say. "Generating the answer" runs four levels because a sequence,
 * a model call, a cache strategy and a source file are four different kinds of
 * thing. "Sharing and exporting" stops at two because nothing below it is
 * different from what the card already shows. A third level added everywhere
 * would just be the same repetition one click further down.
 */

import type { Anatomy, Edge, Link, Node, Source, State } from "@/lib/data";
import { rowId } from "@/lib/data";

export type { State, Anatomy, Node, Edge, Link, Source };

export const RUN = {
  command: "understand-slop map .",
  repo: "VisuLearn",
  commit: "9d559b2",
  files: 115,
  elapsed: "—",
};

/* ── the tree ──────────────────────────────────────────────────
   L0 holds the roots. Everything deeper hangs off `children`, so there is no
   level cap anywhere in the data — only branches that happened to stop. */

export const L0: Node[] = [
  {
    id: "asking",
    title: "Asking a question",
    sub: "Type it, attach a file, pick a subject",
    state: "inferred",
    col: 0,
    row: 0,
    detail:
      "One chat surface. A question can carry images, a PDF, a Word document or plain text, and the learner can pin a subject and a mode (auto, visualize, or test) before sending.",
    evidence: "src/components/ChatInput.tsx, src/app/api/chat/route.ts:41",
    edges: [{ from: "ask-input", to: "ask-mode", state: "derived" }],
    children: [
      {
        id: "ask-input",
        title: "What you can send",
        sub: "Text · image · PDF · Word · plain text",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "src/app/api/chat/route.ts:41",
        // Stops here. Each row is one branch of a single if/else — going
        // deeper would show four near-identical push() calls, which is the
        // same fact a fifth time.
        anatomy: [
          {
            kind: "map",
            caption: "attachment → how it reaches the model",
            rows: [
              { from: "image", to: "base64 image block", state: "derived" },
              { from: "pdf", to: "native document block", state: "derived" },
              { from: ".docx", to: "text via mammoth", state: "derived" },
              { from: "text", to: "decoded, inlined", state: "derived" },
              { from: "url", to: "fetched server-side · falls back to training data", state: "partial" },
            ],
          },
        ],
      },
      {
        id: "ask-mode",
        title: "Subject and mode",
        sub: "3 modes · 6 subjects + a catch-all",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "A learner can pin the subject, or leave it to a classifier call. Mode changes which system prompt is used.",
        evidence: "src/lib/subject-router.ts:26, src/types/index.ts",
        anatomy: [
          {
            kind: "chips",
            caption: "modes",
            rows: [
              { label: "auto", note: "Model decides whether to animate", state: "derived" },
              { label: "visualize", note: "Always animates", state: "derived" },
              { label: "test", note: "Quiz question, graded client-side", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "gate",
    title: "Who's asking, and may they",
    sub: "Sign-in, and the daily quota",
    state: "partial",
    col: 0,
    row: 1,
    detail:
      "Identity comes from the server session, never from the request body. Everyone gets a quota — anonymous users are tracked by IP, signed-in users by id, and both are counted before a single token is generated.",
    evidence: "src/lib/auth.ts, src/lib/db/usage.ts:158",
    edges: [{ from: "gate-auth", to: "gate-quota", state: "derived", label: "sets tier" }],
    children: [
      {
        id: "gate-auth",
        title: "Signing in",
        sub: "Google OAuth · email + password",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "src/lib/auth.ts:8",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "POST /api/auth/signup", detail: "Password hashed with bcrypt. No user row is created yet.", state: "derived" },
              { n: 2, title: "Held as a pending registration", detail: "PENDING#{email} / REGISTRATION, with a 10 minute DynamoDB TTL.", state: "derived" },
              { n: 3, title: "One-time code emailed", detail: "Sent through Resend. Five wrong attempts invalidates the registration.", state: "derived" },
              { n: 4, title: "POST /api/auth/verify-otp", detail: "Only now is the real user row written — this is the first time they enter the users table.", state: "derived" },
              { n: 5, title: "Session issued as a JWT", detail: "The token carries our DynamoDB ULID, not Google's subject id.", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "gate-quota",
        title: "The daily quota",
        sub: "Counted before any token is spent",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "A third tier is fully configured but unreachable — nothing can ever be assigned to it.",
        evidence: "src/lib/db/usage.ts:14",
        anatomy: [
          {
            kind: "bars",
            unit: "messages per day",
            rows: [
              { label: "Anonymous", value: 2, display: "2 · by IP", state: "derived" },
              { label: "Authenticated", value: 40, display: "40 · 10/hr", state: "derived" },
              { label: "PREMIUM", value: 500, display: "500 · configured", state: "partial", note: "Configured, but see below" },
            ],
          },
        ],
        // Three levels here, and only because the third one settles the
        // question the second one raises. Four lines of code is the whole
        // proof that a configured tier is unreachable.
        children: [
          {
            id: "gate-tier-fn",
            title: "Why PREMIUM never happens",
            sub: "getUserTier — 4 lines",
            state: "partial",
            alarm: true,
            col: 0,
            row: 0,
            evidence: "src/lib/db/usage.ts:329",
            anatomy: [
              {
                kind: "source",
                file: "src/lib/db/usage.ts",
                start: 329,
                code: `export function getUserTier(userId?: string): UserTier {
  // For now, all authenticated users are AUTHENTICATED tier
  // In the future, you could check a user's subscription status
  return userId ? 'AUTHENTICATED' : 'ANONYMOUS';
}`,
                why: "A ternary with two outcomes. PREMIUM exists in the UserTier union and has full limits configured in both RATE_LIMITS and PDF_RATE_LIMITS, but no code path assigns it — so those numbers have never applied to anyone. The comment says the intent was to check a subscription later; nothing does yet.",
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "generating",
    title: "Generating the answer",
    sub: "Two models, in parallel",
    state: "partial",
    col: 1,
    row: 0,
    detail:
      "The interesting part. A fast model writes the explanation while a stronger one writes the animation code, both streaming into one response. A semantic cache can skip the slow half.",
    evidence: "src/app/api/chat/route.ts:325",
    edges: [
      { from: "gen-cache", to: "gen-parallel", state: "derived", label: "can skip" },
      { from: "gen-prompt", to: "gen-parallel", state: "derived", label: "feeds" },
    ],
    children: [
      {
        id: "gen-parallel",
        title: "Two calls at once",
        sub: "Haiku explains while Sonnet draws",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The single most consequential design choice in the repo: the learner reads an explanation within seconds while the animation is still being written.",
        evidence: "src/app/api/chat/route.ts:325",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Check the cache first", detail: "A semantically similar past question can return its animation and skip call B entirely.", state: "derived" },
              { n: 2, title: "Call A — Haiku", detail: "Explanation plus subject detection. Hard-capped at 500 tokens so reasoning cannot leak into the answer.", state: "derived" },
              { n: 3, title: "Call B — Sonnet, or Opus", detail: "Animation code only. A complexity check routes 3D, WebGL, fractal and fluid requests to Opus.", state: "derived" },
              { n: 4, title: "Merged into one stream", detail: "Both run in parallel and their events are interleaved into a single SSE response.", state: "derived" },
              { n: 5, title: "Predict the next question", detail: "Likely follow-ups are pre-warmed into the cache after the response completes.", state: "derived" },
            ],
          },
        ],
        // Level 3: the call that does the expensive work, on its own.
        children: [
          {
            id: "gen-callb",
            title: "Call B — the animation",
            sub: "Model chosen per question, cancellable",
            state: "derived",
            col: 0,
            row: 0,
            detail:
              "Routed to a stronger model only when the question looks hard, and abortable the moment the cache answers first.",
            evidence: "src/app/api/chat/route.ts:334",
            anatomy: [
              {
                kind: "source",
                file: "src/app/api/chat/route.ts",
                start: 331,
                code: `          // Route complex animation requests (3D, WebGL, fractals, particle/fluid
          // simulations) to Opus for higher-quality generation. Falls back to the
          // default Sonnet model if BEDROCK_OPUS_MODEL_ID is not configured.
          const animationModelId =
            detectComplexity(message) === 'complex'
              ? (process.env.BEDROCK_OPUS_MODEL_ID ?? undefined)
              : undefined;`,
                why: "undefined is meaningful here — it means 'use the default model', so an unset BEDROCK_OPUS_MODEL_ID degrades to Sonnet silently rather than failing. Cost control: Opus is only reached by questions a keyword check thinks are hard.",
              },
              {
                kind: "source",
                file: "src/app/api/chat/route.ts",
                start: 417,
                code: `          // Call B: Sonnet animation stream (animation-only mode, cached prompt)
          // Uses AbortController so it can be cancelled on semantic cache hit.
          const callBAbort = new AbortController();`,
                why: "Call B is the expensive half. If the cache resolves the question while Call B is already streaming, this aborts it mid-flight rather than paying for tokens nobody will see.",
              },
            ],
            // Level 4: how the prompt that feeds this call is assembled.
            children: [
              {
                id: "gen-blocks",
                title: "Why it is three blocks",
                sub: "Cache survives a subject switch",
                state: "derived",
                col: 0,
                row: 0,
                detail:
                  "The prompt is split so the expensive part stays cached across turns that change only small things.",
                evidence: "src/app/api/chat/route.ts:214",
                anatomy: [
                  {
                    kind: "parts",
                    total: "~174KB per request",
                    rows: [
                      { label: "Block 1 · base", weight: 149, display: "~149KB · cached", tone: "hold", state: "derived" },
                      { label: "Block 2 · subject+mode", weight: 25, display: "20-30KB · cached", tone: "hold", state: "derived" },
                      { label: "Block 3 · per-message", weight: 2, display: "tiny · uncached", tone: "vary", state: "derived" },
                    ],
                  },
                  {
                    kind: "source",
                    file: "src/app/api/chat/route.ts",
                    start: 232,
                    code: `    // Block 3 (uncached): Dynamic per-message context — tiny, changes every turn.
    // Kept outside cached blocks so it doesn't invalidate the 149KB+ cache.
    let dynamicContext = '';`,
                    why: "The whole three-block split exists for this line. Question count and difficulty change on nearly every turn; if they lived inside the cached blocks, a 149KB prompt would be re-sent each time. Isolating them keeps the expensive cache entry valid.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "gen-cache",
        title: "The semantic cache",
        sub: "Titan embeddings · cosine ≥ 0.90",
        state: "derived",
        col: 0,
        row: 1,
        evidence: "src/lib/animation-cache.ts:17",
        anatomy: [
          {
            kind: "facts",
            rows: [
              // Trimmed, not charted. "256 dimensions" and "30 days" are not
              // quantities anyone compares — a bar here would be decoration.
              // The problem was length: these wrapped to five and eight lines
              // in a 195px column, which is the clutter, not the facts.
              { label: "Model", value: "titan-embed-text-v2 · 256d", state: "derived" },
              { label: "Match", value: "cosine ≥ 0.90, same subject", state: "derived" },
              { label: "Partition", value: "CACHE#{subject}#v1", state: "derived" },
              { label: "TTL", value: "30 days", state: "derived" },
              { label: "No table", value: "Skipped — fails open", state: "partial" },
            ],
          },
        ],
        children: [
          {
            id: "gen-cache-lookup",
            title: "The lookup, and how it fails",
            sub: "In-memory cosine, errors swallowed",
            state: "partial",
            col: 0,
            row: 0,
            evidence: "src/lib/animation-cache.ts:111",
            anatomy: [
              {
                kind: "source",
                file: "src/lib/animation-cache.ts",
                start: 123,
                code: `    let best: { entry: CacheEntry; score: number } | null = null;
    for (const entry of subjectEntries) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { entry, score };
      }
    }`,
                why: "A linear scan over every cached entry for the subject, in memory, on each request. Fine at current volume; the cost grows with the cache, and 0.90 is strict enough that near-misses regenerate rather than return a wrong animation.",
              },
              {
                kind: "source",
                file: "src/lib/animation-cache.ts",
                start: 142,
                code: `  } catch (err) {
    console.error('[animation-cache] lookup error:', err);
  }
  return null;`,
                why: "Every failure path returns null, which is indistinguishable from a cache miss. That makes the feature safe — a broken cache never breaks a question — but it also means an outage looks exactly like a cold cache, and nothing alerts.",
              },
            ],
          },
        ],
      },
      {
        id: "gen-prompt",
        title: "The system prompt",
        sub: "5,098 lines · one file",
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "By far the largest file in the repository — larger than every React component combined. It defines the product's entire behaviour and no test references it.",
        evidence: "src/lib/system-prompt.ts",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Size", value: "5,098 lines, ~149KB", state: "derived" },
              { label: "Exports", value: "Base prompt, per-subject prompts, per-mode prompts, test hints", state: "derived" },
              { label: "Cached as", value: "Block 1 of 3, identical for every request", state: "derived" },
              { label: "Test coverage", value: "No test file in the repo references it", state: "inferred" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "watching",
    title: "Watching it run",
    sub: "Generated code in a sandbox",
    state: "partial",
    col: 1,
    row: 1,
    detail:
      "Model-written HTML and JavaScript is injected into a sandboxed iframe as it streams. The wrapper has to survive code that is syntactically incomplete, because it is rendered before it is finished.",
    evidence: "src/components/AnimationBlock.tsx:422",
    edges: [{ from: "watch-parse", to: "watch-iframe", state: "derived", label: "code_chunk" }],
    children: [
      {
        id: "watch-parse",
        title: "Splitting the stream",
        sub: "Prose, animation, and quiz options",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The model writes one text stream containing fenced blocks. The parser turns it into typed events as characters arrive.",
        evidence: "src/lib/stream-parser.ts",
        anatomy: [
          {
            kind: "map",
            caption: "fence → events",
            rows: [
              { from: "```animation", to: "code_start · code_chunk · code_end", state: "derived" },
              { from: "```options", to: "question_start · question_chunk · question_end", state: "derived" },
              { from: "anything else", to: "plain text events", state: "derived" },
              { from: "partial fence", to: "buffered until the delimiter closes", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "watch-iframe",
        title: "Running model-written code",
        sub: "Sandboxed iframe, injected mid-stream",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The wrapper is defensive because the code it runs is unfinished and unreviewed. Each guard exists because of a specific way generated code fails.",
        evidence: "src/components/AnimationBlock.tsx:422",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Function stubs", value: "Installed before the model's code, so a truncated script still runs", state: "derived" },
              { label: "Canvas DPR patch", value: "getContext('2d') is wrapped so every canvas is retina-crisp", state: "derived" },
              { label: "Height reporting", value: "The frame measures itself and postMessages its height to the parent", state: "derived" },
              { label: "Width override", value: "Fixed-width containers from the model are forced to fill the frame", state: "derived" },
              { label: "What it is", value: "Arbitrary model-generated JavaScript, run in the learner's browser", state: "partial" },
            ],
          },
        ],
        children: [
          {
            id: "watch-stubs",
            title: "Surviving truncation",
            sub: "The stub installer",
            state: "derived",
            col: 0,
            row: 0,
            detail:
              "The most interesting defence in the repo: it assumes the code it is about to run may simply stop mid-function.",
            evidence: "src/components/AnimationBlock.tsx:474",
            anatomy: [
              {
                kind: "source",
                file: "src/components/AnimationBlock.tsx",
                start: 474,
                code: `    // Safety stubs: installed in <head> BEFORE the LLM code so they survive even
    // if the generated code is truncated mid-<script> (context overflow).
    // Real function declarations at global scope naturally override these stubs.
    ;(function() {
      var navFns = ['next', 'prev', 'reset', 'togglePlay', 'stopPlay'];
      function installStub(fn) {
        window[fn] = function() {
          console.warn('[visulearn] "' + fn + '()" stub called — function was not defined at global scope.');
        };
        window[fn]._isStub = true;
      }
      navFns.forEach(function(fn) {
        installStub(fn);
      });`,
                why: "Hoisting is doing the work. Function declarations at global scope are hoisted over these assignments, so real implementations win automatically and no coordination is needed. If the model's script is cut off by a context limit, the animation's buttons still exist and warn instead of throwing ReferenceError.",
              },
              {
                kind: "source",
                file: "src/components/AnimationBlock.tsx",
                start: 488,
                code: `      // Re-check after load: real global function declarations will have replaced stubs by then
      window.addEventListener('load', function() {
        navFns.forEach(function(fn) {
          if (typeof window[fn] !== 'function' || window[fn]._isStub) {
            installStub(fn);
          }
        });
      });`,
                why: "The second pass covers the case where the model defined the function with const, let or an arrow — none of which are hoisted, and all of which would leave a hole the first pass already filled and the script then overwrote. The _isStub marker is how it tells its own stub apart from a real implementation.",
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "keeping",
    title: "Keeping the conversation",
    sub: "History, for signed-in and anonymous alike",
    state: "derived",
    col: 2,
    row: 0,
    detail:
      "Conversations and messages are written as the stream completes. Anonymous sessions are kept too, under a hashed IP, so a learner who never signs in still has a history.",
    evidence: "src/lib/db/conversations.ts:327",
    edges: [{ from: "keep-conv", to: "keep-msg", state: "derived" }],
    children: [
      {
        id: "keep-conv",
        title: "Conversations",
        sub: "One row per conversation",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "src/lib/db/conversations.ts:7",
        anatomy: [
          {
            kind: "schema",
            table: "visulearn-conversations",
            rows: [
              { name: "PK", type: "string", key: "PK", state: "derived", note: "USER#{userId} — or ANON#{ipHash}" },
              { name: "SK", type: "string", key: "PK", state: "derived", note: "CONV#{conversationId}, a ULID" },
              { name: "title", type: "string", state: "derived" },
              { name: "messageCount", type: "number", state: "derived" },
              { name: "subject", type: "enum", nullable: true, state: "derived", note: "cs · math · physics · chemistry · biology · general" },
              { name: "modelUsed", type: "enum", nullable: true, state: "derived", note: "haiku · sonnet · opus · cache" },
              { name: "haikuInputTokens", type: "number", nullable: true, state: "derived", note: "Token counts kept per model, 8 columns in total" },
              { name: "updatedAt", type: "string", state: "derived" },
            ],
            rel: [
              "Anonymous conversations use the same table with PK ANON#{ipHash}, so a learner who never signs in still keeps a history.",
              "Per-model token counts are recorded on the conversation, which is how cost is attributed without a separate billing table.",
            ],
          },
        ],
      },
      {
        id: "keep-msg",
        title: "Messages",
        sub: "One row per message",
        state: "derived",
        col: 0,
        row: 1,
        evidence: "src/lib/db/conversations.ts:29",
        anatomy: [
          {
            kind: "schema",
            table: "visulearn-messages",
            rows: [
              { name: "PK", type: "string", key: "PK", state: "derived", note: "CONV#{conversationId}" },
              { name: "SK", type: "string", key: "PK", state: "derived", note: "MSG#{timestamp}#{messageId} — sorts chronologically" },
              { name: "role", type: "enum", state: "derived", note: "user · assistant" },
              { name: "textContent", type: "string", state: "derived" },
              { name: "codeContent", type: "string", nullable: true, state: "derived", note: "The generated animation, stored verbatim" },
              { name: "questionData", type: "map", nullable: true, state: "derived", note: "Quiz question and options, in test mode" },
              { name: "images", type: "list", nullable: true, state: "partial", note: "Base64 attachments stored inline in the row" },
            ],
            rel: [
              "Sort key embeds the timestamp, so listing a conversation is a single query with no sort.",
              "Attachments are held as base64 inside the message row rather than in object storage.",
            ],
          },
        ],
      },
    ],
  },

  {
    id: "sharing",
    title: "Sharing and exporting",
    sub: "A public link, or a PDF",
    state: "partial",
    col: 2,
    row: 1,
    detail:
      "A conversation can become a public link with a view counter, or be rendered to a PDF worksheet through headless Chrome. The PDF path has its own quota, separate from chat.",
    evidence: "src/lib/db/sharing.ts, src/app/api/generate-pdf/route.ts",
    edges: [{ from: "share-link", to: "share-pdf", state: "inferred" }],
    children: [
      {
        id: "share-link",
        title: "Public links",
        sub: "ULID, optional expiry, view counter",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "src/lib/db/sharing.ts:21",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "POST /api/share", detail: "Ownership is verified by re-reading the conversation as the caller.", state: "derived" },
              { n: 2, title: "Share row written", detail: "SHARE#{shareId} / META — written into the USERS table, not a shares table.", state: "partial" },
              { n: 3, title: "GET /share/[id]", detail: "Public page, no session required.", state: "derived" },
              { n: 4, title: "View counted", detail: "Incremented on each read.", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "share-pdf",
        title: "PDF worksheets",
        sub: "Model-authored, headless Chrome rendered",
        state: "partial",
        col: 0,
        row: 1,
        detail:
          "A second generation path with its own prompt, schema and quota — the model returns structured JSON which is rendered to HTML and printed.",
        evidence: "src/app/api/generate-pdf/route.ts",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Model output", value: "JSON validated with zod against a worksheet schema", state: "derived" },
              { label: "Malformed JSON", value: "Newlines inside strings are repaired character-by-character, then retried once", state: "partial" },
              { label: "Rendering", value: "puppeteer-core prints the HTML to PDF", state: "derived" },
              { label: "Upload limit", value: "~6MB decoded, enforced to prevent large-payload abuse", state: "derived" },
              { label: "Timeout", value: "maxDuration 60s — generation alone can take ~20s", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "tables",
    title: "Where it all lands",
    sub: "DynamoDB — 4 tables",
    state: "partial",
    col: 3,
    row: 0,
    detail:
      "Four tables, but only three entity kinds live where their name suggests. The users table has quietly become a single-table store holding five different kinds of item.",
    evidence: "src/lib/dynamodb.ts:26",
    children: [
      {
        id: "tbl-users",
        title: "The users table",
        sub: "Five kinds of item, one table",
        state: "partial",
        alarm: true,
        col: 0,
        row: 0,
        detail:
          "Named for users, but four other features write here too. Nothing in the repo names this pattern, so it is only visible by reading every db module.",
        evidence: "src/lib/db/users.ts, usage.ts, pending.ts, sharing.ts",
        anatomy: [
          {
            kind: "schema",
            table: "visulearn-users",
            rows: [
              { name: "USER#{id} / PROFILE", type: "item", key: "PK", state: "derived", note: "The actual user record" },
              { name: "USER#{id} / USAGE#{date}", type: "item", state: "derived", note: "Daily message counts, with per-hour buckets" },
              { name: "USER#{id} / PDF_USAGE#{date}", type: "item", state: "derived", note: "Separate PDF quota, deliberately a different SK" },
              { name: "IP#{addr} / USAGE#{date}", type: "item", state: "derived", note: "Anonymous quota, keyed by IP instead of user" },
              { name: "PENDING#{email} / REGISTRATION", type: "item", state: "derived", note: "Unverified signup, 10 minute TTL" },
              { name: "SHARE#{shareId} / META", type: "item", state: "partial", note: "Share links live here too — not in a shares table" },
              { name: "GSI1", type: "index", key: "UQ", state: "derived", note: "EMAIL#{email} → the user, for login lookup" },
            ],
            rel: [
              "This is a single-table design that nothing declares as one. Five entity types share it, distinguished only by key prefix.",
              "The consequence: a scan of this table returns users, quotas, pending signups and share links interleaved.",
            ],
          },
        ],
        children: [
          {
            id: "tbl-share-write",
            title: "The write that proves it",
            sub: "createShareLink → TABLES.USERS",
            state: "partial",
            alarm: true,
            col: 0,
            row: 0,
            detail:
              "A share link is not a user. This is the line that makes the users table a single-table store, and it looks completely ordinary.",
            evidence: "src/lib/db/sharing.ts:52",
            anatomy: [
              {
                kind: "source",
                file: "src/lib/db/sharing.ts",
                start: 38,
                code: `  const item: SharedConversation = {
    PK: \`SHARE#\${shareId}\`,
    SK: 'META',
    shareId,
    conversationId,
    userId,
    title,
    createdAt,
    expiresAt,
    viewCount: 0,
    isPublic: true,
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USERS,
        Item: item,
      })
    );`,
                why: "TABLES.USERS on a record with a SHARE# partition key. Nothing here is wrong — DynamoDB single-table design is a legitimate pattern and the key prefix keeps items distinct. What is missing is anywhere that says so: the table is named for one entity and holds five, so the pattern has to be rediscovered by reading each db module in turn.",
              },
            ],
          },
        ],
      },
      {
        id: "tbl-rest",
        title: "The other three",
        sub: "Conversations · messages · animation cache",
        state: "derived",
        col: 0,
        row: 1,
        evidence: "src/lib/dynamodb.ts:26",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "visulearn-conversations", value: "Conversation metadata, authenticated and anonymous", state: "derived" },
              { label: "visulearn-messages", value: "Message bodies, including generated animation code", state: "derived" },
              { label: "visulearn-animation-cache", value: "Embeddings and cached animations, 30 day TTL", state: "derived" },
              { label: "Table names", value: "All four are env-var overridable, with these as defaults", state: "derived" },
              { label: "Key schema", value: "Not defined anywhere in this repo — see 'Where the tables came from'", state: "inferred" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "admin",
    title: "Watching the product",
    sub: "Admin dashboard · 6 routes",
    state: "derived",
    col: 3,
    row: 1,
    detail:
      "A separate admin surface reading conversations, messages, users, referrals, geography and access grants. Read-only except access, which can grant and revoke.",
    evidence: "src/app/api/admin/",
    children: [
      {
        id: "admin-routes",
        title: "Admin endpoints",
        sub: "6 routes · read-only but one",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "src/app/api/admin/",
        anatomy: [
          {
            kind: "routes",
            rows: [
              { method: "GET", path: "/api/admin/conversations", auth: "admin", state: "derived" },
              { method: "GET", path: "/api/admin/messages", auth: "admin", state: "derived" },
              { method: "GET", path: "/api/admin/users", auth: "admin", state: "derived" },
              { method: "GET", path: "/api/admin/referrals", auth: "admin", state: "derived" },
              { method: "GET", path: "/api/admin/geo", auth: "admin", state: "derived", note: "Feeds the world map on the dashboard" },
              { method: "POST", path: "/api/admin/access", auth: "admin", state: "derived", note: "The only admin write — grants and revokes access" },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "infra",
    title: "Where the tables came from",
    sub: "Not in this repo",
    state: "inferred",
    ghost: true,
    col: 4,
    row: 1,
    detail:
      "The CDK stack imports all three of its tables with fromTableName, which attaches to tables that already exist. No key schema, index, or capacity setting for them is defined anywhere in this repository.",
    evidence: "cdk/lib/visulearn-stack.ts:20",
    // No children, and that is the finding: a hole has nothing underneath it.
  },
];

/** Edges between the roots. */
export const E0: Edge[] = [
  { from: "asking", to: "gate", state: "derived", label: "checked by" },
  { from: "gate", to: "generating", state: "derived", label: "allows" },
  { from: "generating", to: "watching", state: "derived", label: "streams into" },
  { from: "generating", to: "keeping", state: "derived", label: "saves" },
  { from: "keeping", to: "sharing", state: "derived", label: "can publish" },
  { from: "gate", to: "tables", state: "derived" },
  { from: "keeping", to: "tables", state: "derived" },
  { from: "sharing", to: "tables", state: "derived" },
  { from: "generating", to: "tables", state: "derived", label: "cache" },
  { from: "admin", to: "tables", state: "derived", label: "reads" },
  { from: "tables", to: "infra", state: "inferred", label: "defined where?" },
];

/* ── tree helpers ─────────────────────────────────────────────
   The canvas walks by path, so these are the only two ways it needs to look
   a node up. Neither assumes a depth. */

/** Resolve a path of ids to the node it names. */
export function nodeAt(path: string[]): Node | null {
  let level: Node[] = L0;
  let found: Node | null = null;
  for (const id of path) {
    found = level.find((n) => n.id === id) ?? null;
    if (!found) return null;
    level = found.children ?? [];
  }
  return found;
}

/** The nodes shown at a given path's level — roots when the path is empty. */
export function levelAt(path: string[]): Node[] {
  if (path.length === 0) return L0;
  return nodeAt(path)?.children ?? [];
}

/** Every node in the tree, flattened. Used for id lookups and audits. */
export function allNodes(nodes: Node[] = L0): Node[] {
  return nodes.flatMap((n) => [n, ...allNodes(n.children ?? [])]);
}

/** What the analysis could not settle. Surfaced, never hidden. */
export const OPEN = [
  {
    kind: "not in this repo",
    at: "cdk/lib/visulearn-stack.ts:20",
    text: "All three CDK tables are attached with fromTableName. No key schema, GSI definition, or capacity setting exists in this repository — the tables were created elsewhere.",
    node: "infra",
  },
  {
    kind: "undeclared single table",
    at: "src/lib/db/sharing.ts:52",
    text: "Share links, usage counters, PDF quotas and pending registrations are all written into the users table. Nothing declares this as a single-table design.",
    node: "tables",
  },
  {
    kind: "unreachable configuration",
    at: "src/lib/db/usage.ts:329",
    text: "A PREMIUM tier is fully specified in both limit tables and in the UserTier union, but getUserTier returns only ANONYMOUS or AUTHENTICATED.",
    node: "gate",
  },
  {
    kind: "fails open",
    at: "src/lib/animation-cache.ts:142",
    text: "Every cache failure path returns null, which is indistinguishable from a miss. An outage looks exactly like a cold cache, and nothing alerts.",
    node: "generating",
  },
  {
    kind: "untested surface",
    at: "src/lib/system-prompt.ts",
    text: "5,098 lines defining the product's entire behaviour, with no test file anywhere in the repo referencing it.",
    node: "generating",
  },
];

/* ── row-level links ─────────────────────────────────────────── */

export const LINKS: Link[] = [
  { from: rowId("gate-quota", "Anonymous"), to: rowId("tbl-users", "IP#{addr} / USAGE#{date}"), state: "derived", label: "writes" },
  { from: rowId("gate-quota", "Authenticated"), to: rowId("tbl-users", "USER#{id} / USAGE#{date}"), state: "derived", label: "writes" },
  { from: rowId("gate-quota", "PDF export"), to: rowId("tbl-users", "USER#{id} / PDF_USAGE#{date}"), state: "derived", label: "writes" },

  { from: rowId("gate-auth", 2), to: rowId("tbl-users", "PENDING#{email} / REGISTRATION"), state: "derived", label: "writes" },
  { from: rowId("gate-auth", 4), to: rowId("tbl-users", "USER#{id} / PROFILE"), state: "derived", label: "creates" },
  { from: rowId("gate-auth", 5), to: rowId("tbl-users", "GSI1"), state: "derived", label: "looks up" },

  // The finding, drawn as a wire: a share row landing in the users table.
  { from: rowId("share-link", 2), to: rowId("tbl-users", "SHARE#{shareId} / META"), state: "partial", alarm: true, label: "writes to users table" },

  { from: rowId("gen-parallel", 1), to: rowId("gen-cache", "Match rule"), state: "derived", label: "checks" },
  { from: rowId("gen-parallel", 3), to: rowId("keep-conv", "modelUsed"), state: "derived", label: "records" },
  { from: rowId("gen-parallel", 2), to: rowId("keep-conv", "haikuInputTokens"), state: "derived", label: "counts" },
  { from: rowId("gen-cache", "Partitioned by"), to: rowId("tbl-rest", "visulearn-animation-cache"), state: "derived", label: "stored in" },

  { from: rowId("watch-parse", "```animation"), to: rowId("keep-msg", "codeContent"), state: "derived", label: "saved as" },
  { from: rowId("watch-parse", "```options"), to: rowId("keep-msg", "questionData"), state: "derived", label: "saved as" },
  { from: rowId("watch-iframe", "Function stubs"), to: rowId("keep-msg", "codeContent"), state: "derived", label: "executes" },

  { from: rowId("ask-input", "Image"), to: rowId("keep-msg", "images"), state: "partial", label: "stored inline" },

  { from: rowId("keep-msg", "PK"), to: rowId("keep-conv", "SK"), state: "derived", label: "FK" },
];

export function linksFor(id: string) {
  return LINKS.filter((l) => l.from === id || l.to === id);
}
