# understand-slop

## The problem

Code gets written faster than anyone can read it. The mistakes that matter are
architectural, and they surface months later, when fixing them means
understanding a large amount of code nobody ever read.

Today the only way to explore an unfamiliar codebase is to ask an assistant "how
does this work?" — which answers one question while losing the big picture. The
goal is a visual way to explore instead: start broad, pinpoint a part, go deeper
and deeper, down to the line, and be able to trace it back.

## Settled (2026-09-28)

These were open questions. They are now answered, with evidence.

- **The top level is the product's features, not the repo's architecture.**
  Measured: every feature cuts across directories. `eligibility` is `lib/rules`
  alone, but `identity` spans `app/(protected)`, `lib/rules` and `app/api`, and
  `lib/rules` is touched by four different features. An architecture cut would
  force those four to share one box, which is the "what belongs to what"
  confusion we are trying to delete.
- **Depth is four levels, and it is already uniform.** Audited: 10/10 roots
  reach a real `source` block; 9 are exactly 4 deep, `unreachable` is 3 because
  it genuinely has less to say. Depth is not the inconsistency.
- **The inconsistency is breadth and text volume.** `engine › Every formula`
  holds 13 children and 12.7KB of text; `store › What is stored in the clear`
  holds 483 chars and none. Same card treatment, 26x the content.
- **Cards scale to their content.** Decided against a hard row cap: the size of
  a card is information about the thing it describes. Outliers get authored
  down, not clipped.
- **Arrows mean real sequence.** Draw a wire between siblings only where one
  genuinely precedes another. Siblings with no true ordering render as a group
  with no wire, and say so. Today there are 6 edges, all at root, and zero
  below it.
- **The code level binds to the real repository.** `~/Desktop/Code/taxBuddy` is
  a live git checkout and every spot-checked `file:line` in the fixture resolves
  to the right line. Read from disk rather than trusting pasted text.
- **In-place editing is in scope, gated.** Reading real files is unrestricted;
  writing is confined to the repo root, one file at a time, with a diff shown
  before it applies.

## Stack

Next.js 16 (App Router, Turbopack) - React - TypeScript - Tailwind - motion.
No new dependencies without asking.

## Contracts (frozen for this round)

Written as real files before any builder was dispatched:

- `ui/lib/data.ts` - the node/anatomy/state types. `Edge` gains `order`.
- `ui/lib/repo.ts` - the repo-reading contract (`readSlice`, `writeSlice`).
- `ui/lib/view.ts` - naming, density and label rules every card obeys.

## Workstreams

| ID | Owns | Agent |
|---|---|---|
| A - naming + density | `lib/taxbuddy.ts` | builder |
| B - sequence arrows | `components/wires.tsx`, `components/canvas.tsx` | builder |
| C - code level | `components/anatomy.tsx`, `lib/repo.ts`, `app/api/source/` | builder |
| D - orientation chrome | `components/chrome.tsx`, `app/layout.tsx`, `app/page.tsx` | builder-fast |

Disjoint by file. `lib/data.ts` and `lib/view.ts` are contracts: no builder
edits them.

## Time

Round 1 dispatched 2026-09-28.

## Round 2 (2026-10-21) — step-by-step levels, and a second repo

Navigation is one level at a time (D28, D29). A level answers one question:
its header is the open node (paragraph, diagram), its body is its parts named
in compact rows — never their contents — or, at the bottom, the code.

The mapped repo moves from taxBuddy to **explorify**
(`https://github.com/jbw9/explorify`, cloned to `~/Desktop/Code/explorify`,
commit `59a89b3`). Expo / React Native campus-events app: students
(`app/individual`) and organisations (`app/org`), Supabase, two edge
functions, a small Python API.

Contracts (frozen this round): `ui/lib/data.ts` (now with `Run`),
`ui/lib/view.ts`, `ui/lib/map.ts` (the one-line switch between fixtures —
main thread flips it at fan-in).

| ID | Owns | Agent |
|---|---|---|
| E - explorify fixture | `ui/lib/explorify.ts` (new); `ui/components/shapes.tsx` (append marks/figures only) | builder |

Main thread owns `components/canvas.tsx`, `components/chrome.tsx`, `lib/map.ts`.
Fan-in check: `check-map.mts` (every `source` block verbatim at its line,
unique ids, E0/LINKS resolve), tsc, eslint, and the app driven level by level.

## Round 3 (2026-10-21) — understand it without reading the code

The user: "barely any info … it just dives straight into the code. The goal is
not to inspect the code directly, that should be the last resort that's always
available … when i click category list it should list the categories." Plus:
plain names (no "Org Wizard"), diagrams as the main content, any depth, and no
sidebar.

A level now explains itself, top to bottom: header (1-3 plain paragraphs) →
the picture (`diagram`, or a `figure` shape drawn full width) → its own data
(`table`, `sequence`, `screen`, `example`, `schema`, `flow`…) → parts to go
deeper → Watch out (`issues`) → the code, folded (`code` refs, read live).
Depth is whatever the explanation needs. Exemplar: `su-cats` in
`ui/lib/explorify/signup.ts`.

Contracts (frozen this round, main thread only): `ui/lib/data.ts`,
`ui/lib/view.ts`, `ui/lib/explorify/index.ts` (RUN, E0, LINKS — root ids are
fixed), `ui/scripts/check-map.mts`, all of `ui/components/`.

| ID | Owns | Agent |
|---|---|---|
| F1 - sign up, launch, account | `ui/lib/explorify/{signup,launch,account}.ts` | builder |
| F2 - organisation side + server | `ui/lib/explorify/{create-event,check-in,server}.ts` | builder |
| F3 - student side + backend | `ui/lib/explorify/{feed,rsvp,supabase}.ts` | builder |

Fan-in: `npx -y tsx --tsconfig tsconfig.json scripts/check-map.mts @/lib/explorify
~/Desktop/Code/explorify` with 0 problems, tsc, eslint, every root driven in the
browser, LINKS repaired in index.ts.

## Round 4 (2026-10-21) — short text, real screens

The user: "this is way too long … i want to replace the huge text block with
beautiful simple diagrams instead", and screens should be "the real thing".
Every node's `detail` ≤ 2 sentences / ≤ 40 words (D38): the substance moves
into diagram/sequence/table/screen blocks and issues, and nothing true is lost.
Every `screen` block that the web build can show gets a real `shot` (D37).
Exemplars: `ce-home` (three shots) and `su-cats`.

Contracts (frozen this round, main thread only): everything frozen in Round 3,
plus `ui/scripts/capture/*`.

| ID | Owns | Agent |
|---|---|---|
| G1 - sign up, launch, account | `ui/lib/explorify/{signup,launch,account}.ts`, `ui/public/shots/explorify/{su,ln,ac,signup,launch,account}*.png` | builder |
| G2 - organisation side + server | `ui/lib/explorify/{create-event,check-in,server}.ts`, `ui/public/shots/explorify/{ce,ci,sv,create-event,check-in,server}*.png` | builder |
| G3 - student side + backend | `ui/lib/explorify/{feed,rsvp,supabase}.ts`, `ui/public/shots/explorify/{fd,rv,sb,feed,rsvp,supabase}*.png` | builder |

Fan-in: check-map 0 problems, tsc, eslint, every level crawled, and the
screenshots looked at.
