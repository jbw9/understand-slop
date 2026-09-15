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
        sub: "3 modes → 4 prompt paths · 11 subjects",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "Two independent choices that together select which prompt text gets appended. Mode is picked by the learner; subject is either pinned or classified by a separate model call.",
        evidence: "src/lib/subject-router.ts:26, src/app/api/chat/route.ts:210",
        anatomy: [
          {
            kind: "map",
            caption: "mode → what gets appended as block 2",
            rows: [
              { from: "auto · 1st", to: "SUBJECT_PROMPTS[s] + AUTO_MODE_FIRST_MESSAGE_PROMPT", state: "derived" },
              { from: "auto · later", to: "SUBJECT_PROMPTS[s] + AUTO_MODE_FOLLOW_UP_PROMPT", state: "derived" },
              { from: "visualize", to: "SUBJECT_PROMPTS[s] + VISUALIZE_MODE_PROMPT", state: "derived" },
              { from: "test", to: "TEST_MODE_PROMPT + SUBJECT_TEST_HINTS[s] — no subject prompt", state: "derived" },
            ],
          },
        ],
        children: [
          {
            id: "ask-classify",
            title: "How the subject is decided",
            sub: "One Haiku call · 11 labels · never throws",
            state: "derived",
            col: 0,
            row: 0,
            detail:
              "If the learner pins a subject chip it is used directly, after being checked against VALID_SUBJECTS so a client cannot inject an arbitrary string. Otherwise one cheap model call classifies the first message.",
            evidence: "src/lib/subject-router.ts:36",
            anatomy: [
              {
                kind: "flow",
                rows: [
                  { n: 1, title: "Env var checked first", detail: "No BEDROCK_CLASSIFIER_MODEL_ID → returns 'general' without calling anything.", state: "derived" },
                  { n: 2, title: "Message truncated to 500 chars", detail: "Only the opening of the first message is classified; the rest is never sent.", state: "derived" },
                  { n: 3, title: "Haiku, max 10 output tokens", detail: "The reply is one word, so the budget is one word. ~150ms.", state: "derived" },
                  { n: 4, title: "3s AbortController", detail: "A slow classifier is abandoned rather than delaying the answer.", state: "derived" },
                  { n: 5, title: "Reply checked against VALID_SUBJECTS", detail: "An unrecognised word is discarded, not passed through.", state: "derived" },
                  { n: 6, title: "Every failure path → 'general'", detail: "catch {} with no rethrow. A misclassification and an outage look identical downstream.", state: "partial" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/subject-router.ts",
                start: 56,
                code: "  } catch {\n    return 'general';\n  } finally {\n    clearTimeout(timeout);\n  }",
                why: "This is why the subject can silently be wrong. A timeout, a throttle, a bad model id and a genuinely general question all produce the same 'general', and nothing records which one happened. The learner sees a slightly worse answer and no error.",
              },
            ],
          },
          {
            id: "ask-disambig",
            title: "Why this subject, not that one",
            sub: "4 rules written into the classifier prompt",
            state: "derived",
            col: 0,
            row: 1,
            detail:
              "The subjects overlap, so the prompt spends most of its length drawing borders between the pairs that collide rather than defining each subject.",
            evidence: "src/lib/subject-router.ts:17",
            anatomy: [
              {
                kind: "map",
                caption: "the boundary, verbatim from the prompt",
                rows: [
                  { from: "a cell", to: "biology", state: "derived" },
                  { from: "a molecule", to: "chemistry", state: "derived" },
                  { from: "recording a transaction", to: "accounting", state: "derived" },
                  { from: "market forces and theory", to: "economics", state: "derived" },
                  { from: "running an organization", to: "business", state: "derived" },
                  { from: "how language works", to: "language", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/subject-router.ts",
                start: 20,
                code: "- Biology is living systems; chemistry is molecules and reactions (a cell = biology; a molecule = chemistry)",
                why: "Written as an instruction to the model, which means the taxonomy exists only in prose. Nothing verifies that a message about mitochondria lands on biology — there is no test, and the only feedback is the answer being subtly off-domain.",
              },
            ],
          },
          {
            id: "ask-cs-gap",
            title: "The subject with no prompt",
            sub: "8 subject prompts · 9 test hints · 11 subjects",
            state: "partial",
            col: 0,
            row: 2,
            detail:
              "SUBJECT_PROMPTS is a Partial<Record>, and three of the eleven classifiable subjects have no entry. The lookup is a guarded `if`, so a missing subject is not an error — block 2 simply carries less.",
            evidence: "src/lib/system-prompt.ts:5018",
            anatomy: [
              {
                kind: "chips",
                caption: "has a subject prompt",
                rows: [
                  { label: "math", note: "5.0KB", state: "derived" },
                  { label: "physics", note: "8.6KB", state: "derived" },
                  { label: "chemistry", note: "19.5KB", state: "derived" },
                  { label: "biology", note: "14.3KB", state: "derived" },
                  { label: "language", note: "11.9KB", state: "derived" },
                  { label: "business", note: "12.7KB", state: "derived" },
                  { label: "accounting", note: "16.2KB", state: "derived" },
                  { label: "economics", note: "17.4KB", state: "derived" },
                ],
              },
              {
                kind: "chips",
                caption: "classifiable, but no subject prompt",
                rows: [
                  { label: "cs", note: "test hint only", state: "partial" },
                  { label: "general", note: "nothing", state: "partial" },
                ],
              },
              {
                kind: "source",
                file: "src/app/api/chat/route.ts",
                start: 217,
                code: "    if (resolvedSubject && mode !== 'test' && SUBJECT_PROMPTS[resolvedSubject]) {\n      subjectModePrompt += SUBJECT_PROMPTS[resolvedSubject];\n    }",
                why: "A computer-science question in auto or visualize mode gets no subject guidance at all — the `&&` chain simply falls through. In test mode the same question does get CS guidance, because that comes from SUBJECT_TEST_HINTS, which does have a cs key. Same subject, opposite treatment, decided by mode.",
              },
            ],
          },
          {
            id: "ask-questions",
            title: "When it asks instead of answering",
            sub: "Ambiguous → options block, not a guess",
            state: "derived",
            col: 0,
            row: 3,
            detail:
              "The rule is written into the base prompt as four triggers and four exclusions, with three worked examples. It is prose instruction only — nothing validates that the model obeys it.",
            evidence: "src/lib/system-prompt.ts:55",
            anatomy: [
              {
                kind: "map",
                caption: "ask · the prompt's own examples",
                rows: [
                  { from: "\"explain sorting\"", to: "bubble / merge / quick / compare all three", state: "derived" },
                  { from: "\"visualize recursion\"", to: "factorial / fibonacci / binary search", state: "derived" },
                  { from: "\"show me data structures\"", to: "array / tree / graph", state: "derived" },
                ],
              },
              {
                kind: "map",
                caption: "don't ask",
                rows: [
                  { from: "already specific", to: "\"show me bubble sort\" → just build it", state: "derived" },
                  { from: "context makes it clear", to: "earlier turns already narrowed it", state: "derived" },
                  { from: "an obvious best choice exists", to: "pick it", state: "derived" },
                  { from: "user stated a preference", to: "honour it", state: "derived" },
                ],
              },
            ],
          },
          {
            id: "ask-budget",
            title: "The three-question budget",
            sub: "Counted from stored messages, injected as a sentence",
            state: "derived",
            col: 0,
            row: 4,
            detail:
              "The cap is not enforced by rejecting anything. It is counted server-side each turn and stated to the model in block 3, which is the reason block 3 exists at all.",
            evidence: "src/app/api/chat/route.ts:239",
            anatomy: [
              {
                kind: "flow",
                rows: [
                  { n: 1, title: "Counted, not tracked", detail: "history.filter(m => m.questionData !== undefined).length — derived from stored messages each turn, so there is no counter to drift.", state: "derived" },
                  { n: 2, title: "0 asked → nothing injected", detail: "The prompt's own 'max 3' line is the only limit in play.", state: "derived" },
                  { n: 3, title: "1–2 asked → allowance stated", detail: "\"You can ask up to N more if needed.\"", state: "derived" },
                  { n: 4, title: "3+ asked → hard stop", detail: "\"DO NOT ask any more questions. Proceed directly with creating a visualization.\"", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/app/api/chat/route.ts",
                start: 245,
                code: "      if (questionCount >= 3) {\n        dynamicContext += `\\n\\n**IMPORTANT CONTEXT: You have already asked ${questionCount} clarifying questions in this conversation. DO NOT ask any more questions.**`;",
                why: "This is the entire reason the prompt is split into three cached blocks. The sentence changes on almost every turn, and if it lived inside block 1 or 2 the whole cached prefix would be invalidated each time — so ~102KB would be re-sent to buy one sentence of state.",
              },
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
                    // Largest real request: chemistry in test mode. Measured from
                    // the constants, not from the route's comment, which is wrong.
                    total: "~125KB · chemistry + test, the heaviest combination",
                    rows: [
                      { label: "Block 1 · base", weight: 102450, display: "102KB · cached", tone: "hold", state: "derived" },
                      { label: "Block 2 · subject+mode", weight: 22609, display: "5–23KB · cached", tone: "hold", state: "derived" },
                      { label: "Block 3 · per-message", weight: 400, display: "a sentence · uncached", tone: "vary", state: "derived" },
                    ],
                  },
                  {
                    kind: "source",
                    file: "src/app/api/chat/route.ts",
                    start: 232,
                    code: `    // Block 3 (uncached): Dynamic per-message context — tiny, changes every turn.
    // Kept outside cached blocks so it doesn't invalidate the 149KB+ cache.
    let dynamicContext = '';`,
                    why: "The whole three-block split exists for this line. Question count and difficulty change on nearly every turn; if they lived inside the cached blocks, the entire ~102KB prefix would be re-sent each time to buy one sentence of state. Note the comment's own figure: the base literal measures 102,450 bytes, so the 149KB it claims here — and in three other places in this file — is not a number anything in the repository produces.",
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
        sub: "5,098 lines · 234KB file · one export per mode",
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "By far the largest file in the repository — larger than every React component combined. It defines the product's entire behaviour and no test references it.",
        evidence: "src/lib/system-prompt.ts",
        anatomy: [
          {
            kind: "parts",
            // Charts the 15 named prompt literals, measured one by one. Not the
            // file on disk, which is ~25KB larger once imports, comments and the
            // declarations themselves are counted — none of that is ever sent.
            // SUBJECT_TEST_HINTS is deliberately absent: it lives inside an
            // object literal rather than its own const, so it is not measured
            // the same way and would not reconcile against this total.
            //
            // The three slices sum to 213,273 of 214,546. The missing 1,273 is
            // HAIKU_EXPLANATION_PROMPT and ANIMATION_ONLY_SUFFIX. No fourth
            // slice for them: at 0.6% the 6% floor would draw them ten times
            // their real size, which is worse than leaving them named here.
            total: "210KB across 15 named prompt literals",
            rows: [
              { label: "SYSTEM_PROMPT · block 1", weight: 102450, display: "102KB · every request", tone: "hold", state: "derived" },
              { label: "8 subject prompts · block 2", weight: 105637, display: "106KB · one is chosen", tone: "hold", state: "derived" },
              { label: "4 mode prompts · block 2", weight: 5186, display: "5KB · one is chosen", tone: "vary", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "src/app/api/chat/route.ts",
            start: 161,
            code: "    // Block 1: SYSTEM_PROMPT (149KB, cached, same for ALL requests)\n    // Block 2: Subject + mode prompt (20-30KB, cached per subject+mode combo)",
            why: "Measured, the base literal is 102,450 bytes, not 149KB — the comment appears four times in this file and is wrong in all four. The 234KB figure people reach for is the file on disk, which also counts the subject prompts that are block 2, plus ~17KB of imports and comments that are never sent anywhere. Block 2's '20-30KB' flattens a 4x spread: chemistry is 19.5KB, math is 5.0KB.",
          },
        ],
        children: [
          {
            id: "gen-prompt-what",
            title: "What is in the base block",
            sub: "2,349 lines sent with every single request",
            state: "derived",
            col: 0,
            row: 0,
            detail:
              "Block 1 is one template literal. It is identical for every user, every subject and every mode, which is what makes it worth caching — and what makes it the single largest fixed cost per request.",
            evidence: "src/lib/system-prompt.ts:3",
            anatomy: [
              {
                kind: "map",
                caption: "the sections that take up the space",
                rows: [
                  { from: "response format", to: "explanation text + ```animation fenced block", state: "derived" },
                  { from: "asking clarifying questions", to: "when to, when not to, 3 worked examples", state: "derived" },
                  { from: "animation templates", to: "step players, canvas loops, physics scaffolds", state: "derived" },
                  { from: "quiz format", to: "```options JSON, grading, questionId rules", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/system-prompt.ts",
                start: 47,
                code: "CRITICAL: Always use the `animation` fence tag. Never use `html` or `javascript`. The frontend uses this tag to detect animation blocks.",
                why: "The parser downstream keys on this exact fence. It is the contract between the prompt and stream-parser.ts, written in prose in one file and as a regex in another, with nothing linking them — rename the fence in one place and the product stops rendering animations.",
              },
            ],
          },
          {
            id: "gen-prompt-modes",
            title: "The mode prompts are tiny",
            sub: "218 bytes to 3KB · the subject prompt is the weight",
            state: "derived",
            col: 0,
            row: 1,
            detail:
              "Block 2 is assembled from a subject prompt plus a mode prompt. The mode half is almost nothing; nearly all of block 2's size is the subject.",
            evidence: "src/lib/system-prompt.ts:2354",
            anatomy: [
              {
                kind: "bars",
                unit: "bytes",
                rows: [
                  { label: "TEST_MODE_PROMPT", value: 3088, display: "3,088 B", state: "derived", note: "quiz JSON, grading, difficulty" },
                  { label: "AUTO_MODE_FOLLOW_UP", value: 1451, display: "1,451 B", state: "derived", note: "refine / text / new / ask" },
                  { label: "AUTO_MODE_FIRST_MESSAGE", value: 429, display: "429 B", state: "derived" },
                  { label: "VISUALIZE_MODE_PROMPT", value: 218, display: "218 B", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/system-prompt.ts",
                start: 5079,
                code: "**IMPORTANT OVERRIDE: The rule above that says \"Every response MUST contain animation code\" applies to FIRST messages only.**",
                why: "Auto mode is two prompts, not one. The first message is forced to animate; the follow-up explicitly revokes that rule so a one-word clarification does not trigger a full animation rebuild. This is why the same mode behaves differently on turn 1 and turn 2.",
              },
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
        sub: "JSON from the model → HTML → headless Chrome",
        state: "partial",
        col: 0,
        row: 1,
        detail:
          "A second generation path with its own prompt, schema and quota. The model never writes the document — it writes JSON, which is validated and then rendered.",
        evidence: "src/app/api/generate-pdf/route.ts",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Prompt built per subject and doc type", detail: "buildPdfSystemPrompt() picks guidance from two lookup tables and inlines the JSON schema as prose.", state: "derived" },
              { n: 2, title: "invokeModelJson, maxTokens 8000", detail: "A single call. An attached PDF is passed as document data.", state: "derived" },
              { n: 3, title: "Markdown fences stripped", detail: "Leading ```json and trailing ``` are removed before parsing.", state: "derived" },
              { n: 4, title: "Character-walk repair", detail: "Literal newlines and tabs inside JSON strings are escaped, tracking in-string state so only string contents are touched.", state: "derived" },
              { n: 5, title: "JSON.parse, then Zod", detail: "PdfDocSchema.safeParse. A failure at either step retries once with a stricter instruction.", state: "derived" },
              { n: 6, title: "Best-effort coercion", detail: "On the second failure, four fields are salvaged with defaults rather than erroring out.", state: "partial" },
              { n: 7, title: "puppeteer-core prints", detail: "setContent, waitUntil load, 20s timeout.", state: "derived" },
            ],
          },
        ],
        children: [
          {
            id: "pdf-prompt",
            title: "What the model is told",
            sub: "2 lookup tables + the schema as prose",
            state: "derived",
            col: 0,
            row: 0,
            detail:
              "The PDF prompt is assembled, not stored. Subject guidance and document-type instructions are selected from two records, then the JSON schema is written into the prompt as text.",
            evidence: "src/lib/pdf-prompts.ts:34",
            anatomy: [
              {
                kind: "map",
                caption: "subject → notation rule",
                rows: [
                  { from: "math", to: "LaTeX for everything · pmatrix for matrices", state: "derived" },
                  { from: "chemistry", to: "LaTeX equations · \\text{} for element symbols", state: "derived" },
                  { from: "cs", to: "pseudocode as plain text, never LaTeX", state: "derived" },
                  { from: "accounting", to: "journal entries as described tables · avoid LaTeX", state: "derived" },
                  { from: "biology", to: "no LaTeX unless genetics or biochemistry", state: "derived" },
                ],
              },
              {
                kind: "map",
                caption: "docType → structure",
                rows: [
                  { from: "notes", to: "content, keyPoints, solution_text — questions forbidden", state: "derived" },
                  { from: "worksheet", to: "questions with workSpaceLines 4–12 · always generate solutions", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/pdf-prompts.ts",
                start: 20,
                code: "For EVERY question, always generate BOTH the question AND a complete solution. The rendering system will decide whether to display the solutions — your job is always to include them.",
                why: "The answer key is not a second generation pass. Solutions are always produced and the renderer chooses whether to print them, so toggling 'include answers' costs nothing extra and cannot disagree with the questions.",
              },
            ],
          },
          {
            id: "pdf-repair",
            title: "Why the JSON needs repairing",
            sub: "Prose in strings · 2 attempts · then salvage",
            state: "partial",
            col: 0,
            row: 1,
            detail:
              "The model is asked for single-line JSON strings and does not reliably produce them, so the route repairs the output before parsing rather than rejecting it.",
            evidence: "src/app/api/generate-pdf/route.ts:74",
            anatomy: [
              {
                kind: "source",
                file: "src/app/api/generate-pdf/route.ts",
                start: 84,
                code: "      if (ch === '\"') { inString = !inString; cleaned += ch; continue; }\n      if (inString && ch === '\\n') { cleaned += '\\\\n'; continue; }",
                why: "A blanket replace would corrupt the JSON's own structural newlines between keys. Tracking in-string state means only prose inside a value is escaped. The prompt asks for this in capitals — 'never press Enter inside a JSON string' — and the parser still needs the fallback, which is the honest signal about how reliable that instruction is.",
              },
              {
                kind: "flow",
                rows: [
                  { n: 1, title: "Attempt 1 fails to parse", detail: "The original user message is re-sent with an appended instruction: start with { and end with }.", state: "derived" },
                  { n: 2, title: "Attempt 2 fails to parse", detail: "Throws — 'Claude returned invalid JSON after 2 attempts'.", state: "derived" },
                  { n: 3, title: "Parses but fails Zod", detail: "On attempt 2, four fields are coerced with defaults and re-validated.", state: "partial" },
                  { n: 4, title: "Coercion also fails", detail: "Throws. Sections default to an empty array, so a document can succeed with no content.", state: "partial" },
                ],
              },
            ],
          },
          {
            id: "pdf-render",
            title: "Printing it",
            sub: "Two browsers · one prints, one screenshots",
            state: "derived",
            col: 0,
            row: 2,
            detail:
              "The same headless Chrome dependency does two unrelated jobs: printing the worksheet, and capturing a still of an animation to embed in notes.",
            evidence: "src/lib/pdf-puppeteer.ts:34",
            anatomy: [
              {
                kind: "map",
                caption: "job → settings",
                rows: [
                  { from: "renderHtmlToPdf", to: "setContent · waitUntil load · 20s timeout", state: "derived" },
                  { from: "screenshotAnimation", to: "600×400 viewport · 8s timeout · 600ms settle", state: "derived" },
                  { from: "both", to: "request interception on, external loads blocked", state: "derived" },
                ],
              },
              {
                kind: "source",
                file: "src/lib/pdf-puppeteer.ts",
                start: 145,
                code: "      const sampleSize = Math.min(500, buf.length);\n      const step = Math.floor(buf.length / sampleSize);\n      const uniqueBytes = new Set<number>();",
                why: "A blank screenshot is detected by sampling up to 500 bytes and counting distinct values — a mostly-uniform image is assumed to be an animation that had not drawn yet. It is a heuristic on compressed bytes, not on pixels, so a genuinely flat-coloured animation reads as failure and the notes silently fall back to the no-screenshot wording.",
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "tables",
    // Carries what the five deleted write-edges used to say. See E0.
    title: "Where it all lands",
    sub: "DynamoDB — 4 tables · written by everything above, read by admin",
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
            // Tables render as tables. Restating three names and what each
            // holds was five rows of prose describing a schema — the one shape
            // this tool already draws well.
            kind: "chips",
            caption: "tables · env-var overridable",
            rows: [
              { label: "conversations", note: "Metadata, authenticated and anonymous", state: "derived" },
              { label: "messages", note: "Bodies, including generated animation code", state: "derived" },
              { label: "animation-cache", note: "Embeddings and cached animations · 30d TTL", state: "derived" },
              { label: "key schema — not in this repo", state: "inferred" },
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

/** Edges between the roots.
 *
 *  Request sequence only. Five write-edges into `tables` used to live here and
 *  were the reason this layer read as clutter: a process sequence and a
 *  dependency fan-in drawn in one edge set, which no architectural convention
 *  does. "Everything writes to the store" is one fact about what the store is,
 *  not five edges — it moved into the node's own line. The `tables → infra`
 *  edge went the same way: `infra` is already a ghost node marked `inferred`
 *  and titled "Not in this repo", which states the uncertainty better than an
 *  arrow labelled with a question could. */
export const E0: Edge[] = [
  { from: "asking", to: "gate", state: "derived", label: "checked by" },
  { from: "gate", to: "generating", state: "derived", label: "allows" },
  { from: "generating", to: "watching", state: "derived", label: "streams into" },
  { from: "generating", to: "keeping", state: "derived", label: "saves" },
  { from: "keeping", to: "sharing", state: "derived", label: "can publish" },
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
