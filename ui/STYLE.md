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
`0 1px 2px rgba(26,26,46,0.04)` — barely a shadow, used on hover only.
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
--color-muted-slate        #6b7280   labels, legend text
--color-faint              #9aa0a6   mono subtitles, eyebrows, line numbers
```

Mono subtitles are always `--color-faint`. That's what keeps a card's second
line from competing with its title.

### The three state families — this is the product, not decoration

Each state gets ink / surface / line, so a state can tint a chip, a row, or a
card edge and stay recognisably itself.

| State | Meaning | Ink | Surface | Line |
|---|---|---|---|---|
| **derived** | Compiler-resolved. Trustworthy. | `#1f5c4d` | `#e8f5e9` | `#cfe6d4` |
| **partial** | Found, known incomplete. | `#8a6416` | `#fdf6e3` | `#e2c77e` |
| **alarm** | Partial *and* worth acting on. | `#8e3320` | `#fbede9` | `#e0b3a5` |
| **inferred** | Not derivable. A guess. | `#6b7280` | `#f4f4f2` | `#d6d3cc` |

**`derived` carries no badge.** Marking certainty creates a two-tier read where
everything unmarked looks like a failure. Only the exceptions are marked — see
`StateChip`, which returns `null` for `derived`.

Green is the only accent. Amber and clay are semantic state, not brand color,
and never appear except to mean "incomplete" and "look at this."

### Lines

```
--color-border-gray   #e7e5e0   every default border and divider
--color-border-strong #d6d3cc   hover, ghost edges, dashed borders
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
  `shadow-panel`.

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
