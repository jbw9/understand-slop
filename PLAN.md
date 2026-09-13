# understand-slop

A local tool that answers specific questions about code you didn't write, and is
honest about what it could not determine.

Not a map. Not a wiki. Not a quiz. Those were all tested and all failed — see
`DECISIONS.md` for the evidence behind each rejection.

## Stack

- TypeScript/JavaScript analysis only (forced by measurement — see Scope)
- Node 20+, TypeScript, run as a CLI
- `typescript` compiler API for resolution; tree-sitter only if a non-TS target is added later
- Output: terminal first, static HTML second. No hosted service, no account, no telemetry.
- LLM optional and off by default. Never required for a correct answer.

## The one-line thesis

Developers ask a known, catalogued set of questions about unfamiliar code.
`QUESTION-CATALOG.md` ranks them by frequency × difficulty × tractability.
Answer the top-ranked *tractable* ones with verifiable evidence, and say
"not determinable" for the rest.

## Scope — and why it is this narrow

Measured on six real repos (~106k LOC), name-matched edges from syntactic parsing
are **19.8–45.6% precise**. Most edges are wrong. Parsing imports directly is
**98–100% precise**. Python tops out at 43.8% even fully filtered.

Therefore: **TypeScript/JavaScript only**, using the TS compiler API for real
resolution. This is not a strategic preference, it is the only configuration where
the output can be trusted. AI-generated code that people don't understand skews
heavily to this stack anyway.

Non-goals, explicitly: multi-language support, a hosted demo, a whole-repo
architecture diagram, an agent/MCP interface, anything requiring an API key to
produce a correct answer.

## The three states — the core invariant

Every fact the tool emits carries one of three states. This is the single most
important design rule and it is non-negotiable, because the killer failure mode is
that **missing analysis looks identical to confident empty space**.

| State | Meaning | Rendering |
|---|---|---|
| `derived` | Resolved by the compiler. Import edge, direct call, declaration site. | Stated plainly |
| `partial` | Found, but the analysis is known-incomplete here — dynamic dispatch, computed access, a callback registered through a framework. | Stated with the reason it is incomplete |
| `inferred` | Not derivable. LLM labelling, grouping, any synthesized "why". | Marked, and structurally forbidden from citing a single span as proof |

A `partial` result must name *what* it could not resolve. "3 call sites unresolved
(dynamic dispatch at `router.ts:44`, `:61`, `:88`)" is a correct answer.
Silence is not.

## Sequencing — three moments, one engine

All three moments the tool serves run on the same resolution engine. Order is by
what is cheapest to build and proves the most.

**W1 — "I just generated this."** Diff-scoped. `understand-slop diff` against the
working tree or a commit range: what changed, what calls into it, what it reaches,
what became unreachable, which of those edges are `partial`. This is first because
it is the smallest graph (auditable at a glance), it needs no whole-repo indexing,
it is inherently fresh, and it maps to a moment that recurs daily. It is also the
only one of the three where no competitor operates at function granularity with
real resolution.

**W2 — "I inherited this repo."** Whole-repo, entry at any point. Not a tour from
`main` — the literature is unambiguous that nobody reads systematically. Search or
symbol is the entry point; the tool expands outward along resolved edges. Reuses
W1's engine with a wider scope and directory structure as the grouping prior
(measured: clustering the graph is *worse* than just using directories).

**W3 — "I have to explain this soon."** A read-aloud path through a subsystem,
assembled from W2, ordered by resolved call order, with the `partial` and
`inferred` marks visible so you know which parts you cannot defend. This is last
because it is presentation over the same data, and worthless if W1/W2 are wrong.

## Question targets

From `QUESTION-CATALOG.md` Part D. W1 ships the ones whose answers are **code
locations**, because those are checkable in one click:

1. `#3` Where is there any code involved in the implementation of this behavior?
2. `#5` What will be the total impact of this change? (static closure + `partial` marks)
3. `#7` What are the possible actual methods called by dynamic dispatch here?
4. `#12`/Sillito Where is this method called or type referenced?

W2 adds `#1` (when/how/by whom changed — from git, snippet-level not file-level)
and `#9` (is there a precedent for this).

`#8` "Why wasn't it done this other way?" ships as an **honest negative**: surface
explicitly-rejected alternatives if a linked PR thread contains them, otherwise
answer "no recorded rationale found." That is a correct and valuable answer — it
tells you to go ask a person instead of spending 25 minutes in irrelevant code.

## On capturing intent

`QUESTION-CATALOG.md` Part E argues generation-time capture is the *only* strategy
for AI code, since the rationale never existed to be mined. That is right, and it
sits against a separate finding that models' stated reasoning is ~25% faithful.

Both are true, and they resolve cleanly: **capture the inputs, never the model's
self-explanation.** The prompt, the constraints given, the alternatives the human
named, the files pinned — these are facts about what was asked. "Why the model did
it this way" is confabulation and must never be recorded as rationale. Deferred
until after W1 ships; noted here so the distinction isn't lost.

## Verification

`demo.sh` runs the tool against a pinned checkout of a real repo and asserts:

- import-edge precision stays ≥95% against textually re-derived specifiers
- every emitted fact carries one of the three states
- no `inferred` fact cites a single span as proof
- the `partial` count is reported, never zero-by-omission

A green typecheck with a wrong edge count is the worst state to be in, because it
looks fine.

## Time

Not on a clock. Cut from the bottom of the sequence — W3 before W2, W2 before W1 —
never from the three-state invariant or the precision gate.
