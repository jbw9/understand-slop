# Landing page design

The page at `/` (`app/page.tsx`, `components/v2/`, styles in `components/v2/v2.module.css`). The old page lives at `/v1` and does not follow this.

**The idea:** one ink, cobalt, on a white sheet that lies on a blueprint desk. Everything on the sheet is drawn in that one ink: the lettering, the labels, the rules and the pictures. There is no second colour, and the page is always light.

## Colour

All colours are tokens on `.page`. Use the tokens, never a raw value.

| Token | Value | Use |
| --- | --- | --- |
| `--desk` | `#1a2fa0` | The blueprint around the sheet |
| `--desk-line` | `rgba(255,255,255,.1)` | The desk's 64px grid |
| `--paper` | `#fcfdff` | The sheet |
| `--low` | `#eef1fd` | Hover fill, quiet panels |
| `--ink` | `#2438c8` | Text, borders, fills: the one colour |
| `--muted` | `#4a5bd2` | Secondary text |
| `--faint` | `#8995e2` | Tertiary text |
| `--line` | ink at 18% | Hairlines, dotted guide lines |
| `--strong` | ink at 50% | Borders on small boxes, frames around pictures |
| `--grid` | ink at 7% | Grids drawn on the sheet |
| `--on-ink` | `#fcfdff` | Text on an ink fill |

Selection is ink with paper text. A selected or hovered control fills with ink, and its text turns `--on-ink`.

## Type

| Role | Face | How |
| --- | --- | --- |
| Lettering (`--display`) | Zilla Slab 300 | Headings, the cover, big lines. Tight: line height about 1, letter-spacing about `-0.016em` to `-0.022em`. |
| Labels (`--mono`) | IBM Plex Mono | Nav, buttons, tabs, years, notes. 11.5–13px, uppercase, letter-spacing `0.02em`–`0.06em`. |
| Reading | IBM Plex Sans | Body text at 14px, line height 1.5. |

Sizes use `clamp()`. For example, the cover is `clamp(46px, 5.5vw, 92px)` and section headings are `clamp(32px, 4vw, 60px)`.

Headings are short sentences that end in a full stop: "People used to write every line." / "And now there's you."

## Labels on the sheet

- **Bracket labels**: `[ HOW WE GOT HERE ]` are mono, uppercase, 12px, in ink. Use `.bracket`, or `.eyebrow`, which adds the brackets itself.
- **Boxed words**: a phrase in a thin `--strong` border with a small mono tag hanging off it (`.boxed`), like a note an engineer pencilled on a drawing.
- **Buttons and nav links**: square corners, a 1px ink or `--strong` border, mono uppercase. On hover they fill with ink. Nothing on the sheet is rounded except the sheet itself (6px).

## Pictures

Every picture is redrawn in the page's ink, so it reads as part of the drawing, not a photo pasted on.

**The treatment.** Every picture is drawn in these four colours and nothing else, with Floyd–Steinberg dithering:

```
#2437c7  (36, 55, 199)    ink
#7786e0  (119, 134, 224)
#c3caf3  (195, 202, 243)
#fbfdff  (251, 253, 255)  paper
```

Recipe (Pillow): grey → `autocontrast(cutoff=1)` → a gamma lift (`v ** 0.6–0.8`) so faces don't go muddy → `ImageOps.colorize(black=ink, mid=#7786e0, white=paper)` → `quantize(palette=those four, dither=FLOYDSTEINBERG)`. Save as an 8-bit PNG.

There are two kinds of picture:

1. **Framed plates**: a rectangle of the photo with a 1px `--strong` border, sometimes tilted 1–2°. Examples: the timeline portraits (`tl-*.png`, 400×500, 4:5), and the small pictures set in the cover's lines of text (`.inline`, sized in `em` so they sit in the line; set `--r` to the photo's own width/height so nothing is cropped).
2. **Cutouts**: the subject with no background. After dithering, make the paper colour transparent, so the picture fades into the sheet. Examples: Adam's hand on the cover (`hand.png`), and Uncle Sam behind "And now there's you." (`uncle-sam-cutout.png`). To cut out a subject, flood-fill the light background from the edges and fade the bottom out with a gradient. Keep anything pale that belongs to the subject, like Uncle Sam's hat, out of the fill.

Prefer public-domain pictures (Wikimedia Commons) and name each one in the credits line at the foot of the page. A picture that isn't public domain gets its licence in the credits.

When you replace a picture, give the file a new name. Browsers cache by name, so a new picture under the old name shows the old one to anyone who has been here before.

## Layout

- The sheet is inset from the window by `--edge` and scrolls itself, not the window. Listen for scroll on `.page`, not `window`.
- Content is at most 1480px wide, with a `--gutter` of 16–44px at the sides. Sections are `--gap` apart (96–160px).
- The nav sticks to the top, in paper at 88% with a blur. It gains a hairline once the page scrolls.
- Breakpoints are at 1180, 1080, 900, 700, 600 and 420px. Check the page at phone width (390px) after any layout change.

## The timeline

"How we got here" is one line drawn down the sheet through a few people, ending at the app.

- The stops are placed in the drawing's own units (1000 wide, `H` tall) in `landing-evolution.tsx`, alternating left and right, 350 units apart.
- A dotted `--line` ghost shows the whole path. The ink line is the same path, clipped from the top as the reader scrolls (`clip-path: inset(...)` driven by `--p`). Its tip stays at 60% of the screen's height.
- The line fades out at the bottom, so it never draws over the picture behind the next heading.
- Each stop is faint (25% opacity) until the line reaches it.

## Motion

- The easing is always `--ease` (`cubic-bezier(0.22, 1, 0.36, 1)`).
- On load, elements fade in in sequence (`.rise`, delayed by `--i × 80ms`).
- On scroll, sections reveal with scroll-driven animations (`animation-timeline: view()`). The app zooms up out of the page as you reach it.
- Everything respects `prefers-reduced-motion`: the timeline shows fully drawn, and nothing animates.

## The app on the page

The live demo is the real app in a frame, with a 1px ink border and square corners. The window has its own repo tabs in its title bar. The feature switcher ("Explore a codebase", "Ask Claude Code", …) is a separate, centred control 20px above the window, so it never reads as a second row of window tabs. The selected tab is a sliding ink pill.
