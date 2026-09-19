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
 * grouping here is `derived` rather than `inferred`, which is the one thing the
 * previous fixture had to admit uncertainty about on every card.
 *
 * A few roots are not wizard steps: consent gates the flow, the engine runs
 * between two steps, the store sits under everything, and /check is a second
 * front door that bypasses the wizard entirely.
 *
 * DEPTH IS NOT UNIFORM. A branch goes as deep as it has genuinely different
 * things to say. "Reading the documents" runs four levels because a route
 * sequence, a three-model race, a resolution ladder and a source file are four
 * different kinds of thing. "Consent" stops at two because a modal, a
 * write-once route and a version constant is all there is. A third level added
 * everywhere would just be the same repetition one click further down.
 *
 * SOURCED FROM DOCS, NOT CODE: five claims below come from docs/STATUS.md
 * rather than from source — the S3 delete failure, the ledger's zero rows, the
 * Free-plan posture, the consent gate's reach, and the per-1,000-document cost.
 * Each is marked `partial` and names the doc. They are the operator's report of
 * what production does, which no amount of reading the repo can confirm.
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
  {
    id: "consent",
    title: "Agreeing to be read",
    sub: "IRS §7216, before any document moves",
    state: "partial",
    col: 0,
    row: 0,
    detail:
      "A blocking modal on the dashboard. The filer must tick a box before a single document is handed to a processor — consent to disclose return information is a legal precondition, not a preference.",
    evidence: "components/consent-modal.tsx, app/api/consent/route.ts",
    children: [
      {
        id: "consent-once",
        title: "Asked once, ever",
        sub: "A database stamp, plus a local latch",
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "The database is the record. The localStorage latch exists only because the server's answer can reach the browser stale.",
        evidence: "components/consent-modal.tsx:28",
        anatomy: [
          {
            kind: "flow",
            rows: [
              {
                n: 1,
                title: "Dashboard asks in its own query",
                detail:
                  "consent_7216_at is selected separately from the main filing read, because the column ships in a migration that may not be applied and naming an unknown column would blank the whole dashboard.",
                state: "derived",
              },
              {
                n: 2,
                title: "A dialog with no way out",
                detail: "Rendered with open={!dismissed} and no Close button. The filer agrees or the dashboard stays behind it.",
                state: "derived",
              },
              {
                n: 3,
                title: "POST /api/consent stamps the row",
                detail: "Write-once: an existing consent on any of the user's filings short-circuits with a 200 and writes nothing, so a stray re-post cannot restate when they actually agreed.",
                state: "derived",
              },
              {
                n: 4,
                title: "Only then, the local latch",
                detail: "localStorage is written after the server write succeeds, keyed by user id so a second account on the same browser is still asked.",
                state: "derived",
              },
              {
                n: 5,
                title: "It only guards the dashboard",
                detail: "docs/STATUS.md: the modal renders on /dashboard only, so a filer who deep-links into /onboarding/* is not gated — and the upload routes do the disclosing.",
                state: "partial",
              },
            ],
          },
          {
            kind: "source",
            file: "components/consent-modal.tsx",
            start: 28,
            code: "// ASKED ONCE, EVER. The database is the source of truth (any filings row with\n// `consent_7216_at` set, any tax year — see the dashboard's read), but the\n// server's answer reaches this component through an RSC payload that can be\n// *stale*: `router.refresh()` clears the client cache for the current route,\n// and Next explicitly does NOT invalidate browser back/forward entries, so a\n// filer who agrees, walks into the wizard and presses Back gets the pre-consent\n// render again — with this component's `dismissed` state lost on remount. Hence\n// the localStorage latch: a purely local suppressor layered over the real\n// record, keyed by user id so a second account signing in on the same browser\n// is still asked. It only ever gets written after the write succeeded.",
            why: "The latch is not a cache of the answer — it is a workaround for a framework behaviour. Because it is layered OVER the real record rather than replacing it, clearing site data re-asks a filer who has already consented, which is the safe direction to fail. The version constant (CONSENT_7216_VERSION = \"1.2\") is stored beside the timestamp so a later revision of the wording is distinguishable from the one already on file.",
          },
        ],
      },
    ],
  },

  {
    id: "eligibility",
    title: "Proving you may file",
    sub: "Upload I-20 and I-94, answer while they parse",
    state: "derived",
    col: 0,
    row: 1,
    detail:
      "Stage 0. Immigration documents are read to establish nonresident status. The parse starts on drop, not on Continue, so the filer answers green-card questions while the models work.",
    evidence: "app/(protected)/onboarding/eligibility/page.tsx, lib/rules/eligibility.ts",
    edges: [{ from: "elig-order", to: "elig-writes", state: "derived", label: "then" }],
    children: [
      {
        id: "elig-order",
        title: "Why this order",
        sub: "The step list is a latency budget",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "Every step that uploads a document is followed by a step of questions that do not depend on it. Moving a step re-prices the whole flow.",
        evidence: "lib/config/onboarding.ts:3",
        anatomy: [
          {
            kind: "map",
            caption: "step → what it hides",
            rows: [
              { from: "eligibility", to: "I-20 + I-94 read, behind the green-card questions", state: "derived" },
              { from: "confirm", to: "the eligibility decision — where a filer can still be rejected", state: "derived" },
              { from: "interview", to: "the slowest parse in the app — a consolidated broker 1099", state: "derived" },
              { from: "profile", to: "the longest form, hiding that income parse", state: "derived" },
              { from: "payout", to: "nothing — the engine has already run", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "lib/config/onboarding.ts",
            start: 3,
            code: "// ORDER IS A LATENCY DECISION, NOT A NARRATIVE ONE. Every step that uploads a\n// document is followed by a step made of questions that don't depend on it, so\n// the parse runs while the filer types instead of behind a spinner. Moving a\n// step here re-prices the whole flow — see the runway note on each entry.",
            why: "The confirm step sits before the income step for a second reason the file states plainly: rejecting a filer after paying for three model reads of a W-2 and a broker statement is the one ordering that costs real money. So the cheap gate runs first. The display grouping is deliberately not 1:1 with this list — five steps are shown as four WIZARD_PHASES, because /eligibility and /confirm are one question asked across two screens with a document read between the halves.",
          },
        ],
      },
      {
        id: "elig-writes",
        title: "Four writes, strictly in order",
        sub: "Two of them touch the same column",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "Continue moves to the questions immediately and the real work runs behind it. The writes are sequential on purpose.",
        evidence: "app/(protected)/onboarding/eligibility/page.tsx:410",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Three uploads", detail: "I-20, I-94 and travel history, one after another rather than together.", state: "derived" },
              { n: 2, title: "saveEligibilityDraft", detail: "The confirmed input, into eligibility_page.", state: "derived" },
              { n: 3, title: "/api/documents/i94-identity", detail: "Read-modify-write on profile_page.", state: "derived" },
              { n: 4, title: "/api/documents/i20", detail: "Read-modify-write on the SAME column, which is why it cannot overlap step 3.", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "app/(protected)/onboarding/eligibility/page.tsx",
            start: 410,
            code: "      // Both identity and school writes read-modify-write the same profile_page\n      // JSONB column, so firing them together let the second's stale read\n      // clobber the first — a lost-update race that wiped the I-94 identity\n      // fields, leaving the profile page blank.",
            why: "A JSONB column updated by read-modify-write has no row-level merge: the whole blob is replaced. Two concurrent writers therefore lose one of the two edits, and the failure is silent — the profile page simply renders empty, with nothing logged and no error. Serialising is the cheap fix; the structural fix would be a Postgres jsonb merge, which nothing here does.",
          },
        ],
      },
      {
        id: "elig-rule",
        title: "The five-year test",
        sub: "Calendar years in status, not elapsed time",
        state: "derived",
        col: 0,
        row: 2,
        detail:
          "The decision itself. Two documents each answer half the question, and the years neither can see are asked about rather than assumed.",
        evidence: "lib/rules/eligibility.ts:377",
        anatomy: [
          {
            kind: "map",
            caption: "what knows what",
            rows: [
              { from: "travel history", to: "when the filer was in the US", state: "derived" },
              { from: "the I-20", to: "which years were F-1", state: "derived" },
              { from: "the gap between", to: "`unknown` — handed to the UI as a question", state: "derived" },
              { from: "before travel history reaches", to: "asked outright; CBP prints only ~10 years", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "lib/rules/eligibility.ts",
            start: 377,
            code: "  // The five-year test counts CALENDAR YEARS spent in an exempt status, not\n  // elapsed time since an entry. The old `taxYear - firstEntryYear + 1` was a\n  // duration and was wrong in both directions: it under-counted a transfer\n  // student (whose newest I-20 starts years after their first F-1 year) and\n  // over-counted anyone who went home for a year (a gap year isn't spent in the\n  // US, so it burns nothing).",
            why: "Wrong in both directions is the phrase that matters: the old formula did not fail conservatively, it failed differently per filer. A transfer student was told they still qualified when they did not, and someone who took a year out was refused when they qualified. The rewrite counts a per-year grid instead, and fails closed — zero counted years blocks rather than passing everyone.",
          },
        ],
      },
    ],
  },

  {
    id: "income-docs",
    title: "Declaring what you earned",
    sub: "Questions first, uploads revealed by the answers",
    state: "derived",
    col: 1,
    row: 0,
    detail:
      "Stage 1b. Each 'yes' reveals an upload slot, and Continue deliberately does not wait for the reads — a document mid-flight counts as present so the filer is never held behind a spinner.",
    evidence: "app/(protected)/onboarding/interview/page.tsx, lib/client/incomeExtractionQueue.ts",
    children: [
      {
        id: "inc-order",
        title: "Slowest question first",
        sub: "1099 → 1042-S → W-2 → the two needing nothing",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The questions are ordered by how long the document they reveal takes to read, so the longest parse gets the most runway.",
        evidence: "app/(protected)/onboarding/interview/page.tsx:326",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Sold assets", value: "A consolidated broker 1099 — many pages, the slowest read", state: "derived" },
              { label: "Scholarship", value: "1042-S", state: "derived" },
              { label: "Worked in the US", value: "W-2", state: "derived" },
              { label: "Interest · dividends", value: "No document — asked last, nothing to wait for", state: "derived" },
              { label: "Continue", value: "Live while reads are in flight — a pending document counts as present", state: "derived" },
            ],
          },
        ],
      },
      {
        id: "inc-cancel",
        title: "Un-saying an answer",
        sub: "Cancel before clear, or the read wins",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "De-selecting an income answer must cancel any in-flight read first. The obvious ordering was wrong in a way nothing on screen would show.",
        evidence: "app/(protected)/onboarding/interview/page.tsx:180",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Filer says no", detail: "cancelIncomeExtractions() runs BEFORE the stored array is cleared.", state: "derived" },
              { n: 2, title: "The clear is posted", detail: "persistIncome writes the emptied array back to the filing.", state: "derived" },
              { n: 3, title: "If that POST fails", detail: "The catch swallows it, naming a reconciler that does not exist.", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "app/(protected)/onboarding/interview/page.tsx",
            start: 171,
            code: "    } catch {\n      /* ignore — Documents step reconciles */\n    }",
            why: "The named backstop is gone: there is no Documents step, uploads moved inline. What actually runs later is the profile step's missingIncomeDocs check, which tests for MISSING documents, not stale ones — so it cannot catch this. The gate these clears defend against is an in-flight read committing wages after the filer said they had none, which the engine then sums onto 1040-NR line 1a with nothing on screen showing it.",
          },
        ],
      },
    ],
  },

  {
    id: "reading",
    title: "Reading the documents",
    sub: "Three models race; one is the authority",
    state: "partial",
    col: 1,
    row: 1,
    detail:
      "The most interesting machinery in the repo. Every document is read by more than one model, the readings are compared field by field, and disagreements are logged — but the primary still wins.",
    evidence: "lib/ai/extractFromMarkdown.ts, lib/ai/bedrockConfig.ts",
    edges: [
      { from: "read-legs", to: "read-ladder", state: "derived", label: "falls back to" },
      { from: "read-ladder", to: "read-ledger", state: "derived", label: "records" },
    ],
    children: [
      {
        id: "read-legs",
        title: "Three legs, one winner",
        sub: "Ship on the canonical leg, finish the rest after",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The response goes out as soon as the canonical leg returns and is not contradicted by the document's own totals. The other legs finish in the background.",
        evidence: "lib/ai/extractFromMarkdown.ts:261",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Leg A · canonical", value: "The prompts were written and iterated against this input", state: "derived" },
              { label: "Leg B", value: "Second independent read of the same markdown", state: "derived" },
              { label: "Leg C · pdf-direct", value: "Same prompts, rendered PDF — a detector, not yet an authority", state: "partial" },
              { label: "Ships when", value: "Canonical returned · not blocking · not contradicted", state: "derived" },
              { label: "Cost of the choice", value: "A parser loss can ship with a row in the ledger", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "lib/ai/extractFromMarkdown.ts",
            start: 261,
            code: "  if (canonical.status === \"fulfilled\" && !blockingCrossCheck && !canonicalContradicted) {",
            why: "Three conditions, and the third is the one doing real work: `canonicalContradicted` means the reading does not foot to the document's own printed totals. Without it this would be a plain race where the fastest answer wins. With it, an arithmetic self-check can hold the response back and wait for the other legs. It is the boundary between a ~3s upload and a ~27s one.",
          },
          {
            kind: "source",
            file: "lib/ai/bedrockConfig.ts",
            start: 124,
            code: "   * The cost of that choice, stated plainly: when BDA drops content, legs A and\n   * B agree on the damaged reading, leg C dissents, and we ship A anyway with a\n   * row in the ledger. The ledger makes the loss visible after the fact; it does\n   * not prevent it. Closing that gap is §9.3's resolution ladder plus the\n   * confirm UI, neither of which is built.",
            why: "Read this next to the ladder below: the comment is now partly stale, because the arithmetic rung IS built. But it only returns a verdict for f1099b and f1099da — for a W-2, an I-94 or a 1042-S the claim still holds exactly as written. This is the failure mode that once put a residency date eleven months out.",
          },
        ],
        children: [
          {
            id: "read-ladder",
            title: "The resolution ladder",
            sub: "Arithmetic, then the PDF's own text layer",
            state: "partial",
            col: 0,
            row: 0,
            detail:
              "When the legs disagree, two independent checks can settle it without a model — but only for the two document kinds whose numbers foot.",
            evidence: "lib/extraction/resolve.ts:70",
            anatomy: [
              {
                kind: "flow",
                rows: [
                  { n: 1, title: "Does it foot?", detail: "Broker lots are summed and compared against the statement's printed grand total.", state: "derived" },
                  { n: 2, title: "Is it actually on the page?", detail: "A pdftotext subprocess checks the PDF's own text layer for the value.", state: "derived" },
                  { n: 3, title: "Only two kinds qualify", detail: "Every other kind returns null — a W-2 or 1042-S has nothing to foot against.", state: "partial" },
                ],
              },
              {
                kind: "source",
                file: "lib/extraction/resolve.ts",
                start: 279,
                code: "    if (digits.length < 2) return false;",
                why: "One line, and it exists because of a measured failure. The source-verification tier was overstated by 29 entries when its text check had degraded to includes(\"0\") for the value 0.00 — every agreed zero certified itself against any document containing a zero anywhere. Since this check decides what gets recorded as TRUE, repeating that mistake would be worse than having no check at all.",
              },
            ],
          },
          {
            id: "read-ledger",
            title: "The disagreement ledger",
            sub: "Insert-only, PII-redacted — and empty",
            state: "partial",
            alarm: true,
            col: 0,
            row: 1,
            detail:
              "Where the models disagreed is written to Postgres after the response, best-effort. It is an audit log: nothing in the filing flow reads it.",
            evidence: "lib/extraction/disagreementLog.ts:23",
            anatomy: [
              {
                kind: "facts",
                rows: [
                  { label: "Rows today", value: "0, against 14 filings — docs/STATUS.md. Either nothing disagreed, or the write never lands", state: "partial" },
                  { label: "Swallows", value: "Five nested — client, key, insert error, insert throw, then the caller", state: "partial" },
                  { label: "Identifiers", value: "Redacted before insert; the row still records THAT they disagreed", state: "derived" },
                  { label: "Reads", value: "Service role only — RLS is insert-only, no select policy", state: "derived" },
                  { label: "Retention", value: "400 days stated, no automatic purge written", state: "partial" },
                ],
              },
              {
                kind: "source",
                file: "lib/extraction/disagreementLog.ts",
                start: 23,
                code: "const SENSITIVE = /(ssn|itin|\\btin\\b|taxpayerId|passport)/i;",
                why: "The diagnostic ledger redacts tax identifiers before they reach Postgres, so a disagreement about a TIN is recorded without the digits. That is the right posture — and it is the opposite of what the case file itself does, where profile_page stores the same identifiers in plaintext. The stricter rule is applied to the copy that matters less.",
              },
              {
                kind: "source",
                file: "lib/ai/bedrockConfig.ts",
                start: 118,
                code: "   * lib/ai/extractionSpecs.ts were written and iterated against BDA markdown —\n   * Round B took haiku-on-markdown to 100.0% over ten prompt versions. Leg C\n   * runs those same prompts against a rendered PDF, which docs/history/extraction-bench.md\n   * §8.8 explicitly names as the axis that will eventually need a prompt of its\n   * own. Leg C is a well-calibrated *detector* and not yet a better *authority*.",
                why: "This is the honest reason the third leg cannot win a disagreement: its prompts were tuned against a different input format, so when it dissents you cannot tell whether the document is damaged or the prompt is mismatched. Promoting it without its own prompt would trade one silent error for another. Five nested swallows around the ledger mean 'the writer is broken' and 'nothing ever disagreed' produce byte-identical behaviour — and docs/STATUS.md prices legs B and C at roughly $19 per 1,000 documents if that write is in fact broken.",
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "identity",
    title: "Who is filing",
    sub: "The longest form — and the payout gate",
    state: "partial",
    alarm: true,
    col: 2,
    row: 0,
    detail:
      "Stage 1a, deliberately last before payout because it is the runway that hides the income parse. It also owns the gate: no refund is computed until every read has landed.",
    evidence: "app/(protected)/onboarding/profile/page.tsx:282, app/api/profile/route.ts:26",
    edges: [{ from: "id-gate", to: "id-validation", state: "partial" }],
    children: [
      {
        id: "id-gate",
        title: "Waiting for the reads",
        sub: "Ask the server, not the queue",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The step will not hand off to payout until the documents have actually arrived — and it verifies that against the server rather than its own in-memory queue.",
        evidence: "app/(protected)/onboarding/profile/page.tsx:282",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "Is anything still running?", detail: "Checked synchronously, before any await — asking afterwards would flash the processing screen on every single filing.", state: "derived" },
              { n: 2, title: "Settle the queue", detail: "await settleIncomeExtractions().", state: "derived" },
              { n: 3, title: "Re-read the case file", detail: "fetchFiling() — the server is the authority, not the queue.", state: "derived" },
              { n: 4, title: "Then the gate", detail: "missingIncomeDocs, then POST /api/documents/payout.", state: "derived" },
              { n: 5, title: "The route writes 'profile', not 'payout'", detail: "So a reload cannot skip the gate to a refund computed from a half-parsed case file.", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "app/(protected)/onboarding/profile/page.tsx",
            start: 285,
            code: "      // Re-read the case file rather than trusting the queue. A hard reload\n      // between the two steps empties the queue AND kills the in-flight fetches\n      // (the save to /api/documents/income is client-side), so an empty queue\n      // does not by itself mean the data arrived. The server is the authority.",
            why: "An empty queue is ambiguous in exactly the way that matters: it means either 'everything finished' or 'the page reloaded and took the in-flight requests with it'. Since the save is client-side, the second case loses data silently. Re-reading the server collapses the ambiguity — and the route deliberately writing stage 'profile' rather than 'payout' means a reload lands back on this gate instead of past it.",
          },
        ],
      },
      {
        id: "id-validation",
        title: "The SSN nobody checks",
        sub: "Validated in the browser, cast on the server",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "The identity field printed on every generated form is the one field with no server-side validation — in a codebase that validates bank details properly.",
        evidence: "app/api/profile/route.ts:26",
        anatomy: [
          {
            kind: "map",
            caption: "field → who checks it",
            rows: [
              { from: "ssnOrItin · client", to: "SSN_RE / ITIN_RE, enforced by validateProfile", state: "derived" },
              { from: "ssnOrItin · server", to: "nothing — a bare cast, then written to JSONB", state: "partial" },
              { from: "bankRouting · server", to: "9 digits, checked in the route", state: "derived" },
              { from: "bankAccount · server", to: "digits only, checked in the route", state: "derived" },
              { from: "accountType · server", to: "enum, checked in the route", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "app/api/profile/route.ts",
            start: 26,
            code: "  const body = (await request.json()) as ProfileRequestBody;",
            why: "A cast is not a check — it tells TypeScript what to believe and asks the runtime nothing. There is no Zod schema, no regex and no length test between this line and the write into profile_page, so any client can POST an arbitrary string into ssnOrItin and it will be printed onto a 1040-NR. The sibling direct-deposit route, twenty lines away, does validate its input properly, which is what makes this an inconsistency rather than a house style.",
          },
        ],
      },
    ],
  },

  {
    id: "engine",
    title: "Working out the number",
    sub: "Pure TypeScript — no model, no network",
    state: "derived",
    col: 2,
    row: 1,
    detail:
      "Stage 5. The confirmed case file becomes every figure on the return, deterministically. Runs once per filer; every generate route and the payout screen read this one result.",
    evidence: "lib/rules/income.ts, lib/server/engineContext.ts:67",
    edges: [{ from: "eng-treaty", to: "eng-findings", state: "derived", label: "feeds" }],
    children: [
      {
        id: "eng-treaty",
        title: "The treaty table is generated",
        sub: "IRS PDFs → TSV → verified JSON",
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "Country treaty rules are authored through a pipeline, not typed by hand, and an unreviewed row cannot pay out.",
        evidence: "lib/rules/treaties.ts:48",
        anatomy: [
          {
            kind: "flow",
            rows: [
              { n: 1, title: "IRS publication PDFs", detail: "The source of record, outside this repo.", state: "inferred" },
              { n: 2, title: "pdftotext → TSV → author.mjs", detail: "Mechanically extracted, then authored into JSON.", state: "derived" },
              { n: 3, title: "Zod-validated at load", detail: "A malformed row fails loudly rather than silently exempting income.", state: "derived" },
              { n: 4, title: "Unverified rows dropped", detail: "filter(rule => rule.confidence === 'verified') — an unreviewed treaty cannot reduce anyone's tax.", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "lib/rules/treaties.ts",
            start: 54,
            code: "      exempt_amount: rule.source_restriction === \"foreign_source_only\" ? 0 : rule.exempt_amount,",
            why: "India XXI(1), Canada XX and Mexico 21 exempt only money remitted from abroad, which reaches none of the US-source scholarship the engine actually sees. The old table encoded that as a literal exempt_amount of 0 — the right number with its reason destroyed, indistinguishable from 'this country has no treaty'. The JSON now records the restriction and this line projects it back to zero, so the number and the reason survive together. The projection also protects the engine's `?? Infinity` default from exempting everything.",
          },
        ],
      },
      {
        id: "eng-findings",
        title: "What it tells the filer",
        sub: "9 finding kinds, each a claim about them",
        state: "derived",
        col: 0,
        row: 1,
        detail:
          "The engine emits findings, not just figures. Each carries a premise — and the FICA one is only true because an earlier step already refused anyone it would be false for.",
        evidence: "lib/rules/income.ts:205",
        anatomy: [
          {
            kind: "chips",
            caption: "FindingKind",
            rows: [
              { label: "fica", note: "W-2 boxes 4+6 nonzero for an exempt NRA", state: "derived" },
              { label: "scholarship", note: "taxable scholarship on 1042-S code 16", state: "derived" },
              { label: "treaty", note: "treaty benefit applied", state: "derived" },
              { label: "exempt_interest", note: "bank interest exempt under §871(i)", state: "derived" },
              { label: "capital_gains_183", note: "183-day rule applied", state: "derived" },
              { label: "capital_gains_reconciliation", note: "lots don't foot to the printed total", state: "derived" },
              { label: "dividend_nec", note: "routed to Schedule NEC", state: "derived" },
              { label: "state_crosscheck", note: "W-2 box 15 shows a taxable state", state: "derived" },
              { label: "completeness", note: "income summary confirmation", state: "derived" },
            ],
          },
          {
            kind: "source",
            file: "lib/rules/income.ts",
            start: 205,
            code: "  // FICA-exempt by construction. Widen that gate past F-1 and this finding\n  // starts asserting something it hasn't verified — a filer who legitimately\n  // owes FICA would be told to claim it back. lib/check/engine.ts is the case\n  // where the gate is genuinely absent, and it rewrites the headline to be\n  // conditional for exactly this reason.",
            why: "The finding's correctness lives in a different file from the finding. Nothing in this function reads residency — it is safe only because evaluateEligibility already refused anyone who is not an F-1 in their exempt years. The comment names the exact place that premise fails: the unauthenticated funnel, which takes a W-2 from anyone and therefore has to reword the same finding.",
          },
        ],
      },
    ],
  },

  {
    id: "packet",
    title: "The thing you mail",
    sub: "Filled IRS templates, in the IRS's order",
    state: "derived",
    col: 3,
    row: 0,
    detail:
      "Nothing is e-filed. The end artifact is one print-and-mail PDF: an instruction cover sheet, the filled forms, and the filer's own income documents attached where the IRS wants them.",
    evidence: "lib/server/generateReturnForms.ts:74, lib/server/packetCache.ts:45",
    children: [
      {
        id: "pkt-cache",
        title: "When a cached packet is still valid",
        sub: "One integer guards every stale PDF",
        state: "derived",
        col: 0,
        row: 0,
        detail:
          "The packet route hashes the exact JSONB the engine reads. A hash match serves the cached object — so a logic change has to invalidate it by hand.",
        evidence: "lib/server/packetCache.ts:45",
        anatomy: [
          {
            kind: "source",
            file: "lib/server/packetCache.ts",
            start: 42,
            code: "// (Renumbered from 8 to 9 on merge: main had already shipped v8 for Schedule A,\n// so leaving this at 8 would have let a cached v8 packet satisfy the treaty fix\n// and silently deny those filers the corrected exemption.)\nexport const FORM_ENGINE_VERSION = 9;",
            why: "The input hash covers the filer's data, which is exactly what does NOT change when you fix a bug in the engine. This constant is the manual escape hatch: bump it and every cached packet is invalidated even though its JSONB never moved. The parenthetical records a real near-miss — two branches both picked 8, and shipping that collision would have served Chinese and Korean filers a cached packet computed before the treaty fix, with no error anywhere.",
          },
        ],
      },
      {
        id: "pkt-attach",
        title: "What gets stapled to it",
        sub: "A Partial<Record> with one kind missing",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "Attachment order is the IRS's, not the app's. One document type is absent from the rules table, and the type signature makes that legal.",
        evidence: "lib/server/filingAttachments.ts:39",
        anatomy: [
          {
            kind: "map",
            caption: "doc → mailed with the return",
            rows: [
              { from: "w2", to: "front of Form 1040-NR", state: "derived" },
              { from: "f1042s", to: "front of Form 1040-NR", state: "derived" },
              { from: "f1099int · f1099div · f1099b", to: "attached", state: "derived" },
              { from: "f1099da", to: "absent from MAIL_RULES — never iterated", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "lib/server/filingAttachments.ts",
            start: 39,
            code: "const MAIL_RULES: Partial<Record<DocType, MailRule>> = {",
            why: "`Partial` is what makes the omission compile. MAILED_DOC_TYPES is derived from Object.keys(MAIL_RULES), so a docType that is not a key is never considered by the attachment loop — it lands in neither the attachments list nor the 'you still need to attach' list. Meanwhile the engine treats 1099-DA as a first-class capital-gains source and sums its withholding, so a filer with digital-asset tax withheld is told nothing about a document they must mail.",
          },
        ],
      },
      {
        id: "pkt-overflow",
        title: "Two constants, one comment",
        sub: "LINE_16_BUILTIN_ROWS, declared twice",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Schedule NEC prints five capital-gains lots on the form and the rest on a continuation statement. Which is which is decided by two independent constants.",
        evidence: "lib/server/generateReturnForms.ts:28",
        anatomy: [
          {
            kind: "source",
            file: "lib/server/generateReturnForms.ts",
            start: 28,
            code: "// The overflow threshold — Schedule NEC's line 16 table only prints the first\n// 5 lots directly on the form; the rest go on the continuation statement. Kept\n// in sync with LINE_16_BUILTIN_ROWS in lib/rules/forms/scheduleNEC.ts.\nconst LINE_16_BUILTIN_ROWS = 5;",
            why: "\"Kept in sync\" is a comment, not a mechanism. lib/rules/forms/scheduleNEC.ts declares the same constant independently; one slices the lots that print on the form, the other slices the ones that go on the attachment. Nothing imports one from the other and no test pins them together, so changing a single side either prints lots twice or drops them from both — on a filed capital-gains return.",
          },
        ],
      },
    ],
  },

  {
    id: "check",
    title: "The other front door",
    sub: "No login, same engine, fewer guarantees",
    state: "partial",
    alarm: true,
    col: 3,
    row: 1,
    detail:
      "A pre-signup funnel that runs the real engine on hardcoded assumptions. It is the most exposed surface in the repo: no auth, paid model calls, and the abuse control that was built for it is disconnected.",
    evidence: "app/api/check/extract/route.ts:106, lib/check/engine.ts:59",
    children: [
      {
        id: "chk-assume",
        title: "What it assumes about you",
        sub: "F-1, single, 300 days present",
        state: "partial",
        col: 0,
        row: 0,
        detail:
          "With no session there is no case file, so the engine is fed constants. One finding then has to carry its own premise in its headline.",
        evidence: "lib/check/engine.ts:59",
        anatomy: [
          {
            kind: "source",
            file: "lib/check/engine.ts",
            start: 44,
            code: "// The FICA finding is the one place those assumptions become a claim about the\n// filer rather than a rounding of their refund. `income.ts` states it flatly —\n// \"which an F-1 student in their exempt years shouldn't owe\" — and that is\n// correct in the wizard, where `evaluateEligibility` has already refused\n// anyone who isn't F-1, holds a green card, or is past their fifth exempt year\n// before the engine ever runs. The funnel has no such gate: it takes a W-2 from\n// anyone, unauthenticated, and asserts `isNonresident: true` above.",
            why: "The same finding is true in one product and false in the other, and the difference is a gate in a file the funnel never calls. Rather than drop it — it is often the largest number the funnel can show — the headline is rewritten to lead with the condition. The reason the condition leads rather than trails is rendering: check.html shows only the headline, truncated, so a reader who loses the tail has still read the 'if'.",
          },
        ],
      },
      {
        id: "chk-dedup",
        title: "Abuse control, fully built, wired to nothing",
        sub: "A table, an index, an HMAC — and no caller",
        state: "partial",
        alarm: true,
        col: 0,
        row: 1,
        detail:
          "One free check per person was designed carefully enough to store no PII at all. Then it was disconnected, and the route's own header still describes it as active.",
        evidence: "app/api/check/extract/route.ts:106",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "Design", value: "HMAC-SHA256 of the SSN under a server pepper — never the SSN itself", state: "derived" },
              { label: "Why HMAC", value: "The SSN keyspace is ~10^9, so a plain hash is brute-forceable", state: "derived" },
              { label: "Importers", value: "The module itself, and one test. Nothing else.", state: "partial" },
              { label: "The route header", value: "Still says \"we fingerprint it… and refuse a second run\"", state: "partial" },
              { label: "Consequence", value: "Paid parsing and model calls, unauthenticated, uncapped", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "app/api/check/extract/route.ts",
            start: 106,
            code: "    // NOTE: abuse dedup (one free check per SSN) is implemented but currently\n    // disconnected while the funnel is in testing — see docs/STATUS.md and\n    // lib/check/fingerprint.ts. Re-wire it here (before the GPT calls below)\n    // when re-enabling.",
            why: "Honest and dated, which is the best version of this. But the cost is live: a whole migration, an index, an RLS posture and a session header are config backing dead code, while the route's own documentation ten lines above still describes the behaviour as present. The next person to read the header and not this comment will believe the funnel is protected.",
          },
        ],
      },
      {
        id: "chk-egress",
        title: "Where the most sensitive document goes",
        sub: "A processor the consent text does not name",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "The funnel's scoring path extracts a filed 1040-NR — TIN included — through a code path whose default provider is not one of the two companies the consent modal names.",
        evidence: "lib/check/f1040nrScoring.ts:19, lib/ai/runMarkdownExtraction.ts:18",
        anatomy: [
          {
            kind: "map",
            caption: "what the filer is told, and what runs",
            rows: [
              { from: "consent modal", to: "AWS and Supabase are \"the only two companies we disclose to\"", state: "derived" },
              { from: "the scoring path", to: "runMarkdownExtraction → OpenAI, since AI_PROVIDER is unset", state: "partial" },
              { from: "the route", to: "headed \"Public, NO-AUTH\"", state: "derived" },
              { from: "gated by consent?", to: "no — consent renders on /dashboard only", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "lib/check/f1040nrScoring.ts",
            start: 19,
            code: "  tin: z.string(), // filer's SSN/ITIN — used only to fingerprint for dedup, never stored raw",
            why: "The comment's justification is void in two directions. Dedup is disconnected, so the TIN is extracted and used for nothing at all; and 'never stored raw' describes this app's database, not the processor the document was sent to on the way. GOTCHAS.md documents the provider honestly — the consent modal, which is the text with legal weight, does not.",
          },
        ],
      },
    ],
  },

  {
    id: "store",
    title: "Where it all lands",
    sub: "Postgres — 4 tables · RLS per filer · one private bucket",
    state: "partial",
    col: 4,
    row: 0,
    detail:
      "One row per filer per tax year, with the whole case file in JSONB columns. Isolation is real row-level security, not application code — but the most sensitive fields are in plaintext.",
    evidence: "supabase/migrations/20260710130000_init.sql:11",
    children: [
      {
        id: "st-filings",
        title: "The case file",
        sub: "filings — one row per user per tax year",
        state: "partial",
        alarm: true,
        col: 0,
        row: 0,
        detail:
          "Every stage writes into its own JSONB column on the same row. lib/types.ts, not the SQL, is the authoritative shape of each blob.",
        evidence: "supabase/migrations/20260710130000_init.sql:11",
        anatomy: [
          {
            kind: "schema",
            table: "public.filings",
            rows: [
              { name: "id", type: "uuid", key: "PK", state: "derived" },
              { name: "user_id", type: "uuid", key: "FK", state: "derived", note: "→ auth.users(id) on delete cascade" },
              { name: "tax_year", type: "int", key: "UQ", state: "derived", note: "unique (user_id, tax_year) — the real identity" },
              { name: "stage", type: "text", state: "partial", note: "9 Stage values declared; 2 are never written" },
              { name: "eligibility_page", type: "jsonb", nullable: true, state: "derived", note: "Confirmed input + computed residency" },
              { name: "profile_page", type: "jsonb", state: "partial", note: "SSN/ITIN, DOB, passport, bank details — plaintext" },
              { name: "interview_page", type: "jsonb", state: "derived", note: "Also holds charitable contributions — no column of their own" },
              { name: "w2s", type: "jsonb", state: "partial", note: "Created by init AND re-added by a later migration" },
              { name: "f1099das", type: "jsonb", state: "derived", note: "Digital assets — read by the engine, never mailed" },
              { name: "generated_packet_hash", type: "text", nullable: true, state: "derived", note: "Match means the cached PDF is still valid" },
              { name: "consent_7216_at", type: "timestamptz", nullable: true, state: "derived", note: "Null means consent not yet captured" },
            ],
            rel: [
              "RLS enabled with one policy, auth.uid() = user_id, both using and with check — isolation is the database's job here, not the application's.",
              "init.sql opens with `drop table if exists public.filings cascade` and its own header warns that applying it wipes existing rows.",
            ],
          },
        ],
        children: [
          {
            id: "st-plaintext",
            title: "The identifiers are not encrypted",
            sub: "profile_page jsonb not null default '{}'",
            state: "partial",
            alarm: true,
            col: 0,
            row: 0,
            detail:
              "There is no encryption call anywhere in the write path. The protection is RLS and nothing else.",
            evidence: "app/api/profile/route.ts:46, supabase/migrations/20260710130000_init.sql:23",
            anatomy: [
              {
                kind: "facts",
                rows: [
                  { label: "In this column", value: "SSN/ITIN, date of birth, passport number, two addresses", state: "partial" },
                  { label: "Also merged in", value: "bankRouting and bankAccount, by the direct-deposit route", state: "partial" },
                  { label: "At rest", value: "Plain jsonb — no encryption in the write path", state: "partial" },
                  { label: "Protected by", value: "Row-level security only", state: "derived" },
                  { label: "Hosting", value: "Free plan, per docs/STATUS.md — ~1 day log retention, no PITR", state: "partial" },
                ],
              },
              {
                kind: "source",
                file: "lib/supabase/admin.ts",
                start: 14,
                code: "export function createAdminClient(): SupabaseClient | null {\n  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\n  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;\n  if (!url || !serviceKey) return null;",
                why: "Returning null rather than throwing is what lets the three service-role tables degrade instead of 500ing when the key is absent — a dev or preview environment simply loses dedup and the ledger. It is also why a misconfigured production silently stops recording disagreements: the same null that means 'this is a preview' means 'the audit log is off', and nothing distinguishes them.",
              },
            ],
          },
        ],
      },
      {
        id: "st-side",
        title: "The three operational tables",
        sub: "Service role only · none readable by a filer",
        state: "partial",
        col: 0,
        row: 1,
        detail:
          "All three are written by the app and readable only through the service-role client. Two carry a migration note saying they were never applied here.",
        evidence: "supabase/migrations/20260716120000_add_check_fingerprints.sql:26",
        anatomy: [
          {
            kind: "facts",
            rows: [
              { label: "check_fingerprints", value: "RLS on with NO policies — service role only, by design", state: "derived" },
              { label: "account_visits", value: "Insert-only policy, no select. Admin metrics.", state: "derived" },
              { label: "extraction_disagreements", value: "Insert-only, PII-redacted, 400-day stated retention", state: "partial" },
              { label: "Applied here?", value: "Two carry \"not yet applied in this env\" notes in-file", state: "partial" },
              { label: "How migrations run", value: "By hand, via the dashboard SQL editor — no CLI in this env", state: "partial" },
            ],
          },
        ],
      },
      {
        id: "st-bucket",
        title: "The document bucket",
        sub: "Private, per-user folders — and nothing is deleted",
        state: "partial",
        alarm: true,
        col: 0,
        row: 2,
        detail:
          "Raw uploads are scoped to the filer's own top-level folder by a storage policy. The staging copies made during parsing are a different story.",
        evidence: "supabase/migrations/20260710130000_init.sql:67, lib/parsing/bdaParse.ts:258",
        anatomy: [
          {
            kind: "map",
            caption: "path → what lives there",
            rows: [
              { from: "{user_id}/{tax_year}/{docType}/{file}", to: "the filer's raw uploads", state: "derived" },
              { from: "{userId}/{taxYear}/generated/packet.pdf", to: "the cached mail packet", state: "derived" },
              { from: "policy", to: "(storage.foldername(name))[1] must equal auth.uid()", state: "derived" },
              { from: "S3 staging/input · staging/output", to: "never deleted — s3:DeleteObject returns 403", state: "partial" },
            ],
          },
          {
            kind: "source",
            file: "lib/parsing/bdaParse.ts",
            start: 258,
            code: "    console.warn(`[bda] could not delete staged PDF s3://${bucket}/${key}`, err);",
            why: "A warn and continue: the parse returns fine, so the request path cannot tell that anything failed. docs/STATUS.md reports the cause — s3:DeleteObject returns 403 — and the consequence, that a copy of every uploaded filer document accumulates in S3, confirmed live with three PDFs left behind. The one-day expiry that would otherwise bound it cannot be verified from inside this repo.",
          },
        ],
      },
    ],
  },

  {
    id: "dead",
    title: "Stages nothing writes",
    sub: "2 of 9 Stage values are unreachable",
    state: "inferred",
    ghost: true,
    col: 4,
    row: 1,
    detail:
      "lib/types.ts declares nine Stage values. Tracing every `stage:` write shows seven. \"documents\" and \"review\" are never assigned by anything — and gating on one of them has already caused a bug that shipped.",
    evidence: "lib/types.ts:368, lib/config/onboarding.ts:1",
    // No children: a hole has nothing underneath it. The finding is the absence.
  },
];

/** Edges between the roots — the filer's path, and the two things that gate it.
 *
 *  Not every root is on the path. `store` is written by all of them, which is
 *  one fact about what it is rather than eight edges; it is stated on the node's
 *  own line instead. `check` deliberately has no edge in: it is a second front
 *  door that bypasses this entire sequence, which is the point of it. */
export const E0: Edge[] = [
  { from: "consent", to: "eligibility", state: "partial", label: "should gate" },
  { from: "eligibility", to: "income-docs", state: "derived", label: "passes into" },
  { from: "income-docs", to: "reading", state: "derived", label: "uploads to" },
  { from: "reading", to: "identity", state: "derived", label: "must land before" },
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
    const fromRows = n.anatomy
      ? deepRows(n.anatomy).map((r, i): Node => ({
          id: rowId(n.id, r.key),
          title: r.label,
          sub: "what happens to it",
          state: "derived",
          col: 0,
          row: authored.length + i,
          anatomy: r.under,
          evidence: n.evidence,
          fromRow: true,
        }))
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
    kind: "unreachable configuration",
    at: "app/api/check/extract/route.ts:106",
    text: "The abuse-dedup system — a migration, an index, an RLS posture, an HMAC module and a session header — is fully built and imported by nothing but its own test. The route's header still describes it as active.",
    node: "check",
  },
  {
    kind: "undeclared coupling",
    at: "lib/server/generateReturnForms.ts:28",
    text: "LINE_16_BUILTIN_ROWS is declared independently in two files, one deciding what prints on Schedule NEC and the other what goes on the continuation statement. A comment is the only link.",
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
    kind: "indistinguishable from success",
    at: "lib/extraction/disagreementLog.ts:85",
    text: "Five nested swallows around the ledger write mean a broken writer and a genuinely quiet extractor produce identical observable behaviour. docs/STATUS.md reports 0 rows against 14 filings.",
    node: "reading",
  },
  {
    kind: "not verifiable from this repo",
    at: "lib/parsing/bdaParse.ts:258",
    text: "Staged PDF deletion fails with a 403 and is logged as a warning. Whether a bucket lifecycle rule bounds the accumulation cannot be determined from anything in this repository.",
    node: "store",
  },
  {
    kind: "dead union members",
    at: "lib/types.ts:368",
    text: "Stage declares \"documents\" and \"review\"; nothing writes either. Gating on one of them already made the reviewer sample pack silently never render.",
    node: "dead",
  },
];

/* ── row-level links ──────────────────────────────────────────
   The edges worth tracing: a value written in one step and read in another, a
   finding and the column that proves it. Endpoints are ROWS, not cards.

   Row keys must match what components/anatomy.tsx registers: `schema` anchors
   on the column name, `map` on the row's `from`, `flow` on the step number,
   `facts`/`bars`/`chips`/`parts` on the label, and `source` on the literal
   string "source". */

export const LINKS: Link[] = [
  // Consent is a column on the same row as everything else it gates.
  { from: rowId("consent-once", 3), to: rowId("st-filings", "consent_7216_at"), state: "derived", label: "stamps" },

  // The lost-update race, drawn as two writes landing on one column.
  { from: rowId("elig-writes", 3), to: rowId("st-filings", "profile_page"), state: "derived", label: "writes" },
  { from: rowId("elig-writes", 4), to: rowId("st-filings", "profile_page"), state: "partial", alarm: true, label: "same column" },
  { from: rowId("elig-writes", 2), to: rowId("st-filings", "eligibility_page"), state: "derived", label: "writes" },

  // Income documents into the columns the engine later reads.
  { from: rowId("inc-order", "Worked in the US"), to: rowId("st-filings", "w2s"), state: "derived", label: "writes" },
  { from: rowId("inc-order", "Sold assets"), to: rowId("st-filings", "f1099das"), state: "derived", label: "writes" },
  { from: rowId("inc-cancel", 2), to: rowId("st-filings", "w2s"), state: "partial", alarm: true, label: "clears — silently if it fails" },

  // The gate reads the case file back rather than trusting its own queue.
  { from: rowId("id-gate", 3), to: rowId("st-filings", "w2s"), state: "derived", label: "re-reads" },
  { from: rowId("id-gate", 5), to: rowId("st-filings", "stage"), state: "derived", label: "writes 'profile'" },
  { from: rowId("id-validation", "ssnOrItin · server"), to: rowId("st-filings", "profile_page"), state: "partial", alarm: true, label: "unvalidated" },
  { from: rowId("id-validation", "ssnOrItin · server"), to: rowId("st-plaintext", "In this column"), state: "partial", alarm: true, label: "stored plaintext" },

  // Extraction: what the legs produce, and where the disagreement goes.
  { from: rowId("read-legs", "Ships when"), to: rowId("read-ladder", 1), state: "derived", label: "checked by" },
  { from: rowId("read-ladder", 3), to: rowId("read-ledger", "Rows today"), state: "partial", label: "limits what can disagree" },
  { from: rowId("read-ledger", "Identifiers"), to: rowId("st-plaintext", "In this column"), state: "partial", alarm: true, label: "redacted here, plaintext there" },
  { from: rowId("read-ledger", "Reads"), to: rowId("st-side", "extraction_disagreements"), state: "derived", label: "stored in" },

  // The engine's premise lives in a step two roots earlier.
  { from: rowId("eng-findings", "fica"), to: rowId("elig-rule", "source"), state: "derived", label: "premise" },
  { from: rowId("eng-findings", "fica"), to: rowId("chk-assume", "source"), state: "partial", alarm: true, label: "premise absent" },
  { from: rowId("eng-treaty", 4), to: rowId("pkt-cache", "source"), state: "derived", label: "invalidated by" },

  // The packet, and the document it never mentions.
  { from: rowId("pkt-attach", "f1099da"), to: rowId("st-filings", "f1099das"), state: "partial", alarm: true, label: "read, never mailed" },
  { from: rowId("pkt-cache", "source"), to: rowId("st-filings", "generated_packet_hash"), state: "derived", label: "compared against" },

  // The funnel's egress, and the control that would have bounded it.
  { from: rowId("chk-egress", "the scoring path"), to: rowId("chk-dedup", "Consequence"), state: "partial", alarm: true, label: "uncapped" },
  { from: rowId("chk-dedup", "Importers"), to: rowId("st-side", "check_fingerprints"), state: "partial", label: "table without a caller" },
  { from: rowId("chk-egress", "gated by consent?"), to: rowId("consent-once", 5), state: "partial", alarm: true, label: "not gated" },

  // Uploads land in the bucket; the staging copies never leave.
  { from: rowId("st-bucket", "S3 staging/input · staging/output"), to: rowId("st-side", "Applied here?"), state: "inferred", label: "both unverifiable here" },
];

export function linksFor(id: string) {
  return LINKS.filter((l) => l.from === id || l.to === id);
}
