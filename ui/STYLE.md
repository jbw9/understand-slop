# Visual & motion style

The look of the canvas: warm paper ground, hairline-bordered white cards, one
green accent, and motion that never surprises you. Everything below is in use in
`ui/` — this is a record of what the code does and why, not an aspiration.

Tokens live in `app/globals.css` under Tailwind v4's `@theme`. There is no
`tailwind.config.ts` and there should not be one.

---

## 1. The ground rule

**Paper, not screen.** The page background is warm cream (`#fafaf8`), never pure
white and never grey. Cards are pure white and sit *on* that cream. This single
relationship does most of the work: a white card on cream reads as an object on
a surface, where a white card on white needs a shadow to exist at all.

Consequence: **shadows are nearly absent.** `--shadow-panel` is
`0 1px 2px rgba(26,26,46,0.04)` — barely a shadow, used on hover only. The one
real shadow is `--shadow-lift`, on a card held under the pointer mid-drag: that
card *is* off the paper, so the depth is describing something true rather than
faking separation the cream/white contrast already provides.
Separation comes from the cream/white contrast and a 1px border. If you find
yourself reaching for a heavier shadow, the contrast is doing something wrong.

---

## 2. Color

### Surfaces — a ramp, not a binary

```
--color-warm-cream            #fafaf8   page ground
--color-pure-white            #ffffff   card fill
--color-surface               #f9f9f7   panel headers
--color-surface-container-low #f4f4f2   row hover, ghost fill
--color-surface-container     #eeeeec   inline code fill
--color-surface-dim           #dadad8   the dot grid
```

### Ink — four weights, each with a job

```
--color-ink                #1a1a2e   titles, primary text
--color-on-surface         #1a1c1b   body inside cards
--color-on-surface-variant #404945   secondary prose, evidence rows
--color-muted-slate        #5b6270   labels, legend text
--color-faint              #6e747b   mono subtitles, eyebrows, line numbers
```

Mono subtitles are always `--color-faint`. That's what keeps a card's second
line from competing with its title — through size and weight, not paleness:
faint is held at 4.5:1 on cream (WCAG AA for small text), because most of it
is set at 9–11px. It was #9aa0a6 (2.5:1) and read as disabled.

### The three state families — this is the product, not decoration

Each state gets ink / surface / line, so a state can tint a chip, a row, or a
card edge and stay recognisably itself.

| State | Meaning | Ink | Surface | Line |
|---|---|---|---|---|
| **derived** | Compiler-resolved. Trustworthy. | `#1f5c4d` | `#e8f5e9` | `#cfe6d4` |
| **partial** | Found, known incomplete. | `#8a6416` | `#fdf6e3` | `#e2c77e` |
| **alarm** | Partial *and* worth acting on. | `#8e3320` | `#fbede9` | `#e0b3a5` |
| **inferred** | Not derivable. A guess. | `#5b6270` | `#f4f4f2` | `#c4bfb5` |

**`derived` carries no badge.** Marking certainty creates a two-tier read where
everything unmarked looks like a failure. Only the exceptions are marked — see
`StateChip`, which returns `null` for `derived`.

Green is the only accent. Amber and clay are semantic state, not brand color,
and never appear except to mean "incomplete" and "look at this."

### Lines

```
--color-border-gray   #dad6ce   every default border and divider
--color-border-strong #c4bfb5   hover, ghost edges, dashed borders
--color-wire          #8f8a80   list connectors (3.3:1 on cream)
```

`* { border-color: var(--color-border-gray) }` in `@layer base` means a bare
`border` class is already correct. You rarely name a border color.

---

## 3. Shape

```
--radius-panel 20px   panels, the canvas frame
--radius-chip  999px  value chips
14px                  node cards (literal, not a token)
12px                  rows, code blocks, callouts
```

Node cards sit at 14px deliberately — between the 20px panel and the 12px row,
so a card reads as its own object without competing with the panel containing
it. Tailwind's `rounded-xl` is ~17px and wrong here; use `rounded-[14px]`.

---

## 4. Type

Two faces, loaded via `next/font/google` in `app/layout.tsx`:

- **Inter** → `--font-sans`. All prose and UI.
- **JetBrains Mono** → `--font-mono`. Every identifier, path, line number,
  count, and eyebrow.

The sans/mono split is semantic: **mono means "this is a thing in the codebase."**
A file path, a symbol, a `:44`. Never use mono for prose and never set an
identifier in sans.

Sizes in use (literal, not tokens — the scale tokens exist but the dense canvas
runs tighter than they allow):

| Role | Size |
|---|---|
| Card title | 15px / 600 / `-0.01em` |
| Card title (compact) | 12.5px / 600 |
| Card subtitle | 11.5px mono |
| Card subtitle (compact) | 10px mono |
| Detail line | 10.5px / 1.6 |
| State chip | 10px mono, `tracking-wide` |
| Eyebrow | 10.5px mono, uppercase, `0.09em` |

Add `.tnum` (`font-variant-numeric: tabular-nums`) to anything numeric that
changes. Tailwind v4 doesn't emit this utility; it's defined in `@layer base`.

---

## 5. The dot field

```css
.dotfield {
  background-image: radial-gradient(var(--color-surface-dim) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

Texture, not a grid you align to. It pans with the world
(`backgroundPosition` bound to the pan springs), which is what sells the canvas
as a surface rather than a viewport onto a static image. It deliberately does
**not** scale with zoom — a dot field that grows reads as a zooming *image*;
one that only translates reads as paper the camera moves over.

---

## 6. Motion

This is the part that took the most iteration, so the reasoning matters more
than the numbers.

### The rule: content never appears unless you asked for it

Depth is driven by **click**. Zoom is **optical only** — it changes how big
things are and never what is shown.

An earlier version revealed content at zoom thresholds (past 1.35× members
appear, past 2.3× detail appears). It felt broken, and the reason is worth
keeping: crossing a threshold is *discontinuous* — one frame absent, next frame
fully present — and it fired while you were doing something else entirely
(looking closer). Content arriving must be the answer to a deliberate act.

### Springs carry the camera, raw input bypasses them

```ts
useSpring(value, { stiffness: 210, damping: 32, mass: 0.9 })
```

Drill transitions go through the spring. Wheel and drag call `.jump()` instead,
writing the motion value directly.

**This distinction is essential.** A spring on raw trackpad input feels like
dragging through syrup — the pointer and the content separate, and it reads as
lag. Direct input must stay 1:1; only *commanded* movement is animated.

`stiffness` is the main dial. Higher is snappier.

**Dragging a card is raw input, so it is 1:1 and unsprung** — the same rule as
wheel and pan. Two consequences. `transform` stays out of the card's
`transition-[…]` list, because a transition on it would lag the card behind the
pointer. And because cards live inside the scaled world, the pointer delta has
to be divided by scale before it becomes movement — done once as
`transformPagePoint` on a `MotionConfig`, not at the call site. Sending a card
home (`0`) is a *commanded* move and does ride the spring.

### Frame where the content will be, not where it is

`drillInto` computes the target box as the subsystem card **plus the height of
the members about to appear** (`84 + members * 54`). Without this the camera
settles, content arrives, and the camera shifts again — a double motion that
reads as a glitch even though each half is smooth.

### Things arrive; they don't appear

```ts
out: { opacity: 0, y: -6, scale: 0.97 }
in:  { opacity: 1, y: 0,  scale: 1 }
transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
staggerChildren: 0.035, delayChildren: 0.08
```

- **easeOutQuint** `[0.22, 1, 0.36, 1]` is the house curve. Fast start, long
  settle. Used for every entrance and every inline expansion.
- **Stagger 35ms** so a column of members resolves as a sequence rather than a
  block. Reversed (`staggerDirection: -1`, 20ms) on exit — leaving should be
  quicker than arriving.
- **Scale 0.97, not 0.9.** The camera is already moving; a strong card scale on
  top of it reads as two competing motions.
- **`delayChildren: 0.08`** lets the camera commit before content starts.

### Transitions name their properties

`transition-[border-color,opacity,box-shadow]`, never `transition-all`. On a
transformed canvas, `transition-all` will try to animate the transform and
fight the spring.

### Reduced motion

`@media (prefers-reduced-motion: reduce)` flattens durations to 0.01ms globally
in `globals.css`. Don't add per-component guards; the blanket rule covers it.

---

## 7. Connector lines

Full implementation in `components/wires.tsx`.

**Dashing is load-bearing, not decorative.** Solid = the compiler proved this
edge. Dashed = it did not. That distinction is the entire product thesis, so it
must survive a glance:

```
derived   solid,  #1f5c4d,  2px at depth 0 / 1.5px beyond
partial   5 4,    #8a6416
alarm     5 4,    #8e3320
inferred  2 4,    #6b7280
```

Depth fade: `max(0.2, 0.92 - depth * 0.24)` on the whole `<g>`, so edges
touching the focused node stay loudest.

Three implementation rules that are easy to get wrong:

1. **Endpoints are measured, never assumed.** `getBoundingClientRect` on the
   live DOM, because cards move (pan, zoom, expand).
2. **Ref callbacks must be referentially stable** — one cached callback per id.
   An inline `ref={(el) => …}` re-registers every render and, with a re-measure
   hung off registration, loops forever.
3. **Inside a scaled world, divide by the scale.** `getBoundingClientRect`
   returns post-transform screen pixels. The SVG lives inside the transformed
   element, so every measured delta is divided by `scale` to get back to world
   coordinates — otherwise wires are scaled twice and drift off the nodes as
   you zoom.

Re-measure is rAF-coalesced and listens for `scroll` in the **capture** phase
(scroll doesn't bubble) plus `resize` and a `ResizeObserver`.

---

### The three marks that mean direction

They are not interchangeable and the difference is not decorative:

| Mark | Where | Means |
|---|---|---|
| Stroked chevron, `M 2.5 2 L 8 5 L 2.5 8` | wire marker | this edge runs that way |
| The same chevron, pointing down | `flow` step rail | and then |
| `→` glyph | `map` rows | this becomes that |

The first two share a shape because both are sequence. The `map` arrow is a
rewrite rule, not a step, which is why it stays a different mark — if that
distinction ever stops being worth drawing, unify it rather than adding a
fourth.

## 8. Card anatomy

```
┌─────────────────────────────────────────┐
│ Title (15px/600)          [state chip]  │
│ path/or/subtitle.ts:44 (11.5px mono)    │
│ ─────────────────────────────────────   │  ← only at depth 2
│ One line of finding. (10.5px/1.6)       │
└─────────────────────────────────────────┘
  14px radius · 1px #e7e5e0 · white on cream
```

- Title `truncate` inside `min-w-0 flex-1`; the chip is `shrink-0`. The title
  gives way, never the state.
- Ghost cards (holes in the analysis) get `border-dashed border-border-strong`
  and a `surface-container-low/60` fill. **A hole should look unfinished,
  because it is.** This is the one case where a weaker-looking element is the
  correct output.
- Dimmed (out of focus): `opacity-40`. Hover: `border-border-strong` +
  `shadow-panel`. Held: `shadow-lift`.
- **The card face is a drag handle**, so everything on it that owns a press has
  to say so. Anatomy rows carry `data-row` and set their own `cursor-pointer`
  (Tailwind v4's preflight gives a `button` no cursor, and `cursor` inherits, so
  a row left alone would advertise `grab` and refuse it). The `source` block's
  code carries `data-copy` for the same reason in reverse: it is text you are
  meant to select, so it opts out of the gesture rather than the cursor.
- **Kind label** above the title: 9px mono, uppercase, `tracking-[0.09em]`,
  `text-faint`. No colour — green, amber and clay already mean state.

---

## 8b. Columns (the main view)

- List columns are 300px, separated by a 1px `border-border-gray` rule; the
  detail pane is 480px and white. Columns scroll vertically; the row of
  columns scrolls horizontally and slides to the end when the path changes.
- Column header: the layer name in the kind-label style (9px mono, uppercase),
  then `in <parent title>` at 11.5px with the title in `font-semibold text-ink`.
- List cards are the node card at 13px titles, selected as `border-deep-green`
  plus `ring-1`; a `›` marks a card with children.
- An edge between vertically adjacent cards is a connector: a 16px `border-wire`
  line with a 5px arrowhead and the edge label in 9.5px mono `text-faint`.
  Dashed when `inferred`, clay when `alarm` — the same encoding as wires.
- Any other edge is a relation chip in the card's footer: rounded-full,
  9.5px mono, `→ label · target`, dashed border when `inferred`.
- A new column slides in from x −8 at opacity 0 (easeOutQuint, 280ms); its
  cards follow at a 35ms stagger.
- **Code is never a column.** A card's function and class children are listed
  in the detail pane under `CODE · n`, each as its own editable card, and the
  pane scrolls as one list. The list card shows `n fn` in place of `›` when
  code is all it has. A class's methods are not listed again — they are in its
  body, and two editors over the same lines would drift.

---

## 8c. Explorer (the main view)

- **Code is syntax-coloured** from the `--color-code-*` tokens in globals.css,
  and ONLY in code: keyword purple, string steel blue, number indigo, type
  deep green, call ink semibold, comment faint italic. Amber and clay stay
  reserved for state. The editor draws the colour under a transparent-text
  textarea; both are as wide as the longest line so they never scroll apart.

- **Map cards** are a fixed 280×84 (world units), so wires are computed from
  the layout. The map opens fitted to the window and is then an infinite
  whiteboard: drag (anywhere, cards included — a press that moves more than
  4px pans and does not open the card) or scroll to pan; pinch or ctrl/⌘ +
  scroll to zoom at the pointer, 25%–250%; a corner control zooms and fits.
  The dot grid moves and scales with the board. No divider line: the store
  column is separated by distance and its STORE labels alone.
- **The view lives in motion values written straight to the DOM**, never in
  React state. Map cards carry the trail's shared `layoutId`, and a re-render
  that moves them is eased as a layout change — state-driven panning made the
  cards lag the pointer by ~50px.
- **The map is one column**, top to bottom in dependency order, stores in a
  column to the right. Three wire shapes: a straight arrow to the next card
  down; an arc in the left gutter (one lane per overlapping span, 26px apart)
  for an edge that skips cards; a horizontal curve across to a store.
  1.5px at 0.9 opacity, coloured and dashed by state like every wire
  (`STROKE`, `DASHED` in wires.tsx), drawn under the cards. Labels are 11px
  mono `text-faint` with a cream halo, at the first candidate spot that
  clears every card and label.
- **Trail:** a "← map" link, then one compact card per opened level, indented
  14px per level up to three. The current one is `border-deep-green` + ring.
  The first trail card shares a `layoutId` with its map card, so the card you
  click is the card that moves (400ms, easeOutQuint).
- **Every card is a link.** The open path lives in the URL
  (`?map=<name>&at=<id>/<id>`, each id URI-encoded) and every move pushes a
  history entry, so the browser's back and forward — mouse side buttons,
  Alt+←, trackpad swipes — step through cards, and middle- or ctrl/⌘-click
  opens a card in a new tab. Cards are `<a href>` with a plain-click handler
  (`onPlainClick` in nav.ts) that keeps the in-page glide; map cards set
  `draggable={false}` so a link's native drag never fights panning.
- **Pane code trail:** 9.5px mono — `← back`, `CODE · <card>`, then
  `› <function> calls|methods` per step, and a count. Drill chips under a
  function read `calls n · a, b ›` / `methods n · a, b ›`.

---

## 9. Light mode only

There is no dark palette and no `@custom-variant dark`. The paper metaphor is
the design; a dark inversion would need a different one, not inverted tokens.
If dark mode is ever wanted, it's a redesign, not a token swap.

---

## Reuse checklist

1. Copy the `@theme` block from `app/globals.css`, plus `.tnum` and `.dotfield`.
2. Load Inter as `--font-sans` and a real mono as `--font-mono` via `next/font`.
3. Cream page, white cards, 1px `#e7e5e0`, 14px radius, no shadow at rest.
4. Mono for anything that names code. Sans for everything else.
5. Don't badge the confident state. Badge only the exceptions.
6. Click changes what's shown; zoom changes only how big it is.
7. Spring the camera, `.jump()` raw input.
8. Name your transition properties.
