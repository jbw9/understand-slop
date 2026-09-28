# Status

## Now

Round 1 of the comprehension rework is out to three builders. Contracts were
frozen first, as real files, before anyone was dispatched.

| WS | What | Owns | State |
|---|---|---|---|
| A | Naming + density: labels not sentences, `footprint`, `summary`, `group` | `lib/taxbuddy.ts` | running |
| B | Sequence arrows at every level, orphan roots, the D12 level-1 camera, density | `components/wires.tsx`, `components/canvas.tsx` | running |
| C | Real code level: repo binding, row-width fix, gated editing | `components/anatomy.tsx`, `lib/repo.ts`, `app/api/source/` | running |
| D | Orientation chrome: breadcrumb, legend, key hints | `components/chrome.tsx` | **built, not wired** |

Workstream D is done and green (tsc + eslint) but `chrome.tsx` is not yet
mounted — wiring it needs `canvas.tsx`, which workstream B owns this round.
Mount it at fan-in.

## Contracts (frozen, no builder edits these)

- `ui/lib/data.ts` — added `Edge.order`, `interface Group`, `Node.footprint`,
  `Node.summary`, `Node.group`. Additive only; nothing existing changed.
- `ui/lib/view.ts` — new. Naming rule, `BLURB_LINES`, `ROW_LABEL_MAX_PCT`,
  `ROW_VALUE_MIN_PX`, `CARD_ROWS_SOFT`, `STATE_MEANING`, `Ordering`.
- `ui/lib/repo.ts` — new. `REPO_ROOT`, `Slice`, `ReadSlice`, `WriteSlice`.

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

1. Fan in: read back all three diffs, mount `chrome.tsx`, re-drive in Chrome.
2. Green gate (tsc + eslint + driven in the browser), then commit and push.
3. Backfill `At scale:` on D1-D15 — 15 decisions still lack one.
4. Open question nobody has answered: what the SECOND repo looks like. Every
   fixture fact is hand-authored for taxBuddy, and D11 measured the cost at a
   full day's reading per repo.
