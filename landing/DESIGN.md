# Landing page design

The page at `/`: `app/page.tsx`, its parts in `components/v2/`, all of its styles in `components/v2/v2.module.css`, and its pictures in `public/v2/`. The old Bluprint page lives at `/v1` (`app/v1/page.tsx`, `components/landing-*`). It is kept to go back to, and follows none of this.

## The idea

**Bluprint is a technical drawing of your code, so the page is a drawing too.** It is one sheet of white paper lying on a blueprint desk, and everything on it is drawn in one ink: cobalt. That covers the lettering, the labels, the rules, the grids and the photographs.

Three things make it feel like a drawing rather than a web page:

1. **One ink.** There is no second colour, no gradient and no shadow except a flat offset. The page is always light, whatever theme the reader picked in the app.
2. **Notes on a sheet.** Small monospace labels, bracketed headings, thin boxes with a × in the corner, hairline grids, and a word boxed with a tag hanging off it, like an engineer's pencil marks.
3. **Pictures redrawn in the ink.** Every photo is dithered into four shades of the ink, so it reads as part of the drawing, not pasted on.

It should feel light: thin lines, light type and plenty of white. When something feels heavy, take a border or a fill away. Don't add one.

## Colour

Every colour is a token on `.page`. Use the tokens and never a raw value.

| Token | Value | Use |
| --- | --- | --- |
| `--desk` | `#1a2fa0` | The blueprint around the sheet |
| `--desk-line` | white at 10% | The desk's 64px grid |
| `--paper` | `#fcfdff` | The sheet |
| `--low` | `#eef1fd` | Hover fill on a ghost button |
| `--ink` | `#2438c8` | Text, borders, fills: the one colour |
| `--muted` | `#4a5bd2` | Secondary text |
| `--faint` | `#8995e2` | The `$` before the install command, and little else |
| `--line` | ink at 18% | Hairlines, grids on the sheet, the dotted guide line |
| `--strong` | ink at 50% | Borders on small boxes and around pictures |
| `--grid` | ink at 7% | The faint grid behind How it works |
| `--on-ink` | `#fcfdff` | Text on an ink fill |
| `--blush` | `#f4a3b4` | The cheeks in the logo, and nowhere else |
| `--code-*` | ink fill, pale text | Code blocks and the drawn terminal: a solid ink panel |

A selected or hovered control fills with ink, and its text turns `--on-ink`. Text selection is the same.

## Type

| Role | Face | How |
| --- | --- | --- |
| Lettering (`--display`) | Zilla Slab 300 | The cover, headings, names in the timeline, quotes. Line height about 1, letter-spacing `-0.012em` to `-0.022em`. |
| Labels (`--mono`) | IBM Plex Mono | Nav, buttons, tabs, years, captions and notes. 10–13px, uppercase, letter-spacing `0.02em`–`0.06em`. |
| Reading (`--font-body`) | IBM Plex Sans | Paragraphs: 14–16px, line height 1.5. |

Sizes scale with `clamp()`. The cover is `clamp(46px, 5.5vw, 92px)` and section headings are around `clamp(32px, 4vw, 60px)`. Lettering stays light (300). Weight comes from size, not from bold.

Headings are short sentences in sentence case, ending in a full stop: "People used to write every line." / "And now there's you." The cover is the only place lettering runs mixed case at full size with pictures in it.

## The sheet's vocabulary

- **Bracket labels**: `[ HOW WE GOT HERE ]`, mono, uppercase, 12px, in ink. Use `.bracket`, or `.eyebrow`, which adds the brackets itself.
- **Boxed word**: a phrase in a thin `--strong` box with a small mono tag hanging off its bottom edge (`.boxed`), as on the cover: "you didn't write." tagged "written by an agent".
- **Note card**: a small `--strong` box of mono uppercase text, sometimes with a tiny drawn diagram (`.note`).
- **Window**: a picture in a `--strong` frame with a mono caption bar and a × (`.window`).
- **Ring**: a word circled in a pill outline (`.ring2`), used once, on "checked".
- **The spark**: a four-pointed star (`Spark` in `landing-cover.tsx`), the sheet's one mark. Use it rarely.
- **Buttons and nav links**: square corners, a 1px ink or `--strong` border, mono uppercase, and an ink fill on hover. Nothing on the sheet is rounded except the sheet itself (6px) and the ring.
- **Title block**: the footer is a drawing's title block (`.end`), with Title, Source, Site, Scale ("Repo to line") and Sheet.

## Pictures

Every picture is drawn in these four shades and nothing else, with Floyd–Steinberg dithering:

```
#2437c7  ink
#7786e0
#c3caf3
#fbfdff  paper
```

Recipe (Pillow): grey → `autocontrast(cutoff=1)` → a gamma lift (`v ** 0.6–0.8`) so faces don't go muddy → `ImageOps.colorize(black=ink, mid=#7786e0, white=paper)` → `quantize` to those four with `dither=FLOYDSTEINBERG`. Save as an 8-bit PNG. ffmpeg's `paletteuse=dither=floyd_steinberg` with the same four colours gives the same look.

There are two kinds:

1. **Framed plates**: the photo in a 1px `--strong` frame, sometimes tilted 1–2°. These are the timeline portraits (`tl-*.png`, 4:5) and the pictures set in the cover's lines of text (`.inline`). The inline ones are sized in `em` so they sit in the line; set `--r` to the photo's width ÷ height so nothing is cropped.
2. **Cutouts**: the subject with no background, so it fades into the sheet. Make the paper shade transparent after dithering, flood-fill the light background in from the edges, and fade the bottom out. These are Adam's hand on the cover (`hand.png`) and Uncle Sam behind "And now there's you." (`uncle-sam-cutout.png`). Keep anything pale that belongs to the subject, like Uncle Sam's hat, out of the fill.

**Pick pictures from the history of programming**: people who wrote code by hand, the machines they wrote it for, and the instruments of looking closely (a microscope, a reaching hand). Prefer public domain (Wikimedia Commons). Name every picture in the credits line under the sheet, with its licence if it isn't public domain, and take a picture's credit out when the picture goes.

When you replace a picture, give the file a new name. Browsers cache by name.

## The page, top to bottom

1. **Nav.** The logo (the app icon's drawing, without its paper) and the wordmark in mono on the left, the section links as small boxed tags in the middle, and Install as an ink button on the right. It sticks to the top in paper at 88% with a blur, and gains a hairline once the page scrolls. It has no theme switch.
2. **Cover** (`landing-cover.tsx`). One screen tall. On the left is a hairline grid with a note card, Adam's hand reaching right, a small ENIAC window and a wireframe globe; a line runs from the fingertip toward the claim. On the right is the claim in light slab: "Understand ✦ the code [Hamilton] you didn't write." Under it is one sentence on what Bluprint does, with two more pictures set in it, then the install line. "Scroll to open the app ↓" sits at the bottom.
3. **How we got here** (`landing-evolution.tsx`). One wavy line drawn down the sheet as the reader scrolls, through three people, each a tilted plate with a year, a name and one line: Lovelace (1843), Turing (1936) and Karpathy (2025, who coined vibe coding). Keep it to three. The point is a glance, not a history lesson.
4. **And now there's you.** Uncle Sam points out at the reader from behind the heading. Then comes the live app, which zooms up out of the page as the reader reaches it.
5. **The rest**: quotes, why, how it works, beside your agent, your repo, questions, the close and the title block. They are all drawn with the same vocabulary: ink-bar panels, hairline rules, mono labels and light slab headings.

## The timeline line

- Stops are placed in the drawing's own units (1000 wide, `H` tall) in `STOPS`, alternating left and right, 350 units apart.
- A dotted `--line` ghost shows the whole path. The ink line is a copy of the same path, clipped from the bottom (`clip-path: inset(...)` driven by `--p`), so it draws down as the reader scrolls. Its tip stays at 60% of the screen's height.
- A stop is faint (25% opacity) until the line reaches it, then fades and settles in.
- The line fades out at its bottom, so it never draws over the picture behind the next heading.

## Layout

- The sheet is inset from the window by `--edge` (8–22px) and scrolls itself, not the window. Listen for scroll on `.page`, never on `window`.
- Content is at most 1480px wide, with a `--gutter` of 16–44px at the sides. Sections are `--gap` (96–160px) apart.
- Breakpoints are at 1180, 1080, 900, 700, 600 and 420px. Check at phone width (390px) after any layout change. On phones the cover stacks with the claim first, and the timeline's captions go under their pictures.

## Motion

Motion is for two moments only: the line drawing down, and the app arriving. Everything else stays still.

- The easing is always `--ease` (`cubic-bezier(0.22, 1, 0.36, 1)`).
- Scroll-tied effects use `animation-timeline: view()` where they can, and a scroll listener on `.page` where they need numbers, as the timeline does.
- The app's heading and frame zoom up (from 82% scale, 80px lower, transparent) as they enter.
- `prefers-reduced-motion`: the line shows fully drawn, every stop is on, and nothing zooms or fades.

## The app on the page

The live demo is the real app in a frame, always light. The frame has a 1px ink border, square corners and an ink title bar with the repositories as tabs. The feature switcher ("Explore a codebase", "Ask Claude Code", …) is a separate, centred control above the window, and its selected tab is a sliding ink pill.

## Don't

- Don't add a second colour, a gradient, a blurred shadow or a dark mode.
- Don't use a photograph in its own colours, or a picture that isn't dithered into the four shades.
- Don't use bold lettering. Use a size change instead.
- Don't put rounded corners on boxes and buttons.
- Don't add scattered fade-ins. Keep to the two motion moments.
- Don't use cards in a rigid row for the history. It is one line through a few people.
