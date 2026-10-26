# Status

## Now

Round 1 of the comprehension rework has LANDED. All four workstreams are in,
both static legs are green, and the board was driven in Chrome.

| WS | What | Owns | State |
|---|---|---|---|
| A | Naming + density: labels not sentences, `footprint`, `summary`, `group` | `lib/taxbuddy.ts` | running |
| B | Sequence arrows at every level, orphan roots, the D12 level-1 camera, density | `components/wires.tsx`, `components/canvas.tsx` | running |
| C | Real code level: repo binding, row-width fix, gated editing | `components/anatomy.tsx`, `lib/repo.ts`, `app/api/source/` | running |
| D - orientation chrome | Breadcrumb, legend, key hints | `components/chrome.tsx` | landed, wired |

Verified at fan-in, by me, in the running app:

- Breadcrumb reads `taxBuddy › Profile`, and clicking a crumb returns to that depth.
- `Profile` (a declared sequence) draws **2 arrows**; `Eligibility` (a declared
  set) draws **none** and states its note instead. Both halves of D19.
- `Eligibility` frames at y:72 — exactly `TOP_GUTTER` — inside an 808px
  viewport. D12 is closed (D22).
- Path containment refuses `../../../etc/passwd`, absolute paths, URL-encoded
  traversal, and an escape into this repo. A stale write returns 409.
- 0 of 10 subtitles clip, down from 7 of 10.

## Since round 1 (2026-10-21)

Navigation rebuilt as one level at a time (D28): header = open node, body =
its children, rail on the left, code at the bottom. The open level is in the
URL, so back/swipe/Esc/"← parent" all work and clicking empty space does
nothing (D29). The code level now actually reads taxBuddy on this machine
(D30). Verified in headless Chrome at 1512 and 1280: overview, Extraction,
BDA Parse, a row level, a source level reading the real file, Tax Engine,
Formulas; back steps one level at a time. tsc and eslint clean.

## Round 2 landed (2026-10-21)

The map is now **explorify** (`~/Desktop/Code/explorify` @ 59a89b3), authored
by WS-E. 9 roots, every one 5 deep and ending in live source; 55/55 source
blocks verbatim (check-map.mts); 6 roots on the path, 3 outside it. Levels are
step by step (D31): a level names its parts in compact rows and never shows
their contents; order is a numbered rail, a set is a grid; no arrows between
boxes. Fixture plumbing moved to `lib/map.ts` (D32) — switching repos is one
import. Driven in headless Chrome: every root descends to readable code.

~~Known: row-built level titles lowercase~~ — gone in round 3: no node uses
`under` rows any more, and check-map enforces capitalised titles.

## Round 3 landed (2026-10-21)

Every level explains itself; the code is a folded drawer on every level, never
the bottom (D34). The path forks into Students / Organisations after Opening
The App (D33); the sidebar is a top breadcrumb (D35); file paths show only on
the last two levels of a branch (D36). WS F1-F3 re-authored all 9 roots from
the source: 63 nodes, 281 code refs, 0 check-map problems, 0 `source` blocks,
plain titles. All 63 levels driven in headless Chrome: correct title, no
console errors, no horizontal scroll.

explorify moved to **304a512** mid-round — the owner's fix for delete-user
(now takes the user from the caller's token). The map describes the fixed code.

Known: LINKS (row-to-row trace wires) only render when both rows are on one
level, which one-level-at-a-time makes rare; 4 remain, none verified on screen.
The code drawer's edit/save path is still untested end to end.

## Contracts (frozen, no builder edits these)

- `app/lib/data.ts` — added `Edge.order`, `interface Group`, `Node.footprint`,
  `Node.summary`, `Node.group`. Additive only; nothing existing changed.
- `app/lib/view.ts` — new. Naming rule, `BLURB_LINES`, `ROW_LABEL_MAX_PCT`,
  `ROW_VALUE_MIN_PX`, `CARD_ROWS_SOFT`, `STATE_MEANING`, `Ordering`.
- `app/lib/repo.ts` — new. `REPO_ROOT`, `Slice`, `ReadSlice`, `WriteSlice`.

## What bit us

- **The UI had no chrome at all.** Driven in Chrome: no `h1`, no nav landmark,
  no breadcrumb, no legend, zero aria-labels on 10 buttons. Three levels deep
  there was no way to answer "where am I" except from memory.
- **Text was starved while the screen sat empty.** Overview measured 14.6% ink.
  7 of 10 subtitles clipped mid-word, several by 12-95px. One `map` row was
  212px wide with the label taking 112px and the value 32px, rendering one word
  per line over twelve lines.
- **D12 is worse than recorded.** Clicking a root leaves the *entire* viewport
  empty, not merely the children below the fold. Measured on a row drill:
  content ended at y:397 in an 863px viewport while the owner card sat at
  y:-409.
- **The depth complaint was a misdiagnosis.** "Some parts go deep, some are
  shallow" is a real symptom, but depth is already uniform (9 roots at 4 levels,
  all 10 reaching source). The variance is content per card — 26x between the
  densest and the sparsest. See D17.

## Next

1. **`eng-math` renders ~3,000px tall** and no camera can frame it. This is
   D18's accepted cost arriving in practice — the no-row-cap decision, working
   as specified, on the one node that breaks it. Narrow fix: make that single
   node a list-level. Needs a call before anyone builds it.
2. Backfill `At scale:` on D1-D15 — 15 decisions still lack one.
3. Open question nobody has answered: what the SECOND repo looks like. Every
   fixture fact is hand-authored for taxBuddy, and D11 measured the cost at a
   full day's reading per repo.
