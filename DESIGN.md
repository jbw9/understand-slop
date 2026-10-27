# Design

How the app works and how it looks. Part one covers what is on screen and how
you move through it. Part two covers the look: paper, cards, the one green, and
motion. The reasons behind each choice are in [DECISIONS.md](DECISIONS.md),
cited as `Dn`. This records what the code does now, not an aspiration;
anything not yet true is in §18.

Code paths are relative to `app/`.

---

# Part one — behaviour

## 1. What it is for

A reader opens a repository they did not write and needs to know how it works,
fast enough to talk about it. The app answers that one question a level at a
time: what this part is, how its pieces fit, and where the code is. It is a
reading tool, not a diagramming tool. It is not a zoomable map of the code
(D1), and nothing on screen is decoration: every arrow claims a real sequence
(D19), and every picture draws something the analysis found (D25).

Two readers, one screen:

- **The person** reads levels, follows pictures down, opens code at the bottom.
- **Claude**, in a workspace tab, is handed sections as context and can move
  the person's view to the section it is talking about (D59).

---

## 2. The mental model

| Thing | What it is | Where it lives |
|---|---|---|
| **Map** | One repository's explanation, written by the generator | `maps/<name>/map.json`, or the vault for imported projects |
| **Level** | One node of the map, open. The repository itself is the top level (D60) | `Level` in `components/canvas.tsx` |
| **Part** | A child of the open level. Named and peeked at, never opened in place (D31) | `Steps` / `Grid` / `List` in `canvas.tsx` |
| **Block** | One piece of explanation on a level: diagram, table, sequence, screen, example (D34) | `components/blocks.tsx`, `components/anatomy.tsx` |
| **Wire** | A row-to-row line, e.g. a foreign key, drawn in its state's style | `components/wires.tsx` |
| **State** | How sure the map is: `derived`, `partial`, `inferred` (D3) | `components/state.tsx` |
| **Origin** | Where a thing came from when not the code: the reader. A second axis, never a fourth state (D53) | `OriginMark` in `state.tsx` |
| **Overlay** | What the reader added or corrected, kept beside the map, never in it (D54) | `lib/overlay.ts` |

The rule that ties them together: **one level at a time** (D28). The open node
is the page; its parts are the way down; the trail is the way back. Level six
looks like level one.

---

## 3. The screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ map ▾  ›  Sign Up  ›  Student Sign-Up      ◷ status   ▣ ± ✎ ⟲ >_ ⚙ – □ × │  Titlebar
├──────────────────────────────────────────────────────────────────────┤
│  ← Sign Up                                           ┌──────────────┐│
│  INSIDE SIGN UP                                      │ Claude │ zsh +││
│  Student Sign-Up                       [partial]     │──────────────││
│  one-line sub · two-sentence detail                  │              ││
│  ──────────────────────────────────                  │   terminal   ││  Canvas
│  [ the picture: boxes open parts ]                   │              ││  + Workspace
│  ──────────────────────────────────                  │              ││  (floats)
│  tables · screens · sequences · examples             │              ││
│  ──────────────────────────────────                  └──────────────┘│
│  4 parts · 3 of them on the picture above                            │
│  Watch out  ·  View the code (leaf levels only)                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Title bar — `components/titlebar.tsx`

The window's own bar; the native one is off. It carries **where you are**: the
map switcher (`MapSwitcher`) and the trail of levels (`Crumbs`,
`components/chrome.tsx`), which wraps instead of truncating (D35). On the right
are one button per dialog, then the window buttons (D46: a Mac keeps its own
traffic lights). Between them is a status line: a map update running, done or
failed, or "This map doesn't follow edits" with an import link. Outside the
desktop app no title bar is drawn, and the canvas draws the crumbs itself.

### Canvas — `components/canvas.tsx`

The rest of the window, scrolling. It shows exactly one `Level`, top to bottom:

1. **Header.** A back link to the parent, the eyebrow ("Repository" / "Inside
   X"), the title with its state chip, sub, detail (two sentences at most,
   D38), and an `unsure` reason when the level is not `derived`. File paths
   appear only near the bottom of a branch (D36, D42).
2. **The picture.** A figure or diagram at full width. Boxes that open a part
   are links, coloured by the section they open (D40, D52).
3. **Blocks.** The level's own data, one hairline between each.
4. **Parts.** A numbered rail if they are a sequence, a grid if they are a set,
   or a quiet one-line index when the picture already reaches them (D40). The
   section is left out when the picture covers every part.
5. **Watch out.** The level's issues, with a button that hands them to the agent.
6. **Code.** Folded, and only on a level with no parts below it (D61).

### Workspace — `components/workspace.tsx`

A window floating over the map's right edge, holding tabs. Each tab is a real
terminal in the map's checkout (`components/shell.tsx`), started as Claude
Code, another installed agent (`components/agents.tsx`), or a plain shell. It
floats, so opening it never takes space from the map. Hiding it never ends a
program. Desktop only.

### Dialogs

All dialogs sit over the map on a shared `Overlay` (`components/dialog.tsx`):
Escape or a click outside closes them, and Escape stops at the dialog instead
of also leaving the level.

| Dialog | Opens from | Shows |
|---|---|---|
| Projects — `projects.tsx` | title bar, "Import to keep it updated" | your imported projects, shipped examples, a wizard to start or import one |
| Diff panel — `diff-panel.tsx` | title bar, or Claude setting a range | every section a commit range touched; a click opens that level (D58) |
| Audit — `audit.tsx` | title bar | how the map was made: the run's `audit.md` |
| History — `history.tsx` | title bar | what you added to this map, every earlier version, revert |
| Settings — `settings.tsx` | title bar | theme, background (dots / squares / plain), default agent, Claude Code path, model |

---

## 4. Main flows

**Read a repository.** Open the app → the most recently opened project's top
level (or the default example) → read the overview picture → click a box →
that part's level slides in → repeat until a level has no parts → open the
code. Back is the browser's back, the swipe, Esc, the "←" link, or a crumb.

**Ask Claude about what you're looking at.** Right-click anything on a level
(a card, row, box, block, line of code, or empty space for the whole section)
→ "Add to Claude context" or "Add and open Claude" → the item waits in the tab
for your next prompt → ask. Claude can run `slop-map-show section "<title>"`,
which moves your view while the answer is still arriving (D59).

**Keep or correct what the map says.** After Claude answers, a level offers to
keep the answer as a block marked as yours (`KeepAnswer`). "Fix this" either
sends a correction through the updater, which re-reads the code so the section
stays `derived`, or saves your own words in the overlay (D55). History lists all
of it and can revert.

**Review a change.** Diff button → the panel lists changed sections → click
one → the same level, decorated: tinted sections, removed things in red beside
their replacements (D56). By default the range is the map's commit to the
working tree. If a range can't be compared section by section, the panel says
why and lists the changed files instead of guessing.

**Map a new project.** Projects → start → choose a new folder or an existing
one → mapping runs through your Claude Code → finished sections can be opened
before the run ends (D57).

---

## 5. States

| State | What the reader sees |
|---|---|
| **No overview yet** (mid-run) | The top level lists its roots as parts, the same as any node without a picture (D60) |
| **Half-made map** | Finished sections can be explored. Only the project list shows that the run is still going (D57, known gap) |
| **Unknown map or level** | A `?map=` that isn't found falls back to the default example; a path whose id was renamed falls back to the repo level (D29) |
| **Example map** | Read-only: no overlay, no corrections. Code comes from the committed `source.json` when the checkout is missing |
| **Map from another copy** | Title bar: "This map doesn't follow edits", with an import link |
| **Updating** | Title bar: "◷ Updating the map…" → "✓ Map updated: <sections>" for 6 s, or "✗ Map update failed" with the error on hover |
| **Not certain** | `partial`: solid amber edge; `inferred`: dashed. Each carries its `unsure` reason. `derived` carries no mark (D3) |
| **Claude names a missing section** | Claude says so briefly and the view doesn't move (`components/acts.tsx`) |
| **Browser, not desktop** | No title bar, workspace, right-click menu, or keep/fix. Crumbs are drawn on the canvas |

---

## 6. Interaction rules

**Navigation is the URL.** `?at=a&at=b` is the open path, pushed with
`pushState` (D29). That means every level has its own history entry and can be
linked or reloaded. Clicking empty space does nothing.

| Input | Does |
|---|---|
| Esc | Clears a trace first, then goes up one level |
| `0` | Back to the top level |
| Click a row with a key | Traces its chain six hops out; everything else greys |
| Pinch, ⌘/Ctrl-scroll, ⌘ + / − / 0 | Magnifies the level without reflowing it (D45, `components/zoom.tsx`) |
| Right-click (desktop) | Hand the item under the pointer to Claude (`PickMenu`) |
| Ctrl+` | Show or hide the workspace |
| Ctrl+T / Ctrl+Shift+T | New shell tab / new tab in the default agent |
| Ctrl+W (inside the workspace) | Close the tab in view |
| Tab, Enter on a diagram box | Boxes are real links, so they take focus and can be cmd-clicked (D40) |

**Motion.** A level slides in from the direction you moved, deeper or back, in
180 ms. Everything else follows §13: content
never appears unless you asked for it.

---

## 7. Non-goals

- **A whole-tree overview.** You can't see two branches side by side. That is
  the cost of D28.
- **A separate diff screen.** A diff decorates the level you already know
  (D56).
- **Quizzes or self-tests** (D4).
- **Languages beyond TS/JS for resolution** (D2).
- **An icon library.** Marks are hand-drawn SVG (`components/shapes.tsx`).

---

# Part two — look

The look of the canvas: warm paper ground, hairline-bordered white cards, one
green accent, and motion that never surprises you.

Tokens live in `app/globals.css` under Tailwind v4's `@theme`. There is no
`tailwind.config.ts` and there should not be one.

---

## 8. The ground rule

**Paper, not screen.** The page background is warm cream (`#fafaf8`), never pure
white and never grey. Cards are pure white and sit *on* that cream. This single
relationship does most of the work: a white card on cream reads as an object on
a surface, where a white card on white needs a shadow to exist at all.

Consequence: **shadows are nearly absent.** `--shadow-panel` is
`0 1px 2px rgba(26,26,46,0.04)` — barely a shadow, used on hover only.
Separation comes from the cream/white contrast and a 1px border. If you find
yourself reaching for a heavier shadow, the contrast is doing something wrong.

---

## 9. Color

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

## 10. Shape

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

## 11. Type

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

## 12. The dot field

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

## 13. Motion

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

## 14. Connector lines

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

## 15. Card anatomy

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

## 16. Light mode only

There is no dark palette and no `@custom-variant dark`. The paper metaphor is
the design; a dark inversion would need a different one, not inverted tokens.
If dark mode is ever wanted, it's a redesign, not a token swap.

---

## 17. Reuse checklist

1. Copy the `@theme` block from `app/globals.css`, plus `.tnum` and `.dotfield`.
2. Load Inter as `--font-sans` and a real mono as `--font-mono` via `next/font`.
3. Cream page, white cards, 1px `#e7e5e0`, 14px radius, no shadow at rest.
4. Mono for anything that names code. Sans for everything else.
5. Don't badge the confident state. Badge only the exceptions.
6. Click changes what's shown; zoom changes only how big it is.
7. Spring the camera, `.jump()` raw input.
8. Name your transition properties.

---

## 18. Open questions

- **Theme.** Settings offers system / light / dark (`lib/settings.ts`), but
  §16 still says light mode only. One of them is stale.
- **The camera is gone.** §12 and parts of §13 (springs, `drillInto`, a dot
  field bound to pan) describe the pan/zoom canvas that D28 replaced with one
  level at a time. The level transition now is a 180 ms fade-and-slide (§6).
- **Incomplete maps** don't say so on the level itself (D57).
- **Wide levels.** The ~7 parts per level is an authored budget, not enforced.
  A generated map with 30 parts would be a long scroll (D28, D31).
- **Orphaned additions.** When a regenerate renames a section, the reader's
  entries for it are kept but shown nowhere until recovered by hand (D54).
- The components, map schema and generator have uncommitted changes as of
  2026-10-26 (overview work, D60/D61). Re-check §3 and §5 once they land.
