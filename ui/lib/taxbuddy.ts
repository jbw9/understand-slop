/**
 * taxBuddy — a real repository, read at /Users/jonathanmacmini/Desktop/Code/taxBuddy.
 *
 * Every fact below was read out of the source. Where something could not be
 * determined from the repo it is marked `inferred` or `partial` and says why,
 * rather than being filled in plausibly. Code at the leaves is quoted verbatim
 * with real line numbers, each one re-read at its offset before being pasted.
 *
 * Cut by PRODUCT STEP: what a filer does, in order. This repo does not need the
 * cut guessed — `ONBOARDING_STEPS` in lib/config/onboarding.ts IS the product's
 * own ordered list of stages, and the roots below follow it. That is why the
 * grouping here is `derived` rather than `inferred`.
 *
 * DEPTH. Every branch runs four to seven levels, because at every one of them
 * there was a different kind of thing left to say. The shape that recurs is:
 *
 *   root (what the filer does)
 *     → the parts of it (authored children)
 *       → one part's internals (a row that carries `under`)
 *         → the mechanism inside that (another `under`)
 *           → the data or the decision it turns on
 *             → the source, quoted verbatim
 *
 * A row only carries `under` when the arrow really is hiding a path. Rows whose
 * summary IS the whole fact stay flat, which is what keeps the deep ones worth
 * clicking.
 *
 * SOURCED FROM DOCS, NOT CODE: a few claims come from docs/STATUS.md rather
 * than from source — the ledger's zero rows, the unapplied migration, the
 * disconnected fingerprint module. Each is marked `partial` and names the doc.
 * They are the operator's report of what production does, which no amount of
 * reading the repo can confirm.
 *
 * ONE CORRECTION CARRIED THROUGHOUT: the repo's own comments in
 * lib/ai/runMarkdownExtraction.ts and lib/ai/openaiClient.ts say filer text
 * "lands on OpenAI" with AI_PROVIDER unset. That is stale. bedrockConfig.ts:22
 * resolves unset to BEDROCK. The finding is the stale comment, not the egress.
 */

import type { Anatomy, Edge, Link, Node, Source, State } from "@/lib/data";
import { rowId } from "@/lib/data";

export type { State, Anatomy, Node, Edge, Link, Source };

export const RUN = {
  command: "understand-slop map .",
  repo: "taxBuddy",
  commit: "2926aab",
  files: 306,
  elapsed: "—",
};

/* ── the tree ──────────────────────────────────────────────────
   L0 holds the roots. Everything deeper hangs off `children`, so there is no
   level cap anywhere in the data — only branches that happened to stop. */

/** The tree as authored. `L0` below is this, plus a node per deep row. */
const AUTHORED: Node[] = [
  /* ═══ 1. CONSENT ═══════════════════════════════════════════════
     Five levels: the gate → what it says / where it is stamped / what version
     means → the wording itself → the legal determination → WISP Attachment G. */
  {
    id: "consent",
    title: "Agreeing to be read",
    sub: "IRS §7216 disclosure, before anything is uploaded",
    state: "derived",
    col: 0,
    row: 0,
    detail:
      "US law forbids a preparer disclosing return information without written consent naming who receives it. taxBuddy names exactly two companies. That sentence is why the AI provider default is a compliance control rather than a preference.",
    evidence: "components/consent-modal.tsx, lib/config/consent.ts",
    children: [
      {
        id: "consent-wording",
        title: "What the filer agrees to",
        sub: "The panel text, and the promise inside it",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "components/consent-modal.tsx:178",
        anatomy: [
          {
            kind: "map",
            caption: "each clause, and what it binds",
            rows: [
              {
                from: "who receives it",
                to: "AWS and Supabase, named — and nobody else",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "components/consent-modal.tsx",
                    start: 180,
                    code: `                  Amazon Web Services (to convert your documents into
                  machine-readable text and to run the AI models that read them)
                  and Supabase, Inc. (secure database storage of your account,
                  your documents and your filing information). Those are the only
                  two companies we disclose your tax return information to, and
                  the only two that store it.`,
                    why: "The load-bearing sentence in the product. \"Only two\" is an absolute, so every processor the code can reach has to be one of these two — which is why a default model provider became a compliance control.",
                  },
                ],
              },
              {
                from: "what they may do",
                to: "process in the US only; not retain, sell, or train on it",
                state: "derived",
              },
              {
                from: "what it does NOT cover",
                to: "the public /check funnel — it has no consent step at all",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Wizard upload", value: "Behind the consent modal — the filer has agreed before a byte moves", state: "derived" },
                      { label: "/check upload", value: "No account, no consent screen, same extraction stack", state: "partial" },
                      { label: "Is that a §7216 disclosure?", value: "Not determinable here — the funnel has no engagement, so whether the rule attaches is a legal question the repo cannot answer", state: "inferred" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "consent-once",
        title: "Stamped once, never re-asked",
        sub: "POST /api/consent · write-once columns",
        state: "derived",
        col: 0,
        row: 1,
        evidence: "app/api/consent/route.ts",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Modal shown before first upload", detail: "The filer cannot reach an upload control without passing it.", state: "derived" },
              { n: 2, title: "POST /api/consent", detail: "Body carries nothing but the acknowledgement — the version is server-side.", state: "derived" },
              {
                n: 3,
                title: "Two columns stamped together",
                detail: "consent_7216_at and consent_7216_version, written as a pair so a timestamp can never exist without the wording it agreed to.",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "consent_7216_at", value: "timestamptz — when", state: "derived" },
                      { label: "consent_7216_version", value: "text — which wording, from CONSENT_7216_VERSION", state: "derived" },
                      { label: "Why both", value: "A timestamp alone records that someone agreed, not what to. The pair is the record.", state: "derived" },
                    ],
                  },
                ],
              },
              {
                n: 4,
                title: "Version is a constant, not a literal",
                detail: "CONSENT_7216_VERSION = \"1.2\", with a bump log explaining every change to the wording.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "the version history, as the file tells it",
                    rows: [
                      {
                        from: "1.1",
                        to: "recipient list NARROWED to AWS and Supabase; OpenAI and LlamaParse removed",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/config/consent.ts",
                            start: 9,
                            code: `// 1.1 (2026-08-01) — the recipient list narrowed to AWS and Supabase only.
// OpenAI and LlamaParse were removed as processors; \`aiProvider\` now defaults to
// Bedrock so nothing reaches OpenAI. A filer who consented under 1.0 agreed to a
// WIDER disclosure than 1.1 describes, so no re-consent is required — but if the
// list ever GROWS, that is a new disclosure and the version must bump again.`,
                            why: "The asymmetry is the whole rule: narrowing is safe without re-consent because the old agreement already covered more. Growing the list is a new disclosure. That sentence is what makes AI_PROVIDER=openai a legal act rather than a config change.",
                          },
                        ],
                      },
                      {
                        from: "1.2",
                        to: "wording only — rests on an auxiliary-service determination at WISP.md Attachment G",
                        state: "derived",
                        under: [
                          {
                            kind: "facts",
                            rows: [
                              { label: "Subject", value: "Vercel Inc. — the runtime the app is deployed on", state: "derived" },
                              { label: "Determination", value: "Auxiliary services under Reg. §301.7216-1(b)(2)(iii), NOT a §7216 disclosure recipient", state: "derived" },
                              { label: "Why it matters", value: "If Vercel WERE a recipient, the modal's \"only two companies\" would be false on its face", state: "derived" },
                              { label: "The void trigger", value: "The determination lapses the moment the runtime begins to STORE filer data, logs included", state: "partial" },
                              { label: "Verifiable here?", value: "No. Whether the runtime stores logs is a deployment fact, not a repo fact", state: "inferred" },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { n: 5, title: "Never re-asked", detail: "Nothing re-prompts on a later visit. A wording change is invisible to an existing filer unless the version bump is noticed by a human.", state: "partial" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 2. ELIGIBILITY ═══════════════════════════════════════════
     Six levels: the gate → the five-year rule → the counting → the formula
     that is absent → Form 8843's lines → the source. */
  {
    id: "eligibility",
    title: "Can we even file for you",
    sub: "The five-year rule, and the one test that isn't implemented",
    state: "partial",
    alarm: true,
    col: 0,
    row: 0,
    detail:
      "taxBuddy files Form 1040-NR, which is only correct for a nonresident. The whole product rests on this gate — and the IRS's actual residency test, the 3-year weighted substantial-presence formula, is not in the codebase.",
    evidence: "lib/rules/eligibility.ts",
    children: [
      {
        id: "elig-rule",
        title: "The five-year rule",
        sub: "EXEMPT_YEAR_LIMIT = 5 · the gate is >",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "An F-1 student is an 'exempt individual' — exempt from counting days toward residency — for five calendar years. Year six, they are a resident and this product no longer applies to them.",
        evidence: "lib/rules/eligibility.ts:208",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Count the exempt years",
                detail: "countedExemptYears filters the status grid for years carrying a non-empty letter, and counts the keys.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/eligibility.ts",
                    start: 208,
                    code: `export function countedExemptYears(statusYears: ExemptStatusYears): number[] {
  return Object.keys(statusYears)
    .map(Number)
    .filter((year) => Number.isFinite(year) && (statusYears[year] ?? "").trim() !== "")
    .sort((a, b) => a - b);
}`,
                    why: "A count of KEYS, not a span of dates. Someone present Jan-Feb of five years and someone present for five continuous years produce the same number — the rule is defined in calendar years, so that is correct, and it is also why no date arithmetic appears anywhere near it.",
                  },
                ],
              },
              {
                n: 2,
                title: "Compare against the limit",
                detail: "exemptYearsUsed > EXEMPT_YEAR_LIMIT blocks. Strictly greater, so exactly 5 passes and 6 blocks.",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "4 years used", value: "Passes — still exempt", state: "derived" },
                      { label: "5 years used", value: "Passes. The gate is >, not >=", state: "derived" },
                      { label: "6 years used", value: "Blocked — resident for tax purposes, wrong form", state: "derived" },
                    ],
                  },
                ],
              },
              {
                n: 3,
                title: "Zero years fails CLOSED",
                detail: "An empty answer means the input never arrived, not that the filer was never a student. Counting zero would pass everyone.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/eligibility.ts",
                    start: 434,
                    code: `  } else if (exemptYearsUsed === 0) {
    // The grid always seeds the tax year, so an empty answer means the input
    // never made it here rather than that the filer was never a student. Fail
    // closed: silently counting zero years would pass everyone.
    passed = false;`,
                    why: "The distinction between 'no' and 'no answer'. Because the grid always seeds the current tax year, a genuine zero is impossible — so zero can only mean the data is missing, and the safe reading of missing data on a gate is refusal.",
                  },
                ],
              },
              {
                n: 4,
                title: "One writer of 'blocked'",
                detail: "app/api/eligibility/route.ts:87 is the only place in the repo that writes stage 'blocked'.",
                state: "derived",
              },
            ],
          },
        ],
      },
      {
        id: "elig-missing",
        title: "The test that isn't here",
        sub: "Substantial presence — not implemented",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The IRS residency test is a weighted three-year sum: all of this year's days, a third of last year's, a sixth of the year before. 183 or more and you are a resident. That formula does not exist in this repository.",
        evidence: "grep: no 1/3, no 1/6, no weighted sum in lib/rules/",
        anatomy: [
          {
            kind: "map",
            caption: "what the IRS asks for vs. what the code does",
            rows: [
              {
                from: "IRS test",
                to: "days(Y) + days(Y-1)/3 + days(Y-2)/6 ≥ 183 → resident",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "what was searched for, and what 183 actually is here",
                    rows: [
                      { from: "the weighting", to: "no * (1/3), no / 3 near 'prior', no 0.3333, no 0.16666, no 'weighted' anywhere in lib/rules or lib/audit", state: "derived" },
                      {
                        from: "the number 183",
                        to: "present — but as a DIFFERENT rule that happens to share it",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/income.ts",
                            start: 460,
                            code: `  // A filer present 183+ days with a net LOSS is reportable but not taxable:
  // the lots still have to be shown, line 18 just enters -0-.
  const capitalGainsReportable = capitalGainsPresentDays >= config.capital_gains_presence_days;
  const capitalGainsTaxable = capitalGainsReportable && capitalGainsNet > 0;`,
                            why: "The only 183 in the codebase, and it is the capital-gains presence threshold, not residency. Two unrelated tax rules share a number — which is exactly how a reader could convince themselves substantial presence is implemented when it is not.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                from: "what the code does",
                to: "the five-year exempt-individual rule alone — and refuses everyone it doesn't cover",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "Why the omission is survivable", detail: "An F-1 inside five years is exempt from counting days at all, so substantial presence never applies to anyone the gate admits.", state: "derived" },
                      {
                        n: 2,
                        title: "The gate refuses rather than tests",
                        detail: "Every filer the five-year rule cannot answer for is turned away with a reason, not evaluated.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/eligibility.ts",
                            start: 425,
                            code: `  } else if (!isF1) {
    passed = false;
    reasoning = \`We currently only support F-1 students. Your I-94 shows a \${input.visaClass} status, which isn't covered yet.\`;
  } else if (input.hasGreenCard) {
    passed = false;
    reasoning = "Green card holders are treated as US residents for tax purposes, which is outside what we support right now.";
  } else if (input.changedVisaType) {
    passed = false;
    reasoning = "You mentioned changing visa type at some point, which we can't account for yet. Not supported yet.";`,
                            why: "Each refusal names its own reason in the filer's words and every one says \"yet\". The chain is a scope boundary written as a conversation — which is why the missing formula costs nobody a wrong return: they are turned away before it would be needed.",
                          },
                        ],
                      },
                      { n: 3, title: "Deliberate or unfinished?", detail: "Not determinable from the repository. Nothing records which, and the two look identical from the outside.", state: "inferred" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "elig-8843",
        title: "Form 8843, line by line",
        sub: "The form that proves the exemption",
        state: "derived",
        col: 0,
        row: 2,
        detail:
          "Every exempt individual files this, income or not. Lines 11 and 12 are the five-year rule written onto paper — and line 12 is computed from the same count as the gate so the two can never contradict.",
        evidence: "lib/rules/forms/f8843.ts:85",
        anatomy: [
          {
            kind: "map",
            caption: "form line ← what fills it",
            rows: [
              { from: "line 1a", to: "visa class held during the tax year", state: "derived" },
              { from: "line 11", to: "the exempt years themselves, listed", state: "derived" },
              {
                from: "line 12",
                to: "\"were you exempt for more than 5 years?\" — computed, never asserted",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/forms/f8843.ts",
                    start: 85,
                    code: `    // Line 12 asks the five-year question itself: "present as a teacher,
    // trainee, or student for any part of more than 5 calendar years?" Derived
    // from the same count that drives the Stage 0 gate rather than hardcoded, so
    // the answer can't contradict line 11 above it. In current scope the gate
    // blocks before a >5 filer reaches here, so this is "no" in practice — but
    // it is now a computed "no", not an asserted one.
    "f8843.12": residency.exemptYearsUsed > EXEMPT_YEAR_LIMIT ? "yes" : "no",`,
                    why: "The same expression as the gate, reused rather than restated. A hardcoded \"no\" would be correct today and silently wrong the day the gate widens — this cannot drift because there is only one copy of the rule.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  /* ═══ 3. INCOME DOCUMENTS ══════════════════════════════════════
     Six levels: the step → the question order → why that order → the client
     queue → the cancel race → the source. */
  {
    id: "income-docs",
    title: "Handing over the documents",
    sub: "Upload order is a latency budget, not a narrative",
    state: "derived",
    col: 0,
    row: 0,
    detail:
      "Every step that uploads a document is followed by questions that don't depend on it, so the parse runs while the filer types. The ordering of this wizard is a performance decision written into a config file.",
    evidence: "lib/config/onboarding.ts, lib/client/incomeExtractionQueue.ts",
    children: [
      {
        id: "inc-order",
        title: "Why the steps are in this order",
        sub: "5 stages, each hiding the previous one's parse",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "lib/config/onboarding.ts:1",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "eligibility", detail: "Documents plus questions that don't depend on them.", state: "derived" },
              { n: 2, title: "confirm", detail: "Needs the I-94/I-20 read, which step 1 awaits on Continue — so this never spins. Last place a filer can be rejected.", state: "derived" },
              {
                n: 3,
                title: "interview",
                detail: "The slowest parse in the app: a consolidated broker 1099 runs many pages. Which is why profile FOLLOWS it rather than precedes it.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "questions ordered slowest-document-first",
                    rows: [
                      { from: "Sold assets", to: "1099 questions first — the longest parse starts earliest", state: "derived" },
                      { from: "Had a scholarship", to: "1042-S next", state: "derived" },
                      { from: "Worked in the US", to: "W-2 last of the document questions", state: "derived" },
                      { from: "the final two", to: "need no document at all — pure runway while the 1099 finishes", state: "derived" },
                    ],
                  },
                ],
              },
              {
                n: 4,
                title: "profile",
                detail: "The longest form in the product, deliberately placed where it hides the income parse.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/config/onboarding.ts",
                    start: 1,
                    code: `// Stages that actually have a built route. lib/types.ts's Stage type also
// lists "review"/"file" for later, but nothing routes there yet.
// ORDER IS A LATENCY DECISION, NOT A NARRATIVE ONE. Every step that uploads a
// document is followed by a step made of questions that don't depend on it, so
// the parse runs while the filer types instead of behind a spinner. Moving a
// step here re-prices the whole flow — see the runway note on each entry.`,
                    why: "The clearest statement of the product's core performance trick. It also warns that the order is load-bearing: moving a step changes how long filers stare at a spinner, and five hand-stamped stage strings in API routes have to move with it.",
                  },
                ],
              },
              { n: 5, title: "payout", detail: "The first screen that can state a refund, and the only place bank details are collected.", state: "derived" },
            ],
          },
          {
            kind: "facts",
            rows: [
              { label: "Phases vs steps", value: "4 phases over 5 steps — eligibility is split across two routes with nothing on screen saying so", state: "derived" },
              { label: "Checked at module load", value: "Phase spans must sum to the step count or the module throws", state: "derived" },
              { label: "Why not a test", value: "The failure is silent — a short phase list renders a rail that stops advancing, which looks like a CSS bug", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "inc-queue",
        title: "The client-side queue",
        sub: "Module state that outlives every component",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "Uploads are fire-and-forget. A module-level registry tracks what is in flight so a later step can ask 'may I advance yet' — and it is deliberately scoped to the JS context, because a reload kills the fetches too.",
        evidence: "lib/client/incomeExtractionQueue.ts:19",
        anatomy: [
          {
            kind: "map",
            caption: "two registries, one module",
            rows: [
              {
                from: "inFlight (a number)",
                to: "answers \"may I advance yet\" — synchronously",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "hasPendingIncomeExtractions()", value: "Synchronous read of inFlight > 0", state: "derived" },
                      { label: "Why synchronous matters", value: "It decides whether the processing screen appears AT ALL — asked after an await, it paints for one frame on every filing", state: "derived" },
                      { label: "settleIncomeExtractions()", value: "Resolves immediately at zero, else parks a resolver until the count drains", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "tracked (named rows)",
                to: "answers \"what is the filer waiting on\"",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Replaced, never mutated", value: "So useSyncExternalStore can compare snapshots by identity", state: "derived" },
                      { label: "Rows stay after settling", value: "The screen checks them off rather than vanishing them", state: "derived" },
                      { label: "Why co-located", value: "They are the same event — two modules would drift the moment one missed a settle", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "cancel",
                to: "aborts the fetch — or un-persists it if the abort lost the race",
                state: "derived",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "Call every canceller for that docType", detail: "Reaches the AbortControllers held in the upload slot, which may already be unmounted — hence the module-level registry.", state: "derived" },
                      { n: 2, title: "Drop the named rows", detail: "Or the processing screen keeps listing a document the filer just disclaimed.", state: "derived" },
                      {
                        n: 3,
                        title: "Leave the COUNT alone",
                        detail: "An aborted fetch still rejects, which still runs settle, which still decrements. Decrementing here too would double-count.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/client/incomeExtractionQueue.ts",
                            start: 184,
                            code: `export function cancelIncomeExtractions(...docTypes: string[]): void {
  for (const docType of docTypes) {
    for (const cancel of cancellers.get(docType) ?? []) cancel();
  }
  // Drop the named rows too, or the processing screen keeps listing a document
  // the filer just said they don't have. The in-flight COUNT is left to each
  // read's own settle — an aborted fetch still resolves.
  const kept = tracked.filter((row) => !docTypes.includes(row.docType));`,
                            why: "The division of labour is the subtle part: cancel touches cancellers and rows, never the counter. Leak the count and settleIncomeExtractions hangs forever, which the filer sees as a processing screen that never finishes.",
                          },
                        ],
                      },
                      { n: 4, title: "If it already committed", detail: "The emptied entries list makes the read's own 'removed while I was reading' branch fire — it deletes the income from the server rather than leaving it behind.", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "inc-cancel",
        title: "The race that wrote a wrong return",
        sub: "A guard that was false exactly when it mattered",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Answer yes, drop a W-2, change to no before the parse lands. The clear was gated on the data having already arrived — which is precisely false during the window that matters. The read committed wages after the filer said they had none.",
        evidence: "app/(protected)/onboarding/interview/page.tsx:180",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "The bug, as the file describes it",
                detail: "The guard `w2s.length > 0` is false while the document is still being read — so nothing was cleared and nothing was cancelled.",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "app/(protected)/onboarding/interview/page.tsx",
                    start: 180,
                    code: `  // ⚠ These clears are deliberately UNCONDITIONAL, and they cancel first.
  //
  // They used to be gated on the data having already arrived (\`w2s.length > 0\`),
  // which is precisely false during the window that matters: while the document
  // is still being read. Answer yes, drop a W-2, change to no before the parse
  // lands (3–300s) and the guard saw an empty array, so nothing was cleared and
  // nothing was cancelled — then the in-flight read committed wages to the case
  // file after the filer said they had none. The interview's own state stayed
  // empty so nothing on screen showed it, and the engine still summed it into
  // the refund and onto 1040-NR line 1a.`,
                    why: "A guard that looked like defensive programming WAS the bug. The consequence is the worst kind: a silently wrong tax return — invisible on screen, real on line 1a. The fix was deleting the condition, not strengthening it.",
                  },
                ],
              },
              {
                n: 2,
                title: "Cancel first, then clear",
                detail: "Reversed, the clear lands and the still-running read puts the income straight back.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(protected)/onboarding/interview/page.tsx",
                    start: 194,
                    code: `  function handleWorkedInUsChange(value: YesNo) {
    setValue("workedInUs", value);
    if (value === "no") {
      cancelIncomeExtractions("w2");
      setW2s([]);
      void persistIncome("w2s", []);
    }
  }`,
                    why: "Three lines whose ORDER is the fix. The void is deliberate fire-and-forget — the interview must not block on a save, because the payout gate re-reads the server later and is the real safety net.",
                  },
                ],
              },
              { n: 3, title: "Three handlers, identical shape", detail: "W-2, 1042-S and the four 1099 arrays each cancel their own docType. Keyed so de-selecting one income type cannot cancel another's read.", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "inc-lost",
        title: "The lost-update bug",
        sub: "Two documents, one stale snapshot",
        state: "derived",
        col: 0,
        row: 3,
        detail:
          "Each upload computed [...items, extracted] from the state captured when it started. Two documents dropped together meant the second save erased the first — after it had been extracted and paid for.",
        evidence: "lib/client/useIncomeUploads.ts:25",
        anatomy: [
          {
            kind: "map",
            caption: "two mechanisms, both required",
            rows: [
              {
                from: "serialize()",
                to: "one commit at a time — fixes ORDERING",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Shape", value: "chain.current.then(work, work) — same handler for both outcomes", state: "derived" },
                      { label: "Why both", value: "A rejected commit must not stall the queue behind it", state: "derived" },
                      { label: "What the caller gets", value: "The real promise; the chain keeps a neutralized .catch copy", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "live read()",
                to: "each commit sees the last one's write — fixes STALENESS",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/client/useIncomeUploads.ts",
                    start: 25,
                    code: `// Two mechanisms together close it, and BOTH are needed:
//   - \`commit\` runs through \`serialize()\`, one document at a time, so no two
//     commits interleave; and
//   - the slot reads its canonical array through \`useLiveState\`'s \`read()\`
//     rather than from a closure, so each commit sees what the one before it
//     just wrote.
// Serializing alone would still hand every commit a stale snapshot. Reading
// live alone would still let two read-modify-writes interleave.`,
                    why: "Two orthogonal failure modes needing two mechanisms. The last two sentences exist to pre-empt the obvious future 'simplification' of dropping either half — and the endpoint replaces the whole array, so the client owns this correctness entirely.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 4. EXTRACTION ════════════════════════════════════════════
     Seven levels: the step → BDA / the three legs / the ladder → the SigV4
     call → the S3 two-hop → the poll schedule → the source. */
  {
    id: "extraction",
    title: "Turning documents into data",
    sub: "A PDF becomes numbers — three models, one arbiter",
    state: "partial",
    alarm: true,
    col: 0,
    row: 0,
    detail:
      "A PDF goes to AWS Bedrock Data Automation for markdown, then three independent model legs read that markdown into typed fields. They are compared, and disagreements are supposed to be logged. The ledger reports zero rows against fourteen filings.",
    evidence: "lib/parsing/bdaParse.ts, lib/extraction/, lib/ai/",
    children: [
      {
        id: "read-bda",
        title: "How BDA actually works",
        sub: "Hand-rolled SigV4 · S3 staging · a two-hop indirection",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "There is no SDK for this. 306 lines sign their own AWS requests, stage the PDF in S3, poll for completion, then follow a pointer inside a pointer to find the output.",
        evidence: "lib/parsing/bdaParse.ts",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Stage the PDF in S3",
                detail: "Written to staging/input/{runId}.pdf. BDA reads from a bucket, never from a request body.",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Input key", value: "staging/input/{runId}.pdf", state: "derived" },
                      { label: "Output prefix", value: "staging/output/{runId}/", state: "derived" },
                      { label: "Deleted after?", value: "Attempted — and the failure path is a console.warn, not a throw", state: "partial" },
                    ],
                  },
                ],
              },
              {
                n: 2,
                title: "Sign the request by hand",
                detail: "SigV4 over a JSON-1.1 target header. The signing service is 'bedrock' — not the endpoint's own name, which is the trap.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/parsing/bdaParse.ts",
                    start: 120,
                    code: `    new HttpRequest({
      method: "POST",
      protocol: "https:",
      hostname,
      path: "/",
      headers: { host: hostname, "x-amz-target": target, "content-type": "application/x-amz-json-1.1" },
      body: payload,
    })
  );`,
                    why: "An AWS API called without an AWS SDK. Everything is manual: the target header names the operation, the path is always \"/\", and the body is JSON-1.1 — an RPC protocol wearing HTTP's clothes.",
                  },
                ],
              },
              {
                n: 3,
                title: "Invoke, then poll",
                detail: "InvokeDataAutomationAsync returns an invocation ARN. The poll schedule is front-loaded: 4s, then 1s, 1s, 1s, widening to 3s.",
                state: "derived",
                under: [
                  {
                    kind: "bars",
                    unit: "poll interval (ms), in order",
                    rows: [
                      { label: "1st", value: 4000, display: "4000 — one long wait first", state: "derived" },
                      { label: "2nd-4th", value: 1000, display: "1000 each — most jobs land here", state: "derived" },
                      { label: "5th-6th", value: 1500, display: "1500", state: "derived" },
                      { label: "7th-8th", value: 2000, display: "2000", state: "derived" },
                      { label: "9th", value: 2500, display: "2500", state: "derived" },
                      { label: "10th", value: 3000, display: "3000 — then it gives up", state: "derived" },
                    ],
                  },
                ],
              },
              {
                n: 4,
                title: "Follow the pointer to the pointer",
                detail: "The job result names a metadata file; that file names the standard output path. Two hops before any markdown exists.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/parsing/bdaParse.ts",
                    start: 225,
                    code: `    const standardPath = metadata.output_metadata?.[0]?.segment_metadata?.[0]?.standard_output_path;
    if (!standardPath) {
      throw new Error(\`BDA output metadata had no standard_output_path: \${JSON.stringify(metadata).slice(0, 300)}\`);
    }

    const output = await getS3Json<StandardOutput>(s3UriToKey(standardPath));
    const pages = (output.pages ?? [])
      .map((p) => p.representation?.markdown ?? p.representation?.text ?? "")
      .filter((p) => p.length > 0);`,
                    why: "Four levels of optional chaining to reach a filename. The fallback chain markdown → text → empty means a page BDA could not represent silently becomes an empty string rather than an error — which is exactly the failure the three-leg comparison downstream exists to catch.",
                  },
                ],
              },
              {
                n: 5,
                title: "No retries at this layer",
                detail: "A failed BDA job throws. Whatever called it decides what to do — the parser itself never tries twice.",
                state: "derived",
              },
            ],
          },
          {
            kind: "facts",
            rows: [
              { label: "Project ARN", value: "AWS's public default project — not one this account created", state: "derived" },
              { label: "Profile ARN", value: "Constructed from account and region rather than configured", state: "derived" },
              { label: "The Coral trap", value: "An error can arrive as HTTP 200 with an error body, so status alone is not success", state: "derived" },
              { label: "Staged PDF deletion", value: "403s in production and logs a warning naming the PII left behind — per docs/STATUS.md", state: "partial" },
            ],
          },
        ],
      },
      {
        id: "read-legs",
        title: "Three readers, one answer",
        sub: "Two models on markdown, one on the raw PDF",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "The same document is read three independent ways. Agreement is evidence; disagreement is the signal that a parser dropped something.",
        evidence: "lib/ai/bedrockConfig.ts, lib/extraction/",
        anatomy: [
          {
            kind: "map",
            caption: "leg → what it reads",
            rows: [
              { from: "A · bda-primary", to: "haiku-4-5 over BDA's markdown — the canonical leg", state: "derived" },
              { from: "B · cross-read", to: "minimax-m2.5 over the same markdown — a different model, same text", state: "derived" },
              {
                from: "C · pdf-direct",
                to: "haiku over the raw PDF — skips the parser entirely",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Why a third leg", value: "A and B share BDA's markdown, so they share its mistakes. C is the only leg that can catch the PARSER being wrong", state: "derived" },
                      { label: "What it costs", value: "Reading a PDF directly is the most expensive of the three", state: "derived" },
                      { label: "Canonical by default", value: "bda, unless EXTRACTION_CANONICAL_LEG says pdf-direct", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "why three at all",
                to: "a measured failure: LlamaParse put a date 11 months wrong, silently",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Measured over", value: "65 documents", state: "derived" },
                      { label: "What happened", value: "A travel row was silently dropped and a residency date landed 11 months wrong", state: "derived" },
                      { label: "Why it wasn't caught", value: "Every downstream check still passed — the value was well-formed, just wrong", state: "derived" },
                      { label: "The lesson encoded", value: "A single reader cannot detect its own omission. Only disagreement can", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "read-prompt",
        title: "What the model is told",
        sub: "Dual schema · the field descriptions ARE the prompt",
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "Each document type has a hand-written JSON Schema whose field descriptions the model reads, plus a Zod schema that re-validates the reply. The two are maintained in parallel with no generation between them.",
        evidence: "lib/ai/extractionSpecs.ts",
        anatomy: [
          {
            kind: "map",
            caption: "the arrangement, and the hazard in it",
            rows: [
              {
                from: "JSON Schema",
                to: "carries the prose the model actually reads",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/ai/extractionSpecs.ts",
                    start: 231,
                    code: `            "COMPLETENESS — READ TO THE END OF THE DOCUMENT: the table often " +
            "breaks across pages, and the final row(s) frequently do not stay in " +
            "the table. After a page break they can appear as loose lines or " +
            "headings, one value per line, in the order row-number / date / type / " +
            "location (e.g. \\"9\\", \\"2021-09-16\\", \\"Arrival\\", \\"SEA\\"). Those are " +
            "travel-history rows and must be included, appended in row-number " +
            "order after the rows from the table. If the table ends at row 8 and a " +
            "stray \\"9\\" block follows, there are 9 rows, not 8 — the stranded row " +
            "is usually the earliest arrival, which is the row that determines the " +
            "residency start date."`,
                    why: "This is the prompt, and it is a field description. It encodes a specific observed failure — a page break stranding the earliest arrival — and says why that row matters more than the others: it sets the residency start date, which decides the whole return.",
                  },
                ],
              },
              {
                from: "Zod schema",
                to: "re-validates the reply on the way out",
                state: "derived",
              },
              {
                from: "the hazard",
                to: "neither is generated from the other — they drift by hand",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Specs maintained", value: "8 document types, each with both schemas", state: "derived" },
                      { label: "Generation between them", value: "None. Adding a field means editing two places", state: "derived" },
                      { label: "What drift looks like", value: "A field the model is told to return but Zod rejects — or one Zod expects that the model was never asked for", state: "partial" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "read-ladder",
        title: "When the numbers don't foot",
        sub: "Arithmetic check, then a second text layer",
        state: "derived",
        col: 0,
        row: 3,
        detail:
          "Before comparing legs, each read is checked against itself: do the parts sum to the total? If not, a different text extractor gets a turn.",
        evidence: "lib/extraction/resolve.ts",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Does it foot?", detail: "Arithmetic footing on the fields that should sum. A statement whose parts don't add up was read wrong.", state: "derived" },
              {
                n: 2,
                title: "Re-read with pdftotext",
                detail: "A layout-preserving text layer, spawned as a process with the PDF on stdin.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/extraction/resolve.ts",
                    start: 219,
                    code: `      // spawn + stdin, NOT execFile's \`input\`: that option belongs to the *Sync
      // family and is silently ignored by async execFile, which hands pdftotext
      // an empty stdin and yields an empty page. It fails as "this document has
      // no text layer" — indistinguishable from a genuine scan, and wrong on
      // every document.
      child = spawn("pdftotext", ["-layout", "-", "-"], { stdio: ["pipe", "pipe", "ignore"] });`,
                    why: "A Node API footgun with a tax consequence. The wrong call produces empty output that looks exactly like a legitimately scanned document — so the bug masquerades as a correct diagnosis, on every file, forever.",
                  },
                ],
              },
              { n: 3, title: "Guard on digits", detail: "A page with fewer than two digits is not a usable text layer, whatever it returned.", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "read-ledger",
        title: "The disagreement ledger",
        sub: "Built, wired, and reporting nothing",
        state: "partial",
        alarm: true,
        col: 0,
        row: 4,
        detail:
          "When legs disagree the difference is meant to be written to a table for review. docs/STATUS.md reports zero rows against fourteen filings — and five nested swallows mean a broken writer and a genuinely quiet extractor look identical.",
        evidence: "lib/extraction/disagreementLog.ts:85",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Rows today", value: "0, against 14 filings — per docs/STATUS.md", state: "partial" },
              { label: "Swallowed exceptions", value: "5 nested try/catch around the write", state: "derived" },
              { label: "What that means", value: "A broken writer and a genuinely quiet extractor produce identical observable behaviour", state: "partial" },
              { label: "Identifiers", value: "Redacted before writing — the ledger stores field paths, not values", state: "derived" },
              { label: "Reads", value: "Stored in extraction_disagreements", state: "derived" },
            ],
          },
          {
            kind: "map",
            caption: "which fields are even compared",
            rows: [
              {
                from: "TAX_LINE",
                to: "a regex per document type — only these fields can disagree",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/extraction/compare.ts",
                    start: 103,
                    code: `const TAX_LINE: Record<ExtractionKind, RegExp> = {
  w2: /^(box1|box2|box3|box4|box5|box6|box15State|box17StateTaxWithheld|box19LocalIncomeTax)$/,
  i94: /^(firstEntryDate|visaClass|citizenship|dob|legalName|travelHistory\\.)/,
  i20: /^(schoolName|dsoName|earliestAdmissionDate|programStartDate|programEndDate)$/,`,
                    why: "The comparison is scoped to fields that actually reach a tax line. It bounds the noise — but it also bounds what the ledger can ever notice, so a field outside these patterns can disagree freely and silently.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "read-egress",
        title: "Which company reads the document",
        sub: "Two stale comments describe a posture the code dropped",
        state: "partial",
        alarm: true,
        col: 0,
        row: 5,
        detail:
          "Unset AI_PROVIDER resolves to Bedrock, and the default was flipped specifically to keep the consent promise true. Two files still carry comments saying it lands on OpenAI. The finding is the stale comment, not the egress.",
        evidence: "lib/ai/bedrockConfig.ts:22",
        anatomy: [
          {
            kind: "map",
            caption: "what each file says",
            rows: [
              {
                from: "bedrockConfig.ts:22",
                to: "unset ⇒ bedrock — and says why in ten lines above it",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/ai/bedrockConfig.ts",
                    start: 12,
                    code: `// ⚠ This default is now a COMPLIANCE control, not a preference. Our §7216
// consent, the privacy notice, /security and WISP.md all state that the only
// processors receiving filer tax data are Supabase and AWS. Defaulting to
// OpenAI made that false: \`lib/check/f1040nrScoring.ts\` drives this runner
// directly, so with AI_PROVIDER unset the public /check tool was sending
// document text to a processor the filer never consented to.
//
// Setting AI_PROVIDER=openai re-introduces a processor that is NOT named in any
// of those documents. Do not set it without updating all four and bumping
// CONSENT_7216_VERSION.
export const aiProvider: AiProvider =
  process.env.AI_PROVIDER === "openai" ? "openai" : "bedrock";`,
                    why: "An environment variable with a legal meaning. The comment names the four documents that would become false and the constant that must bump — so the next person to set it knows they are amending a disclosure, not tuning a model.",
                  },
                ],
              },
              {
                from: "runMarkdownExtraction.ts:21",
                to: "\"Since AI_PROVIDER is unset, both land on OpenAI\" — stale, and wrong",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      {
                        n: 1,
                        title: "The comment, in full",
                        detail: "Three of its four sentences are accurate. The fourth is the one a reader would act on.",
                        state: "partial",
                        under: [
                          {
                            kind: "source",
                            file: "lib/ai/runMarkdownExtraction.ts",
                            start: 18,
                            code: `// ⚠ This is NO LONGER the path document uploads take. extractFromMarkdown reads
// every document three times and calls Bedrock directly, bypassing this file
// entirely. Two callers are left: the EXTRACTION_MULTI_READ=false rollback, and
// lib/check/f1040nrScoring.ts. Since AI_PROVIDER is unset, both land on OpenAI.`,
                            why: "A warning comment that is itself out of date — the most dangerous kind, because its ⚠ and its accurate caller list buy credibility for the one clause that is false. bedrockConfig.ts:22 resolves unset to Bedrock.",
                          },
                        ],
                      },
                      { n: 2, title: "Repeated in a second file", detail: "lib/ai/openaiClient.ts:5-8 carries the same claim, so a reader who checks one for corroboration finds the other.", state: "partial" },
                      { n: 3, title: "What a reader would conclude", detail: "That filer text already reaches a processor outside the consent — i.e. that the promise is broken. It is not: the default was flipped precisely to keep it true.", state: "partial" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  /* ═══ 5. IDENTITY ══════════════════════════════════════════════
     Five levels: who is filing → the gate that holds payout → why it re-reads
     the server → the durable expression of the gate → the source. */
  {
    id: "identity",
    title: "Who is filing, and the payout gate",
    sub: "The longest form — and the barrier before any refund is shown",
    state: "partial",
    alarm: true,
    col: 0,
    row: 0,
    detail:
      "Profile collects the filer's legal identity and SSN/ITIN. Its Continue button holds the whole flow until every income document has finished reading — because the next screen states a refund, and a refund computed from a half-parsed case file is worse than a slow one.",
    evidence: "app/(protected)/onboarding/profile/page.tsx, app/api/profile/route.ts",
    children: [
      {
        id: "id-gate",
        title: "The gate before the number",
        sub: "Check synchronously, await, then re-read the server",
        state: "derived",
        col: 0,
        row: 0,
        evidence: "app/(protected)/onboarding/profile/page.tsx:276",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Save the profile", detail: "POST /api/profile. On success the session draft is cleared — the backend is now the source of truth.", state: "derived" },
              {
                n: 2,
                title: "Ask BEFORE awaiting",
                detail: "hasPendingIncomeExtractions() is synchronous. Asked after the await, the screen paints for one frame on every filing.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(protected)/onboarding/profile/page.tsx",
                    start: 276,
                    code: `      // ⚠ CHECKED SYNCHRONOUSLY, BEFORE THE AWAIT. \`hasPendingIncomeExtractions\`
      // is what decides whether the filer sees the processing screen at all; ask
      // after awaiting and the screen paints for one frame on every filing,
      // which teaches them to ignore it. When nothing is in flight this stays
      // false and the button's own busy state covers the sub-second server
      // round-trips below, exactly as before. No extra waiting either way.
      if (hasPendingIncomeExtractions()) setIsWaitingOnDocs(true);
      await settleIncomeExtractions();`,
                    why: "One microtask decides whether a loading screen is meaningful or noise. This is the entire reason a synchronous hasPending exists beside the promise-based settle — and \"teaches them to ignore it\" is the actual cost being avoided.",
                  },
                ],
              },
              {
                n: 3,
                title: "Re-read the case file",
                detail: "An empty queue is ambiguous: 'all finished' and 'all destroyed by a reload' look identical from the client.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/(protected)/onboarding/profile/page.tsx",
                    start: 285,
                    code: `      // Re-read the case file rather than trusting the queue. A hard reload
      // between the two steps empties the queue AND kills the in-flight fetches
      // (the save to /api/documents/income is client-side), so an empty queue
      // does not by itself mean the data arrived. The server is the authority.
      const filing = await fetchFiling();`,
                    why: "The client's own bookkeeping is treated as a liveness hint, never as truth. Because the persistence hop is client-side, a reload destroys the fetches and the evidence of them together — so only the server can tell the two apart.",
                  },
                ],
              },
              {
                n: 4,
                title: "Refuse if documents are missing",
                detail: "The same shared rule the interview step uses, so the question and the answer cannot drift apart across two pages.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "one rule, asked on two different pages",
                    rows: [
                      {
                        from: "why it was extracted",
                        to: "the question and the answer now live on different pages",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/incomeDocs.ts",
                            start: 3,
                            code: `// Which income documents a filer's own answers make mandatory, and whether
// those documents have actually landed in the case file yet.
//
// This lives on its own because the question and the answer are now on DIFFERENT
// PAGES: the interview step asks (and uploads), the profile step that follows is
// what holds payout until the reads finish. Two copies of "is the income in yet"
// would drift, and the way they'd drift is a payout screen computed from a
// half-parsed case file — a wrong refund, not a broken page.`,
                            why: "The rationale for a shared module, stated as a consequence rather than a principle. Two copies would not fail loudly — they would disagree quietly, and the disagreement surfaces as a refund figure computed from documents that had not finished parsing.",
                          },
                        ],
                      },
                      {
                        from: "what it returns",
                        to: "the names of the missing documents, not a boolean",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/incomeDocs.ts",
                            start: 51,
                            code: `  const required = requiredIncomeDocs(answers);
  const has1099 =
    docs.f1099ints.length + docs.f1099divs.length + docs.f1099bs.length + docs.f1099das.length > 0;

  return [
    required.w2 && docs.w2s.length === 0 ? "W-2" : null,
    required.f1042s && docs.f1042s.length === 0 ? "1042-S" : null,
    required.f1099 && !has1099 ? "1099" : null,
  ].filter((name): name is string => name !== null);`,
                            why: "Returning names rather than a boolean is what lets both callers say WHICH document is missing. Note the four 1099 variants collapse into one presence test — any one of them satisfies the requirement.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                n: 5,
                title: "Only now advance the stage",
                detail: "/api/profile deliberately writes stage 'profile'. Only /api/documents/payout writes 'payout', after the gate has passed.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/api/profile/route.ts",
                    start: 39,
                    code: `      // Deliberately NOT "payout". Profile is the last step before payout, but
      // the income documents may still be reading when this save lands — the
      // client holds the advance to payout until they do (see the gate in the
      // profile page's onValid, which then calls /api/documents/payout). Writing
      // "payout" here would let a reload skip past that gate to a refund
      // computed from a half-parsed case file.
      stage: "profile",`,
                    why: "The stage string is the RESUME coordinate, so writing it early would let a reload route around an in-memory gate entirely. Holding it at \"profile\" is what makes the gate survive process death.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "id-validation",
        title: "What the server checks",
        sub: "The body is cast, not parsed",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The profile route casts the request body to a type and writes it. No schema, no regex, no length check — in a route file whose direct-deposit sibling validates properly.",
        evidence: "app/api/profile/route.ts:26",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "ssnOrItin · client", value: "Validated in the form before Continue", state: "derived" },
              { label: "ssnOrItin · server", value: "Cast only — `as ProfileRequestBody`, then written to profile_page", state: "partial" },
              { label: "The sibling route", value: "Direct deposit validates its fields properly, which is what makes this a gap rather than a house style", state: "partial" },
              { label: "Reachable how", value: "Any authenticated request, bypassing the form entirely", state: "partial" },
            ],
          },
          {
            kind: "map",
            caption: "what a cast actually does",
            rows: [
              {
                from: "as ProfileRequestBody",
                to: "a compile-time assertion with no runtime effect whatsoever",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "app/api/profile/route.ts",
                    start: 26,
                    code: `  const body = (await request.json()) as ProfileRequestBody;`,
                    why: "TypeScript's cast is erased at build time. At runtime this line is `await request.json()` and nothing else — the type name is documentation that the compiler believes and the server never enforces.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "id-draft",
        title: "Where half-typed answers live",
        sub: "sessionStorage — including the SSN",
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "Unsaved form input is kept per-tab so a refresh doesn't lose it, deliberately instead of a server round-trip. The watched draft covers every field, so the SSN/ITIN is in it until Continue.",
        evidence: "lib/client/useSessionFormDraft.ts:5",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Where", value: "sessionStorage, keyed per tax year", state: "derived" },
              { label: "What's in it", value: "Every watched field — ssnOrItin included", state: "partial" },
              { label: "The trade, as stated", value: "Avoids writing sensitive input to the server before Continue", state: "derived" },
              { label: "Cleared when", value: "Tab close, or an explicit clear on successful submit", state: "derived" },
              { label: "Precedence", value: "The draft wins over the backend on rehydrate", state: "derived" },
              { label: "Write failures", value: "Swallowed — Safari private mode throws on setItem, and a draft must never break a form", state: "derived" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 6. THE ENGINE ════════════════════════════════════════════
     Seven levels: the step → the phases → one computation → the mechanism →
     the lookup → the data → the source. This is the deepest branch. */
  {
    id: "engine",
    title: "Computing the refund",
    sub: "One straight-line pass — W-2 box 1 to the number on line 34",
    state: "derived",
    col: 0,
    row: 0,
    detail:
      "computeIncomeEngine is 563 lines of ordered assignments with no branching on filer type. Every dollar follows one path, and each line of that path corresponds to a numbered line on Form 1040-NR.",
    evidence: "lib/rules/income.ts:160",
    children: [
      {
        id: "eng-path",
        title: "One dollar's journey",
        sub: "W-2 box 1 → the refund, in eight named steps",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The engine takes the case file and returns a result. Following a single wage dollar through it is the shortest way to understand the whole computation.",
        evidence: "lib/rules/income.ts:189",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Sum the W-2s",
                detail: "wagesGross is box 1 across every W-2; wagesWithheld is box 2. Both plain sums.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 189,
                    code: `  const wagesGross = sum(w2s.map((w2) => w2.box1));
  const wagesWithheld = sum(w2s.map((w2) => w2.box2));
  const wagesTreatyRule = findTreatyRuleForCountryName(country, "wages", taxYear);`,
                    why: "The engine's first three lines, and the shape of all 563: read a fact, name it, move on. The treaty lookup sits immediately beside the gross so the exemption is computed before anything downstream can use the wrong figure.",
                  },
                ],
              },
              {
                n: 2,
                title: "Apply the treaty exemption",
                detail: "Three conditions must all hold: a rule exists, its time limit hasn't expired, and it carries no source restriction.",
                state: "derived",
                under: [
                  {
                    kind: "map",
                    caption: "the conjunction, term by term",
                    rows: [
                      { from: "a rule exists", to: "findTreatyRuleForCountryName returned something for this country and year", state: "derived" },
                      {
                        from: "not expired",
                        to: "exemptYearsUsed is within the treaty's own time limit",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/income.ts",
                            start: 255,
                            code: `    treatyTimeLimitBinds(wagesTreatyRule) && residency.exemptYearsUsed > wagesTreatyRule!.time_limit_years!;
  const wagesTreatyApplies =
    !!wagesTreatyRule && !wagesTreatyExpired && wagesTreatyRule.source_restriction === "none";`,
                    why: "Three independent ways for a treaty to not apply, evaluated as one conjunction. Each term is a different kind of failure — no treaty at all, a treaty that has run out, and a treaty that only covers income from a particular source.",
                          },
                        ],
                      },
                      { from: "no source restriction", to: "some treaties only exempt income paid from abroad — those are excluded here", state: "derived" },
                    ],
                  },
                ],
              },
              {
                n: 3,
                title: "Taxable wages",
                detail: "wagesTaxable = gross − exempt, unless a 1042-S already substantiated the exemption, in which case gross stands.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 282,
                    code: `  const wagesTaxable = round2(wagesExemptSubstantiatedBy1042S ? wagesGross : wagesGross - wagesTreatyExempt);`,
                    why: "The ternary encodes a paperwork rule: when the employer already reported the exempt portion on a 1042-S, subtracting it again would double-count the exemption. Same dollar, two documents, one subtraction.",
                  },
                ],
              },
              {
                n: 4,
                title: "Into the totals cascade",
                detail: "ECI → AGI → taxable income → tax → total tax → refund. Each line names its Form 1040-NR line in a trailing comment.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 605,
                    code: `  const effectivelyConnectedIncome = round2(wagesTaxable + scheduleOneAdditionalIncome);
  const adjustedGrossIncome = round2(effectivelyConnectedIncome - scheduleOneAdjustmentsToIncome); // line 11a = line 9 - line 10
  const taxableIncome = Math.max(0, round2(adjustedGrossIncome - deduction)); // line 15 = line 11b - line 14 (line 14 = deduction; 13a-13c unimplemented)
  const brackets = profile.filingStatus === "married_nra" ? config.brackets_mfs : config.brackets_single;
  const effectivelyConnectedTax = taxForIncome(taxableIncome, brackets); // line 16`,
                    why: "The tax form's own arithmetic, transcribed. The comments are line numbers because that is the specification — anyone checking this work is holding the paper form, and Math.max(0, …) is there because a deduction larger than income yields zero taxable income, never a negative.",
                  },
                ],
              },
              {
                n: 5,
                title: "Total tax and the refund",
                detail: "totalTax adds the Schedule NEC tax; refundOrDue is withholding minus tax. Positive is a refund.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 617,
                    code: `  const totalTax = round2(taxAfterCredits + scheduleNecAndOtherTaxes); // line 24 = 22+23d
  const totalWithholding = round2(
    wagesWithheld + interestWithheld + dividendsWithheld + capitalGainsWithheld + total1042SWithheld
  ); // line 33 = 25d(25a+25b+25c) + 25e + 25f + 25g(total1042SWithheld) + 26 + 32 — the unmodeled terms are all 0
  const refundOrDue = round2(totalWithholding - totalTax);`,
                    why: "The last line of the whole engine, and the only number the filer cares about. The comment on line 33 is unusually careful: it enumerates the form's terms and states that the ones not modeled are zero — so a reader can check the omission rather than discover it.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "eng-table",
        title: "Why the tax isn't just a multiplication",
        sub: "Below $100k the IRS uses a lookup table, not the brackets",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "For taxable income under $100,000 the IRS publishes a table in $50 bands, and the tax for a band is the bracket tax at its MIDPOINT. Applying the brackets directly gives a different number — and the return would be wrong.",
        evidence: "lib/rules/income.ts:751",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Under $100k → find the band midpoint",
                detail: "Bands widen with income: $5 below $25, $25 up to $3,000, then $50 all the way to $100,000.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 763,
                    code: `  if (taxableIncome < 3000) {
    const floor = Math.floor((taxableIncome - 25) / 25) * 25 + 25;
    return floor + 12.5;
  }
  const floor = Math.floor(taxableIncome / 50) * 50;
  return floor + 25;`,
                    why: "Floor to the band, then add half its width. The +12.5 and +25 are literally half of 25 and 50 — the midpoint of the band the income fell into, which is the figure the IRS taxed when it printed the table.",
                  },
                ],
              },
              {
                n: 2,
                title: "Tax the midpoint, round to the dollar",
                detail: "bracketTax at the midpoint, then the IRS convention: 50-99 cents rounds up.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 771,
                    code: `function roundToDollar(value: number): number {
  return Math.floor(value + 0.5); // IRS convention: 50-99 cents rounds up
}

function taxForIncome(taxableIncome: number, brackets: readonly [number, number, number][]): number {
  if (taxableIncome <= 0) return 0;
  const lookupIncome = taxableIncome < 100000 ? taxTableRowMidpoint(taxableIncome) : taxableIncome;
  return roundToDollar(bracketTax(lookupIncome, brackets));
}`,
                    why: "The whole rule in four lines: below $100k tax the band midpoint, at or above it tax the exact income. One ternary is the difference between matching the IRS's printed table and quietly disagreeing with it by a few dollars on every return.",
                  },
                ],
              },
              {
                n: 3,
                title: "Verified against the printed table",
                detail: "Single, $25,300-$25,350 → midpoint $25,325 → bracket tax $2,800.50 → table value $2,801.",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Band", value: "$25,300 – $25,350 (Single)", state: "derived" },
                      { label: "Midpoint", value: "$25,325", state: "derived" },
                      { label: "bracketTax(midpoint)", value: "$2,800.50", state: "derived" },
                      { label: "Rounded", value: "$2,801 — matches the IRS Sample Table exactly", state: "derived" },
                      { label: "At $100k and above", value: "The instructions switch to a worksheet, which is bracketTax at the exact income", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "eng-treaty",
        title: "The treaty table",
        sub: "142 rows · 15 verified · 127 provisional",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Treaty benefits come from a JSON table, not from code. Fifteen rows have been checked against the treaty text; the other 127 are marked provisional and are used anyway.",
        evidence: "lib/rules/treatyRules.json",
        anatomy: [
          {
            kind: "parts",
            total: "142 treaty rows",
            rows: [
              { label: "verified", weight: 15, display: "15 — checked against treaty text", tone: "hold", state: "derived" },
              { label: "provisional", weight: 127, display: "127 — used, not yet checked", tone: "vary", state: "partial" },
            ],
          },
          {
            kind: "map",
            caption: "what a row can say",
            rows: [
              { from: "scholarship", to: "64 rows carry a scholarship exemption", state: "derived" },
              { from: "dividends", to: "46 rows", state: "derived" },
              { from: "wages", to: "32 rows", state: "derived" },
              {
                from: "allows_standard_deduction",
                to: "exactly one country: India",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Why only India", value: "Art 21(2) is the only treaty granting a nonresident student the standard deduction", state: "derived" },
                      { label: "Downstream effect", value: "It is also one of the two triggers for Form 8833", state: "derived" },
                      { label: "Counted how", value: "Directly over the JSON — 199 coverage rows, one with the flag set", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "eng-findings",
        title: "What the engine flags",
        sub: "Findings, and one that rests on a gate elsewhere",
        state: "partial",
        col: 0,
        row: 3,
        detail:
          "Alongside the numbers the engine emits findings — plain-English notices. One of them asserts something the engine itself never checks.",
        evidence: "lib/rules/income.ts:200",
        anatomy: [
          {
            kind: "map",
            caption: "finding → what backs it",
            rows: [
              {
                from: "fica",
                to: "\"FICA was withheld that you didn't owe\" — true only because a gate upstream refused everyone else",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/income.ts",
                    start: 200,
                    code: `  // ⚠ The condition is \`box4 + box6 > 0\` ALONE — it never reads \`residency\`,
  // even though the headline states the filer is an F-1 in their exempt years.
  // That premise is checked upstream, not here: evaluateEligibility refuses a
  // non-F-1 visa class, a green card holder, and anyone past EXEMPT_YEAR_LIMIT
  // before this engine ever runs, so the population reaching this line is
  // FICA-exempt by construction.`,
                    why: "A safety property held by an upstream gate rather than by local code. The comment exists so nobody widens that gate without realising this finding starts asserting something it never verified — and it names the one place the gate is genuinely absent.",
                  },
                ],
              },
              { from: "treaty expired", to: "raised when a time limit has run out but wages were still claimed", state: "derived" },
              { from: "state crosscheck", to: "raised when state withholding looks inconsistent with the federal figures", state: "derived" },
            ],
          },
          {
            kind: "facts",
            rows: [
              { label: "trace.push sites", value: "8 — the trace is deliberately incomplete", state: "partial" },
              { label: "No event for", value: "the bracket tax itself, or refundOrDue — the two numbers a filer would most want explained", state: "partial" },
            ],
          },
        ],
      },
    ],
  },
  /* ═══ 7. THE PACKET ════════════════════════════════════════════
     Six levels: the step → which forms / the field map / the overflow → a
     semantic key → an AcroForm name → the source. */
  {
    id: "packet",
    title: "Printing something you can mail",
    sub: "Seven IRS templates, filled by field name and flattened",
    state: "partial",
    col: 0,
    row: 0,
    detail:
      "The engine's numbers become strings, the strings become AcroForm field values, and the pages are stacked in the order the IRS asks paper to be assembled. Printing it and discarding page 1 leaves a ready envelope.",
    evidence: "lib/server/generateReturnForms.ts, lib/pdf/",
    children: [
      {
        id: "pkt-which",
        title: "Which forms you get",
        sub: "One function decides — and the audit trail calls it too",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "returnFormIds is the single source of truth for what is in the packet. Nothing re-derives the list, so the printed stack and the audit trail cannot disagree.",
        evidence: "lib/server/generateReturnForms.ts:74",
        anatomy: [
          {
            kind: "map",
            caption: "form ← the condition that includes it",
            rows: [
              {
                from: "f8843 alone",
                to: "when requiresForm1040NR is false — an early return",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/server/generateReturnForms.ts",
                    start: 76,
                    code: `  // An F-1 student with no US income, no withholding to reclaim and no treaty
  // claim owes the IRS nothing and files nothing except Form 8843 — which is a
  // standalone filing in that case, so it carries its own address block.
  // Mailing a blank 1040-NR (and a Schedule OI with nothing to report) would be
  // wrong.
  if (!income.requiresForm1040NR) return ["f8843"];`,
                    why: "The most common case in this product's user base, handled first and separately. The same flag drives Form 8843's own address block and the attachment short-circuit, so all three agree by construction rather than by coincidence.",
                  },
                ],
              },
              { from: "sched1", to: "additional income or adjustments above zero", state: "derived" },
              { from: "schedA", to: "itemizing, and itemized deductions above zero", state: "derived" },
              {
                from: "schedNEC",
                to: "dividends, or capital gains REPORTABLE — not taxable",
                state: "derived",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      {
                        n: 1,
                        title: "The two flags are split on purpose",
                        detail: "reportable is the presence test alone; taxable additionally requires a net gain.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/rules/income.ts",
                            start: 460,
                            code: `  // A filer present 183+ days with a net LOSS is reportable but not taxable:
  // the lots still have to be shown, line 18 just enters -0-.
  const capitalGainsReportable = capitalGainsPresentDays >= config.capital_gains_presence_days;
  const capitalGainsTaxable = capitalGainsReportable && capitalGainsNet > 0;`,
                            why: "Two names one word apart, and the distinction decides whether a whole schedule prints. The comment states the case that makes them differ — a losing year — which is exactly the case a single flag would have got wrong.",
                          },
                        ],
                      },
                      { n: 2, title: "Which one the form selection uses", detail: "reportable. So a filer who lost money still files Schedule NEC; only the rate columns and line 9 fall away.", state: "derived" },
                      { n: 3, title: "The bug this avoids", detail: "Keying off taxable made a losing year's transactions vanish off the return entirely — the lots were never shown at all.", state: "derived" },
                    ],
                  },
                ],
              },
              { from: "f8833", to: "an unsubstantiated scholarship treaty claim, or India's Art 21(2)", state: "derived" },
              { from: "schedNEC-attachment", to: "more than 5 capital-gains lots", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "pkt-fields",
        title: "How a number reaches a box",
        sub: "Semantic key → AcroForm field → flattened widget",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "Filling is by field NAME, never by coordinate. Each form module emits semantic keys; each field map turns a key into the IRS's own opaque widget name.",
        evidence: "lib/pdf/fieldMaps/f1040nr.ts:42",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Engine value", detail: "income.wagesTaxable — a number.", state: "derived" },
              { n: 2, title: "Form module formats it", detail: "formatUsd turns it into the string \"12,345.00\". No dollar sign; the form prints its own.", state: "derived" },
              {
                n: 3,
                title: "Field map names the widget",
                detail: "The semantic key \"1040nr.1a\" resolves to topmostSubform[0].Page1[0].f1_42[0].",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/pdf/fieldMaps/f1040nr.ts",
                    start: 42,
                    code: `  "1040nr.1a": { type: "text", field: \`\${PAGE1}.f1_42[0]\` }, // total from Form(s) W-2, box 1`,
                    why: "The atom of the whole mapping layer: a key the engine side owns, an opaque name the IRS owns, and a comment binding the two to a printed line label. The names were resolved by filling every field with its own name and rasterizing the result.",
                  },
                ],
              },
              {
                n: 4,
                title: "Write it, working around maxLength",
                detail: "Some official fields cap below what's needed — but the cap also spaces characters into printed boxes, so it can't just be removed.",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/pdf/fillForm.ts",
                    start: 46,
                    code: `      const textField = form.getTextField(entry.field);
      const maxLength = textField.getMaxLength();
      if (maxLength !== undefined && text.length > maxLength) {
        textField.removeMaxLength();
      }
      textField.setText(text);`,
                    why: "Conditional, not unconditional. Form 8843 line 11 caps at one character but wants \"F-1\"; the TIN box uses the same property to comb digits into printed cells. Removing the cap only when the value actually overflows satisfies both.",
                  },
                ],
              },
              { n: 5, title: "Flatten", detail: "The widget appearance is baked into page content, so the result prints identically everywhere.", state: "derived" },
            ],
          },
          {
            kind: "facts",
            rows: [
              { label: "Unmapped key", value: "console.warn and continue — it prints nothing and fails nothing", state: "partial" },
              { label: "Why that's survivable", value: "lines and fieldMap are exposed so an external script can diff them", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "pkt-overflow",
        title: "The sixth capital-gains lot",
        sub: "Two constants, two files, one comment holding them together",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Schedule NEC's line 16 has five printed rows. Lot six onward goes to a continuation sheet drawn from scratch — and the number 5 is declared independently in two files, with two more hardcoded copies bypassing both.",
        evidence: "lib/server/generateReturnForms.ts:28, lib/rules/forms/scheduleNEC.ts:9",
        anatomy: [
          {
            kind: "map",
            caption: "where the number 5 lives",
            rows: [
              {
                from: "scheduleNEC.ts:9",
                to: "LINE_16_BUILTIN_ROWS — decides what prints ON the form",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/rules/forms/scheduleNEC.ts",
                    start: 70,
                    code: `    income.capitalGainsTransactions.slice(0, LINE_16_BUILTIN_ROWS).forEach((tx, i) => {
      lines[\`schedNEC.16.kind.\${i}\`] = tx.description;
      lines[\`schedNEC.16.dateAcquired.\${i}\`] = tx.dateAcquired ? formatIsoDateSlashes(tx.dateAcquired) : "Various";`,
                    why: "Keys built by interpolating the row index, which is why the field map has to enumerate rows 0-4 explicitly and why provenance matches them by regex rather than by name.",
                  },
                ],
              },
              {
                from: "generateReturnForms.ts:31",
                to: "a SECOND declaration — decides what goes on the attachment",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Kept in sync by", value: "A comment. Nothing asserts the two are equal", state: "partial" },
                      { label: "If they diverge", value: "A lot is either printed twice or dropped from the return entirely", state: "partial" },
                    ],
                  },
                ],
              },
              {
                from: "two more copies",
                to: "hardcoded slice(5) that bypass the constant altogether",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "app/api/documents/generate/schedNEC-attachment/route.ts:20", value: "slice(5) — a literal, not the constant", state: "partial" },
                      { label: "tests/golden/scheduleNEC-line16.test.ts:220,226", value: "slice(5) twice more — so the test would not catch the drift either", state: "partial" },
                      { label: "Totals are safe", value: "Lines 17/18 read the engine's own sums, so they always reflect ALL lots regardless of the slice", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "pkt-attach",
        title: "What goes in the envelope",
        sub: "Mailing order is the iteration order of one object",
        state: "partial",
        alarm: true,
        col: 0,
        row: 3,
        detail:
          "The IRS asks W-2s and 1042-S at the front unconditionally, and a 1099 only when tax was withheld. Those rules are an object whose key order IS the stacking order — and one document type has no entry at all.",
        evidence: "lib/server/filingAttachments.ts:39",
        anatomy: [
          {
            kind: "map",
            caption: "document → when it travels",
            rows: [
              { from: "w2", to: "any wages or withholding present", state: "derived" },
              { from: "f1042s", to: "any 1042-S withholding or reported income", state: "derived" },
              { from: "f1099int / div / b", to: "ONLY when federal tax was withheld on it", state: "derived" },
              {
                from: "f1099da",
                to: "no entry at all — read by the engine, never mailed, never reported missing",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "The shape", value: "MAIL_RULES is a Partial<Record>, so an absent key is legal TypeScript", state: "derived" },
                      { label: "Consequence", value: "A digital-asset statement with withholding appears in neither the attachment list nor the missing list", state: "partial" },
                      { label: "Meanwhile", value: "The engine sums its withholding onto the return, so the money is claimed without the paper", state: "partial" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            kind: "facts",
            rows: [
              { label: "Stack order", value: "Cover sheet, then the filer's own statements, then generated forms in IRS attachment-sequence order", state: "derived" },
              { label: "Why it reads as one line", value: "Three array spreads — the whole mail rule reduces to a single return statement", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "pkt-cache",
        title: "Not regenerating the same PDF",
        sub: "SHA-256 over ten columns plus an engine version",
        state: "derived",
        col: 0,
        row: 4,
        detail:
          "The packet is cached by a hash of everything that could change it. The engine version is hashed as a sibling key, so bumping it invalidates every filer at once.",
        evidence: "lib/server/packetCache.ts:84",
        anatomy: [
          {
            kind: "map",
            caption: "the key, and the three ideas in it",
            rows: [
              {
                from: "the hash",
                to: "version + ten JSONB columns, key-sorted, SHA-256",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "lib/server/packetCache.ts",
                    start: 84,
                    code: `export function computePacketInputHash(inputs: PacketInputs): string {
  const canonical = JSON.stringify(sortKeys({ version: FORM_ENGINE_VERSION, ...inputs }));
  return createHash("sha256").update(canonical).digest("hex");
}`,
                    why: "Three decisions in two lines: the engine version rides inside the hashed object so a logic change invalidates everyone; sortKeys makes an incidental JSONB reordering not a cache miss; SHA-256 over the canonical form is the key.",
                  },
                ],
              },
              {
                from: "documents_upload",
                to: "hashed too — because the packet REPRINTS the uploaded files",
                state: "derived",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Why it must be in the key", value: "Swapping a W-2 PDF changes the printed packet even when no extracted number moves", state: "derived" },
                      { label: "FORM_ENGINE_VERSION", value: "Currently 9, with a bump log for every version", state: "derived" },
                      { label: "v9 specifically", value: "Renumbered from 8 on merge so a cached v8 packet could not satisfy the treaty fix", state: "derived" },
                      { label: "A dangling row", value: "If the stored object is gone, the download fails and it regenerates rather than erroring", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 8. THE FREE REFUND CHECK ═════════════════════════════════
     Five levels: the funnel → what it assumes / how it scores / what it hides
     → the assumption → the source. NOT a wizard step — a separate front door. */
  {
    id: "refund-check",
    title: "Free Refund Check",
    sub: "No login, no consent screen — the public funnel at /check",
    state: "partial",
    alarm: true,
    col: 0,
    row: 0,
    detail:
      "A static page that takes documents from anyone, runs the same tax engine behind hardcoded assumptions, and blurs the answer until you sign up. It is the product's own name for this page.",
    evidence: "public/check.html, lib/check/, app/api/check/",
    children: [
      {
        id: "chk-assume",
        title: "What it assumes about you",
        sub: "Single, F-1, nonresident, 300 days present",
        state: "partial",
        alarm: true,
        col: 0,
        row: 0,
        detail:
          "The wizard asks these questions. The funnel cannot, so it asserts them — and one of those assertions is the premise of a finding the engine states as fact.",
        evidence: "lib/check/engine.ts:16",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Filing status", value: "Coerced to single — the UI never sends anything else", state: "partial" },
              { label: "Citizenship", value: "Forged as a CONFIRMED profile fact, though it came from a dropdown", state: "partial" },
              { label: "Days present", value: "300, a constant — standing in for an I-94 travel history", state: "partial" },
              { label: "Nonresident", value: "Asserted true, with exempt years set to 0 — which silently passes every treaty time limit", state: "partial" },
              { label: "Charity", value: "Hardcoded 0", state: "derived" },
            ],
          },
          {
            kind: "map",
            caption: "the assumption, and what it costs",
            rows: [
              {
                from: "ASSUMED_PRESENT_DAYS",
                to: "300 — chosen so capital gains stay TAXABLE",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "lib/check/engine.ts",
                    start: 31,
                    code: `const ASSUMED_PRESENT_DAYS = 300; // ≥183 → capital gains taxable`,
                    why: "One number standing in for a travel history, and deliberately the conservative choice: over 183 days makes gains taxable, which lowers the estimated refund rather than over-promising it.",
                  },
                ],
              },
              {
                from: "the FICA finding",
                to: "reworded here, because the gate that makes it true is absent",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "lib/check/engine.ts",
                    start: 44,
                    code: `// The FICA finding is the one place those assumptions become a claim about the
// filer rather than a rounding of their refund. \`income.ts\` states it flatly —
// "which an F-1 student in their exempt years shouldn't owe" — and that is
// correct in the wizard, where \`evaluateEligibility\` has already refused
// anyone who isn't F-1, holds a green card, or is past their fifth exempt year
// before the engine ever runs. The funnel has no such gate: it takes a W-2 from
// anyone, unauthenticated, and asserts \`isNonresident: true\` above. An H-1B
// holder or a sixth-year student owes that FICA, so stated flatly it would be
// wrong advice on a public page.`,
                    why: "The clearest statement of what the funnel trades away. The wizard's eligibility gate is load-bearing for a claim made in a different file — remove the gate and the sentence becomes wrong advice, so the public page rewrites it as a conditional.",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "chk-score",
        title: "Grading a return you already filed",
        sub: "11 compared lines, whole-dollar equality",
        state: "partial",
        col: 0,
        row: 1,
        detail:
          "Upload a filed 1040-NR and it is read once, then diffed against what the engine would have written. The mapping is the same one used to FILL those lines, so grading and filling cannot drift.",
        evidence: "lib/check/f1040nrScoring.ts:113",
        anatomy: [
          {
            kind: "map",
            caption: "how the comparison behaves",
            rows: [
              { from: "11 rows", to: "1a, 8, 9, 12, 15, 16, 23a, 24, 25d, 25g, 33 — lines 34/37 are the bottom line", state: "derived" },
              {
                from: "a blank line",
                to: "coerces to 0 — so blank against a computed $0 is a MATCH",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Comparison", value: "Whole-dollar equality — sub-dollar drift never flags", state: "derived" },
                      { label: "Effect", value: "Accuracy is measured generously", state: "partial" },
                      { label: "Ranking", value: "None. Rows render in declaration order; prioritisation happens only in the reveal budget", state: "derived" },
                    ],
                  },
                ],
              },
              {
                from: "read once, unverified",
                to: "the scoring path bypasses the three-leg comparison entirely",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "Step 1 gets the full pipeline", detail: "The income documents go through the same three-leg read the authenticated app uses, with disagreements logged.", state: "derived" },
                      { n: 2, title: "Step 2 gets one call", detail: "The filed 1040-NR — the document whose numbers drive every \"you got this wrong\" claim — is read once, with no cross-check and no ledger entry.", state: "partial" },
                      {
                        n: 3,
                        title: "The prompt is the only safeguard",
                        detail: "Its entire job is stopping the model from correcting the arithmetic it is reading.",
                        state: "derived",
                        under: [
                          {
                            kind: "source",
                            file: "lib/check/f1040nrScoring.ts",
                            start: 66,
                            code: `    systemPrompt:
      "You read the values a nonresident alien filer has already entered on a completed US Form 1040-NR " +
      "(U.S. Nonresident Alien Income Tax Return). Report the number actually printed on each requested line, " +
      "exactly as written — do NOT recompute, correct, or infer a value that isn't there. If a line is blank, " +
      "return null for it.",`,
                            why: "The instruction fights the model's most helpful instinct. If it \"fixed\" a wrong line on the way in, the diff would show a match and the product's entire pitch — we found what you got wrong — would quietly collapse into agreement.",
                          },
                        ],
                      },
                      { n: 4, title: "Its confidence is discarded", detail: "The score comes back with a confidence value that the page never renders.", state: "partial" },
                    ],
                  },
                ],
              },
              { from: "the prompt's job", to: "stop the model correcting arithmetic — report what is printed, even if wrong", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "chk-reveal",
        title: "What it shows and what it blurs",
        sub: "MAX_REVEAL = 2 · the rest is CSS blur",
        state: "partial",
        col: 0,
        row: 2,
        detail:
          "Matched lines are free. The first two mismatches show real numbers; the rest keep their sign colour and lose their magnitude. The blurred values are real text in the DOM.",
        evidence: "public/check.html:751",
        anatomy: [
          {
            kind: "map",
            caption: "the conversion mechanic",
            rows: [
              {
                from: "the budget",
                to: "only MISMATCHES consume it — so proof always precedes the wall",
                state: "derived",
                under: [
                  {
                    kind: "source",
                    file: "public/check.html",
                    start: 751,
                    code: `        // Tease, don't give away: reveal the first couple of mismatched lines in full
        // so they see the tool works, then blur the correct value + difference on the
        // rest. Color still signals whether each blurred line is in their favor or not.
        const MAX_REVEAL = 2;`,
                    why: "Stated plainly in the code. Because matched lines never consume the budget, the reader always gets evidence the tool works before hitting the paywall — and the colour keeps leaking the direction of every hidden number.",
                  },
                ],
              },
              {
                from: "the blur",
                to: "presentational only — the values sit in the DOM behind a CSS filter",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Marked", value: "aria-hidden=\"true\"", state: "derived" },
                      { label: "Readable by", value: "Devtools, or a screen reader", state: "partial" },
                      { label: "Given away free", value: "The accuracy percentage, and the sign of every blurred figure", state: "derived" },
                      { label: "Findings list", value: "Sliced to ONE, and that one is CSS-truncated — which is why the FICA rewrite front-loads its condition", state: "derived" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "chk-dedup",
        title: "The abuse control that isn't wired",
        sub: "Built, tested, imported by nothing",
        state: "partial",
        alarm: true,
        col: 0,
        row: 3,
        detail:
          "A fingerprint module, a migration, an index, an RLS posture and a session header all exist. Nothing sends the header, the migration is unapplied, and the route's own comment still describes the system as active.",
        evidence: "lib/check/fingerprint.ts, docs/STATUS.md:186",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Importers", value: "Its own test, and nothing else", state: "partial" },
              { label: "The client header", value: "Never sent — grep for localStorage/sessionStorage in check.html returns zero hits", state: "derived" },
              { label: "Applied here?", value: "The migration is reported unapplied in docs/STATUS.md", state: "partial" },
              { label: "Rate limiting", value: "Does not exist yet, per the same document", state: "partial" },
              { label: "Consequence", value: "An unauthenticated endpoint runs a paid model pipeline with no dedup and no cap", state: "partial" },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 9. THE STORE ═════════════════════════════════════════════ */
  {
    id: "store",
    title: "Where it all lands",
    sub: "Supabase Postgres · one wide row per filing · RLS by user",
    state: "partial",
    col: 0,
    row: 0,
    detail:
      "One row per filer per tax year, with the wizard's answers held as JSONB columns rather than normalised tables. Every step above writes into it, and the packet cache hashes ten of its columns.",
    evidence: "supabase/migrations/, lib/server/engineContext.ts",
    children: [
      {
        id: "st-filings",
        title: "The filings row",
        sub: "The case file — every step writes a column",
        state: "partial",
        col: 0,
        row: 0,
        evidence: "supabase/migrations/",
        anatomy: [
          {
            kind: "schema",
            table: "filings",
            rows: [
              { name: "user_id", type: "uuid", key: "PK", state: "derived", note: "composite with tax_year" },
              { name: "tax_year", type: "integer", key: "PK", state: "derived" },
              { name: "stage", type: "text", state: "partial", note: "The resume coordinate — two of its declared values are never written" },
              { name: "consent_7216_at", type: "timestamptz", nullable: true, state: "derived" },
              { name: "consent_7216_version", type: "text", nullable: true, state: "derived", note: "Stamped as a pair with the timestamp" },
              { name: "eligibility_page", type: "jsonb", state: "derived" },
              { name: "interview_page", type: "jsonb", state: "derived" },
              { name: "profile_page", type: "jsonb", state: "partial", note: "Holds ssnOrItin — written from an unvalidated cast" },
              { name: "w2s", type: "jsonb", state: "derived" },
              { name: "f1099das", type: "jsonb", state: "partial", note: "Read by the engine; no mail rule exists for it" },
              { name: "generated_packet_hash", type: "text", nullable: true, state: "derived", note: "Compared against the recomputed input hash" },
            ],
            rel: [
              "One row per filer per tax year — the wizard's answers are columns on it, not child tables.",
              "The packet cache hashes ten of these columns plus the engine version.",
            ],
          },
        ],
      },
      {
        id: "st-plaintext",
        title: "What is stored in the clear",
        sub: "The identifier the ledger redacts",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The disagreement ledger deliberately redacts identifiers before writing. The same identifier sits in plaintext in profile_page, written from a route that never validated it.",
        evidence: "app/api/profile/route.ts:26",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "In this column", value: "ssnOrItin, plaintext inside profile_page", state: "partial" },
              { label: "In the ledger", value: "Redacted — field paths only, never values", state: "derived" },
              { label: "The inconsistency", value: "One subsystem treats it as sensitive; the one that receives it from the browser does not validate it at all", state: "partial" },
              { label: "Protected by", value: "Row-level security scoped to the owning user", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "st-side",
        title: "Tables beside the case file",
        sub: "One reporting nothing, one with no caller",
        state: "partial",
        col: 0,
        row: 2,
        evidence: "docs/STATUS.md:186",
        anatomy: [
          {
            kind: "map",
            caption: "two side tables, opposite problems",
            rows: [
              {
                from: "extraction_disagreements",
                to: "APPLIED, RLS on — and holding 0 rows against 14 filings",
                state: "partial",
                under: [
                  {
                    kind: "flow",
                    rows: [
                      { n: 1, title: "The table exists", detail: "docs/STATUS.md corrected this on 2026-08-02: an earlier note claiming the table was absent was itself stale.", state: "derived" },
                      {
                        n: 2,
                        title: "Every failure path returns 0",
                        detail: "Three catch blocks and three early returns, and 0 is also what 'nothing disagreed' returns.",
                        state: "partial",
                        under: [
                          {
                            kind: "source",
                            file: "lib/extraction/disagreementLog.ts",
                            start: 85,
                            code: `  } catch (err) {
    console.warn(
      \`[disagreement-log] could not create the admin client (\${err instanceof Error ? err.message : String(err)}) — continuing without it.\`
    );
    return 0;
  }
  if (!admin) return 0; // No service key in this env — degrade to no logging.`,
                            why: "Degrading to no logging is the right call for a ledger — a filer must never fail to upload a W-2 because an audit table was unreachable. The cost is that a broken writer and a genuinely quiet extractor return the same number.",
                          },
                        ],
                      },
                      { n: 3, title: "What the silence costs", detail: "Legs B and C exist only to produce disagreements. If the write is broken they bill roughly $19 per 1,000 documents for nothing — per docs/STATUS.md.", state: "partial" },
                    ],
                  },
                ],
              },
              {
                from: "check_fingerprints",
                to: "NOT applied — the opposite problem, and often confused with the one above",
                state: "partial",
                under: [
                  {
                    kind: "facts",
                    rows: [
                      { label: "Migration", value: "20260716120000_add_check_fingerprints.sql — \"Not yet applied\"", state: "partial" },
                      { label: "The module", value: "Implemented and tested: HMAC-SHA256 of the SSN, peppered — it stores no PII", state: "derived" },
                      { label: "Who calls it", value: "Its own test, and nothing else", state: "derived" },
                      { label: "Why it matters", value: "Rate limiting is named as the real backstop for these unauthenticated paid endpoints, and does not exist yet", state: "partial" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "st-bucket",
        title: "Object storage",
        sub: "Filing documents, and the staging copies",
        state: "partial",
        col: 0,
        row: 3,
        evidence: "lib/parsing/bdaParse.ts:255",
        anatomy: [
          {
            kind: "map",
            caption: "prefix → what lives there",
            rows: [
              { from: "filing-documents", to: "the filer's uploads and the generated packet", state: "derived" },
              {
                from: "S3 staging/input · staging/output",
                to: "BDA's working copies — deletion is attempted and warns on failure",
                state: "partial",
                under: [
                  {
                    kind: "source",
                    file: "lib/parsing/bdaParse.ts",
                    start: 255,
                    code: `    void s3("DELETE", inputKey)
      .then((del) => {
        if (!del.ok) {
          console.warn(
            \`[bda] could not delete staged PDF s3://\${bucket}/\${inputKey} (\${del.status}). \` +
              \`Filer PII is left in S3 until the bucket lifecycle rule expires it — see docs/AWS_CONFIG.md §3b.\`
          );
        }
      })`,
                    why: "The warning names exactly what is left behind and defers to a lifecycle rule that lives outside this repository. Whether that rule exists cannot be answered by reading the code — which is why the claim is marked partial rather than derived.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  /* ═══ 10. UNREACHABLE STAGES ═══════════════════════════════════ */
  {
    id: "unreachable",
    title: "Unreachable stages",
    sub: "Two values the type declares that nothing ever writes",
    state: "partial",
    ghost: true,
    alarm: true,
    col: 0,
    row: 0,
    detail:
      "The Stage union declares \"documents\" and \"review\". No route writes either. Gating a feature on one of them already made a reviewer sample pack silently never render.",
    evidence: "lib/types.ts:368",
    anatomy: [
      {
        kind: "map",
        caption: "the Stage union — 9 members, 6 writers",
        rows: [
          { from: "confirm", to: "app/api/eligibility/draft/route.ts:43", state: "derived" },
          { from: "interview · blocked", to: "app/api/eligibility/route.ts:87 — one ternary writes both", state: "derived" },
          { from: "profile", to: "checklist/route.ts:65, and profile/route.ts:45 deliberately holding the payout gate", state: "derived" },
          { from: "payout", to: "app/api/documents/payout/route.ts:27", state: "derived" },
          { from: "file", to: "app/api/documents/file/route.ts:21", state: "derived" },
          {
            from: "documents · review",
            to: "nobody — declared, never written",
            state: "partial",
            under: [
              {
                kind: "flow",
                rows: [
                  {
                    n: 1,
                    title: "Both are declared with a comment",
                    detail: "\"Stage 2 — upload + extraction\" and \"Stage 3+4+5 — findings, computation, summary\". They read as a plan, not as dead code.",
                    state: "derived",
                    under: [
                      {
                        kind: "source",
                        file: "lib/types.ts",
                        start: 368,
                        code: `export type Stage =
  | "eligibility" // Stage 0 — residency check
  | "profile" // Stage 1a — filer identity
  | "confirm" // Stage 0b — document-derived eligibility confirmation
  | "interview" // Stage 1b — situation questions
  | "documents" // Stage 2 — upload + extraction
  | "review" // Stage 3+4+5 — findings, computation, summary
  | "payout" // Stage 5b — refund/amount-owed result + how to receive or pay it
  | "file" // Stage 6 — PDF download + instructions
  | "blocked"; // routed out (not F-1, resident, etc.)`,
                        why: "Every member carries a stage number, so the union reads as a complete map of the product. Two of those numbers were never built — and the comments are what make that invisible, because they describe intent as confidently as they describe what exists.",
                      },
                    ],
                  },
                  { n: 2, title: "What it cost once", detail: "A reviewer sample pack gated on one of these silently never rendered. No error, no empty state — the condition was simply never true.", state: "partial" },
                  { n: 3, title: "Why it survives", detail: "A union member with no writer is valid TypeScript. Only grepping writers against the union finds it, which is what surfaced it here.", state: "derived" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

/* The filer's path, in order. Seven steps, one chain.

   `refund-check` is NOT on it and gets no edge: it is a second front door that
   bypasses the wizard entirely. Giving it an edge from any step would draw a
   sequence that does not exist — and putting it at the end of the serpentine,
   which an earlier pass did, made it read as the step AFTER the packet. It now
   sits on its own tier below the spine, where nothing can be mistaken for
   following anything.

   The store and the unreachable stages are not steps either. Every root writes
   to the store, so it sits underneath rather than at the end. */
export const E0: Edge[] = [
  { from: "consent", to: "eligibility", state: "partial", label: "should gate" },
  { from: "eligibility", to: "income-docs", state: "derived", label: "passes into" },
  { from: "income-docs", to: "extraction", state: "derived", label: "uploads to" },
  { from: "extraction", to: "identity", state: "derived", label: "must land before" },
  { from: "identity", to: "engine", state: "derived", label: "releases" },
  { from: "engine", to: "packet", state: "derived", label: "fills" },
];

/* ── rows that go deeper ──────────────────────────────────────
   A row carrying `under` becomes a REAL child node, spliced in beside whatever
   children its owner already had. See the note in lib/data.ts: the synthesized
   id is rowId(owner, key), the same id the row's anchor registers under, so the
   row and the card it opens share an identity and connect without a special
   case in the wire layer. */

/** The rows of one anatomy block that carry `under`, as {key, label, blocks}. */
function deepRows(blocks: Anatomy[]) {
  const out: { key: string; label: string; under: Anatomy[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "map") {
      for (const r of b.rows) {
        if (r.under) out.push({ key: r.from, label: r.from, under: r.under });
      }
    } else if (b.kind === "flow") {
      for (const r of b.rows) {
        if (r.under) out.push({ key: String(r.n), label: r.title, under: r.under });
      }
    }
  }
  return out;
}

/**
 * Walk the tree and give every `under`-carrying row a child node.
 *
 * Runs once at module load over the authored tree, so `nodeAt`, `levelAt`,
 * `allNodes` and the canvas all see one uniform structure and none of them
 * needs to know a row was involved.
 */
function withRowChildren(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const authored = n.children ? withRowChildren(n.children) : [];
    // ⚠ The synthesized children are fed back through this function, NOT just
    // constructed and returned.
    //
    // A row's `under` is itself an Anatomy[], so it can hold rows that carry
    // their own `under` — which is the only way a branch reaches past three
    // levels. Building these nodes without recursing set `anatomy` correctly
    // and then never looked at it again, so the second `under` stayed data and
    // never became a node: every root measured exactly 3 levels deep however
    // deeply it was authored. The content was present in the file and
    // unreachable in the UI, which is the failure that looks most like "the
    // fixture is shallow" while being nothing of the kind.
    const fromRows = n.anatomy
      ? withRowChildren(
          deepRows(n.anatomy).map((r, i): Node => ({
            id: rowId(n.id, r.key),
            title: r.label,
            sub: "what happens to it",
            state: "derived",
            col: 0,
            row: authored.length + i,
            anatomy: r.under,
            evidence: n.evidence,
            fromRow: true,
          })),
        )
      : [];
    const children = [...authored, ...fromRows];
    return children.length ? { ...n, children } : { ...n, children: undefined };
  });
}

/**
 * The tree everything else reads: authored nodes, plus one node for every row
 * that carries `under`. Built once, so no consumer knows a row was involved.
 */
export const L0: Node[] = withRowChildren(AUTHORED);

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
    kind: "test not implemented",
    at: "lib/rules/eligibility.ts:208",
    text: "The IRS's 3-year weighted substantial-presence formula is absent from the repository. The five-year exempt-individual rule stands in for it, which covers the population the gate admits and refuses everyone else.",
    node: "eligibility",
  },
  {
    kind: "stale comment",
    at: "lib/ai/runMarkdownExtraction.ts:21",
    text: "Two files state that filer document text lands on OpenAI when AI_PROVIDER is unset. bedrockConfig.ts:22 resolves unset to Bedrock. The comments describe a compliance posture the code no longer has.",
    node: "extraction",
  },
  {
    kind: "indistinguishable from success",
    at: "lib/extraction/disagreementLog.ts:85",
    text: "Five nested swallows around the ledger write mean a broken writer and a genuinely quiet extractor produce identical observable behaviour. docs/STATUS.md reports 0 rows against 14 filings.",
    node: "extraction",
  },
  {
    kind: "undeclared coupling",
    at: "lib/server/generateReturnForms.ts:28",
    text: "LINE_16_BUILTIN_ROWS is declared independently in two files, one deciding what prints on Schedule NEC and the other what goes on the continuation statement. Two further hardcoded 5s bypass both. A comment is the only link.",
    node: "packet",
  },
  {
    kind: "silent omission",
    at: "lib/server/filingAttachments.ts:39",
    text: "MAIL_RULES is a Partial<Record> with no f1099da entry, so a digital-asset statement with withholding appears in neither the attachment list nor the missing list — while the engine sums its withholding onto the return.",
    node: "packet",
  },
  {
    kind: "no server validation",
    at: "app/api/profile/route.ts:26",
    text: "The request body is cast, not parsed. ssnOrItin reaches profile_page with no regex, schema or length check — in a route file whose direct-deposit sibling validates properly.",
    node: "identity",
  },
  {
    kind: "unreachable configuration",
    at: "lib/check/fingerprint.ts:58",
    text: "The abuse-dedup system — a migration, an index, an RLS posture, an HMAC module and a session header — is fully built and imported by nothing but its own test. No client sends the header.",
    node: "refund-check",
  },
  {
    kind: "not verifiable from this repo",
    at: "lib/parsing/bdaParse.ts:255",
    text: "Staged PDF deletion fails and is logged as a warning naming the PII left behind. Whether a bucket lifecycle rule bounds the accumulation cannot be determined from anything in this repository.",
    node: "store",
  },
  {
    kind: "dead union members",
    at: "lib/types.ts:368",
    text: "Stage declares \"documents\" and \"review\"; nothing writes either. Gating on one of them already made a reviewer sample pack silently never render.",
    node: "unreachable",
  },
];

/* ── row-level links ──────────────────────────────────────────
   The edges worth tracing: a value written in one step and read in another, a
   finding and the premise it rests on two roots away. Endpoints are ROWS.

   Row keys must match what components/anatomy.tsx registers: `schema` anchors
   on the column name, `map` on the row's `from`, `flow` on the step number,
   `facts`/`bars`/`chips`/`parts` on the label, and `source` on the literal
   string "source". */

export const LINKS: Link[] = [
  // Consent stamps the column that proves it happened.
  { from: rowId("consent-once", 3), to: rowId("st-filings", "consent_7216_at"), state: "derived", label: "stamps" },
  { from: rowId("consent-once", 4), to: rowId("st-filings", "consent_7216_version"), state: "derived", label: "stamps" },

  // The five-year rule is read in three places that must agree.
  { from: rowId("elig-rule", 1), to: rowId("elig-8843", "line 12"), state: "derived", label: "same count" },
  { from: rowId("elig-rule", 2), to: rowId("st-filings", "stage"), state: "derived", label: "writes 'blocked'" },

  // Income documents into the columns the engine later reads.
  { from: rowId("inc-order", 3), to: rowId("st-filings", "w2s"), state: "derived", label: "writes" },
  { from: rowId("inc-cancel", 2), to: rowId("st-filings", "w2s"), state: "partial", alarm: true, label: "clears — silently if it fails" },
  { from: rowId("inc-lost", "serialize()"), to: rowId("st-filings", "w2s"), state: "derived", label: "one writer at a time" },

  // Extraction: what the legs produce, and where the disagreement goes.
  { from: rowId("read-bda", 4), to: rowId("read-legs", "A · bda-primary"), state: "derived", label: "feeds" },
  { from: rowId("read-legs", "C · pdf-direct"), to: rowId("read-ladder", 2), state: "derived", label: "checked by" },
  { from: rowId("read-ledger", "Reads"), to: rowId("st-side", "extraction_disagreements"), state: "derived", label: "stored in" },
  { from: rowId("read-ledger", "Identifiers"), to: rowId("st-plaintext", "In this column"), state: "partial", alarm: true, label: "redacted here, plaintext there" },
  { from: rowId("read-bda", 1), to: rowId("st-bucket", "S3 staging/input · staging/output"), state: "derived", label: "stages into" },

  // The consent promise, and the default that keeps it true.
  { from: rowId("read-egress", "bedrockConfig.ts:22"), to: rowId("consent-wording", "who receives it"), state: "derived", label: "keeps true" },
  { from: rowId("read-egress", "runMarkdownExtraction.ts:21"), to: rowId("consent-wording", "who receives it"), state: "partial", alarm: true, label: "contradicts, stale" },

  // The gate reads the case file back rather than trusting its own queue.
  { from: rowId("id-gate", 2), to: rowId("inc-queue", "inFlight (a number)"), state: "derived", label: "asks" },
  { from: rowId("id-gate", 3), to: rowId("st-filings", "w2s"), state: "derived", label: "re-reads" },
  { from: rowId("id-gate", 5), to: rowId("st-filings", "stage"), state: "derived", label: "writes 'profile'" },
  { from: rowId("id-validation", "as ProfileRequestBody"), to: rowId("st-filings", "profile_page"), state: "partial", alarm: true, label: "unvalidated" },
  { from: rowId("id-draft", "What's in it"), to: rowId("st-plaintext", "In this column"), state: "partial", label: "same identifier" },

  // The engine reads the case file and writes the number.
  { from: rowId("eng-path", 1), to: rowId("st-filings", "w2s"), state: "derived", label: "reads" },
  { from: rowId("eng-path", 2), to: rowId("eng-treaty", "wages"), state: "derived", label: "looks up" },
  { from: rowId("eng-path", 4), to: rowId("eng-table", 1), state: "derived", label: "taxed via" },
  { from: rowId("eng-findings", "fica"), to: rowId("elig-rule", 2), state: "derived", label: "premise" },
  { from: rowId("eng-findings", "fica"), to: rowId("chk-assume", "the FICA finding"), state: "partial", alarm: true, label: "premise absent" },

  // The packet, and the document it never mentions.
  { from: rowId("pkt-which", "schedNEC"), to: rowId("pkt-overflow", "scheduleNEC.ts:9"), state: "derived", label: "printed by" },
  { from: rowId("pkt-fields", 3), to: rowId("eng-path", 3), state: "derived", label: "prints" },
  { from: rowId("pkt-attach", "f1099da"), to: rowId("st-filings", "f1099das"), state: "partial", alarm: true, label: "read, never mailed" },
  { from: rowId("pkt-cache", "the hash"), to: rowId("st-filings", "generated_packet_hash"), state: "derived", label: "compared against" },
  { from: rowId("pkt-cache", "documents_upload"), to: rowId("eng-treaty", "allows_standard_deduction"), state: "derived", label: "invalidated by a bump" },

  // The funnel reuses the engine without the gate that makes it safe.
  { from: rowId("chk-assume", "ASSUMED_PRESENT_DAYS"), to: rowId("eng-path", 4), state: "partial", label: "feeds the same engine" },
  { from: rowId("chk-score", "read once, unverified"), to: rowId("read-legs", "why three at all"), state: "partial", alarm: true, label: "skips the cross-read" },
  { from: rowId("chk-dedup", "Importers"), to: rowId("st-side", "check_fingerprints"), state: "partial", label: "table without a caller" },

  // Stages nothing writes.
  { from: rowId("unreachable", "documents · review"), to: rowId("st-filings", "stage"), state: "partial", alarm: true, label: "never written" },
];

export function linksFor(id: string) {
  return LINKS.filter((l) => l.from === id || l.to === id);
}
