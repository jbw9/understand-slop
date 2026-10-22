# What a map is

A map explains a codebase to someone who did not write it. They start broad, open one part, go deeper, and can always reach the exact lines. Reading the code should be the last resort. Every level must answer a question its parent could not.

The reader is a developer who has to *explain* this system under questioning: what calls what, where data is written and read, and what breaks. A picture that looks plausible but cannot survive a follow-up question is worse than no picture.

## Honesty, which overrides everything else

- **Three states, never two.** Every node is `derived`, `partial` or `inferred`.
  - `derived`: you read it in the code you were given.
  - `partial`: you found it, but part of the answer is not in this repo (an external service, a database schema that isn't checked in, config injected at deploy time).
  - `inferred`: a judgement from naming or layout.
  - Whenever the state is not `derived`, `unsure` says why in plain words.
  - Missing analysis must never look like confident empty space.
- **Every claim cites real lines.** Every node has `code` refs: file plus 1-indexed inclusive line range, with a plain label saying what those lines do. Cite the lines that prove the node's `detail`, not the file header.
- **Every arrow is a real path.** Draw an arrow in a `diagram` only where the code really goes from one thing to the other: a call, a redirect, a write, a read, a navigation. Give its `at` as `file:line` where that happens. Its `label` is a few words (at most 24 characters): "tap", "reads rsvp", "redirects". An arrow you cannot cite is an arrow you must not draw. A dead end or broken path is drawn with `tone: "warn"`, not left out.
- **Order is a claim.** `group: {ordering: "sequence"}` only when the children really happen in that order for one run. Otherwise use `set` with a `note` saying why they belong together.
- **Don't invent.** If the repo doesn't say, the map doesn't say. Name the gap in `unsure` or as an issue.

## Shape of the tree

- **Roots are what someone does with the product**, cut by features and journeys, not by architecture layers. A library's "someone" is the caller ("Making A Request", "Retrying On Failure"). Layers like "API", "Database" or "Utils" say nothing specific about this product.
- **Each level names its parts and never shows their contents.** Children are chapters: each one answers one question about its parent.
- **Depth belongs to the branch.**
  - Most roots go 2–3 levels: root → parts → the mechanism or data one part turns on.
  - Stop when there is nothing more to explain.
  - Don't pad a branch to reach code (the code is always one click away in the drawer). Don't stop short of the interesting part either.
- **Breadth:** 3–6 children per node is typical, never more than about 8.

## What a level shows

The level itself, `node` open:

1. `title`: the thing's own name in 1–4 words, Title Case, everyday words a newcomer would use. Good: "Organisation Sign-Up", "Interest Categories", "Choosing The Home Screen". Bad: nicknames such as "Org Wizard" or "Role Lookup", code identifiers such as `rsvp` or `fetchAllEvents`, and file paths. Code identifiers belong in `detail` in backticks.
2. `sub`: one plain line saying what this IS. Never a file path.
3. `detail`: **at most two sentences and at most 40 words.** The one thing to know before looking at the pictures. Everything else is a block.
4. `anatomy`: blocks drawn as the thing they describe. Use whichever fit; most levels have 1–3:
   - `diagram`: how the pieces connect. This is the main picture of a level.
     - Boxes sit on a grid (`col` left to right, `row` top to bottom, from 0). Never put two boxes in one cell. Keep it to about 5 columns and about 10 boxes.
     - A box is a thing at runtime ("users table", "Login screen", "Stripe webhook"). Its `sub` is a few words (about 25 characters at most): "row with this id", not a sentence — a long sub widens its whole column.
     - The checker lays the picture out as the page will and rejects one that is too wide to read, has a label drawn on another label or a box, or a line through a box it does not connect. Fix those by rearranging: put boxes an arrow joins next to each other, use more rows and fewer columns, and do not run an arrow across a box in between.
     - A box that a child explains carries `opens: "<child id>"`, which makes the picture the way down. Link every child that has a box. Boxes with nothing to open are scenery.
   - `sequence`: who talks to whom, in order. Every `from`/`to` must be one of `actors`.
   - `table`: real values, such as the categories, the env vars, the fields a form sends, the routes. Every row must have exactly as many cells as `columns`.
   - `screen`: what a user sees on one screen, as `items` top to bottom, read from the JSX or template. No `shot`.
   - `example`: what a stored value or payload looks like. It is labelled as an example, synthesized from the code.
   - `flow` (numbered steps), `facts` (label/value pairs), `chips` (a closed set), `map` (in → out rules), `schema` (table columns), `routes` (HTTP routes).
5. `issues`: real problems a developer should know before touching this, shown as "Watch out".
   - Each is a few-word title, then 1–3 sentences on what goes wrong, for whom, and when, with `where` as `file:line`.
   - Only report what the code shows: a race, an unchecked input, a missing auth check, a dead path, a secret in source. Never report style nits.
   - An issue is something that goes wrong: wrong behaviour, lost data, a security hole, a failure that misleads whoever hits it. Behaviour the code means to have — a documented rule, a deliberate error for misuse, a language's standard behaviour, a typing choice — is not an issue, however surprising; if a reader must know it, say it in `detail`.
   - No issue is better than a weak one. Mature code often has none on most levels; never add one to fill the section.
   - Don't quote secrets. Name the line instead.
6. `children`: its parts, and `edges` among them only when `group.ordering` is `sequence`.

## Things you may not use

- `shape.kind: "figure"`. Figures are hand-drawn. Use `shape: {kind: "marks", ids: [...]}` only with the ids you are given, or `{kind: "count", value, unit}` where a magnitude is the point, or no shape.
- `screen.shot` and `source` blocks. Code is read live through `code` refs.
- `under` on rows. A deeper part is a real child node, not a row that unfolds.
- File paths in any `title` or `sub`. No exceptions.
- `fromRow`, `ghost`, `col`/`row` other than the child's index (`col: 0`, `row: i`).
