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
