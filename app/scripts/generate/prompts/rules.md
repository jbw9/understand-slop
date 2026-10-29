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
- **The top level is a level too.** Above the roots sits the repository itself: a short detail and one diagram whose boxes open the roots, drawn after the roots are written, with an arrow only where the code goes from one root to another.
- **Each level names its parts and never shows their contents.** Children are chapters: each one answers one question about its parent.
- **Two kinds of level, and nothing else.**
  - A **level with parts** is a picture: one `diagram` whose boxes open every child, plus at most two other blocks. Each part the reader sees on it leads down.
  - A **leaf** is one piece of code: one function, handler, component, screen, query or config, the thing a reader would open to change it. Its `code` is that thing's own lines: at most 3 ranges, from at most 2 files, about 200 lines in all. It has no `diagram` (a diagram names parts, and a leaf has none) and 1–2 blocks that explain the lines. The first is picked by what the code is, so the same kind of code reads the same way in every map:
    - a component, page or screen that draws something → `screen`
    - a function, handler or action that does something → `flow`, its steps in order
    - code whose point is talking to another system (an API, the database, a queue) → `sequence`
    - a type, model, table definition or config → `schema` (its fields) or `table` (its values)
    - a constant set of options or rules → `table`
    Add a second block only when it shows something the first cannot: the stored value a `flow` writes as an `example`, say.
  - **Every step of a leaf's `flow` and every message of its `sequence` cites the lines it happens on** in `at`, as `file:start-end`: the few lines (at most 40) where that one step is done, not the whole function. The reader clicks a step to see exactly those lines, so the code arrives attached to the sentence that explains it. They are usually inside the leaf's own `code`; a step that happens in code another part explains (the other side of a race, say) cites that code.
  - The reader sees code only on a leaf; above it, `code` refs back the claims but are not shown. So when a node would cite several separate things (five route handlers, a form and the endpoint it posts to, a writer and a reader), each is its own leaf, and the node is a level whose diagram opens them. Never stop at a node that summarises several parts and hands over all their code at once.
- **Depth belongs to the branch.**
  - Most roots go 2–3 levels: root → parts → the piece of code each part is.
  - Go one level deeper only when a part is itself several pieces of code. Don't pad a branch with a level that says nothing new.
- **Breadth:** 3–6 children per node is typical, never more than about 8.

## What a level shows

The level itself, `node` open:

1. `title`: the thing's own name in 1–4 words, Title Case, everyday words a newcomer would use. Good: "Organisation Sign-Up", "Interest Categories", "Choosing The Home Screen". Bad: nicknames such as "Org Wizard" or "Role Lookup", code identifiers such as `rsvp` or `fetchAllEvents`, and file paths. Code identifiers belong in `detail` in backticks.
2. `sub`: at most 8 words saying what this IS, plainly: "Add a repo and watch it get mapped". Not a list of its parts (the children already name them) and never a file path.
3. `detail`: **at most two sentences and at most 40 words.** The one thing to know before looking at the pictures. Everything else is a block.
4. `anatomy`: blocks drawn as the thing they describe. Use whichever fit; a level with parts has its diagram and at most two more, a leaf at most two and no diagram:
   - A block's `caption` is a heading over it: **at most 5 words**, naming what the picture shows, not a sentence explaining it. Good: "How the roots connect", "Who writes the guest list", "Dietary options". Bad: "The seven roots and how the code connects them", "Calls made, from opening the list to one check-in tap". What the picture means belongs in `detail`; an `example` may add " — " and a few words on which example it is ("events.rsvp — two students").
   - `diagram`: how the pieces connect. This is the main picture of a level.
     - Boxes sit on a grid (`col` left to right, `row` top to bottom, from 0). Never put two boxes in one cell. Keep it to about 5 columns and about 10 boxes.
     - A box is a thing at runtime ("users table", "Login screen", "Stripe webhook"). Its `sub` is a few words (about 25 characters at most): "row with this id", not a sentence — a long sub widens its whole column.
     - The checker lays the picture out as the page will and rejects one that is too wide to read, has a label drawn on another label or a box, or a line through a box it does not connect. Fix those by rearranging: put boxes an arrow joins next to each other, use more rows and fewer columns, and do not run an arrow across a box in between.
     - A box that a child explains carries `opens: "<child id>"`, which makes the picture the way down. Every child has a box that opens it.
     - A box with no `opens` is scenery: something this level does not explain — the user, a browser, a database table, an outside service, or code another root explains. A box for code in this root that has no child is a part the reader cannot reach: give it a child, or leave it out.
   - `sequence`: who talks to whom, in order. Every `from`/`to` must be one of `actors`.
   - `table`: real values, such as the categories, the env vars, the fields a form sends, the routes. Every row must have exactly as many cells as `columns`.
   - `screen`: what a user sees on one screen, as `items` top to bottom, read from the JSX or template. No `shot`.
     - `device` is what it runs on: `phone` for a mobile app's screen, `web` for a page in a browser. The brief says which this repo has; never default to `phone`.
     - A `web` screen gives `route`, the URL path it is at (`/settings/billing`, `/invite/[token]`), when the code shows it — a URL, never a file path.
     - An item's `note` is drawn beside the screen with a line to the item: what it does or holds, in a few words ("opens the wizard", "must be 8+ characters"). Give a note only to the items worth pointing at, about 3–6; an item that explains itself gets none.
   - `example`: what a stored value or payload looks like. It is labelled as an example, synthesized from the code.
   - **A file or record is shown by what is in it, never by its name alone.** When a level names files it writes or reads (`map.json`, `.env`, a log), or stored records, give each one that matters a `schema` (its fields, for structured data: JSON, a table, a typed config) or an `example` (for text: markdown, logs, CSV). A list of names with a line each tells the reader only that the files exist.
   - `flow` (numbered steps), `facts` (label/value pairs), `chips` (a closed set), `map` (in → out rules), `schema` (table columns), `routes` (HTTP routes).
5. `issues`: real problems a developer should know before touching this, shown as "Watch out".
   - Each is a few-word title, then 1–3 sentences on what goes wrong, for whom, and when, with `where` as `file:line`.
   - Only report what the code shows: a race, an unchecked input, a missing auth check, a dead path, a secret in source. Never report style nits.
   - An issue is something that goes wrong: wrong behaviour, lost data, a security hole, a failure that misleads whoever hits it. Behaviour the code means to have — a documented rule, a deliberate error for misuse, a language's standard behaviour, a typing choice — is not an issue, however surprising; if a reader must know it, say it in `detail`.
   - No issue is better than a weak one. Mature code often has none on most levels; never add one to fill the section.
   - Don't quote secrets. Name the line instead.
6. `children`: its parts, and `edges` among them only when `group.ordering` is `sequence`.

## The plain-words layer: `explain`

Everything above is terse on purpose, for a reader who knows the field. Every node also has an `explain` for one who does not: someone new to this project and to its domain, who has never heard of a quorum or a webhook. The page shows it under an Explain toggle, so it never gets in the way of a reader who already knows.

- `body`: 2–4 short paragraphs, a blank line between them, at most 200 words (a leaf's is often 40–100).
  - Start from the problem: what would go wrong without this, or what it is for. Then how it works, in everyday words.
  - Define each word of the project or its field the first time it appears, in the sentence that uses it: "the *leader* — the one controller allowed to accept changes". Don't assume the parent's explainer was read.
  - Be concrete: a small case with names and numbers ("three controllers; two vote for C1, so C1 leads epoch 7") teaches more than a definition.
  - An analogy only when it is exact, and say where it stops holding. No code identifiers unless you say what they are.
  - Don't restate `detail`; say what someone needs before `detail` makes sense.
- `blocks`: 0–2 pictures, each chosen for what it teaches, case by case. Add one only when it shows what the prose cannot:
  - how things relate, or where this sits in the larger system → `diagram`. It draws the idea, not the code: its boxes open nothing and its arrows need no `at`.
  - back and forth between parties over time (who asks, who answers, what happens when one is late) → `sequence`
  - what the data looks like → `example`
  - comparing cases, states or options side by side → `table`
  - a process in order → `flow`
  A level with parts often wants one picture of the idea; most leaves need none, because their own block already shows the steps. A leaf's explain picture is never the same kind as one of its own blocks.

## Things you may not use

- `shape.kind: "figure"`. Figures are hand-drawn. Use `shape: {kind: "marks", ids: [...]}` only with the ids you are given, or `{kind: "count", value, unit}` where a magnitude is the point, or no shape.
- `screen.shot` and `source` blocks. Code is read live through `code` refs.
- `under` on rows. A deeper part is a real child node, not a row that unfolds.
- File paths in any `title` or `sub`. No exceptions.
- On a child of a node (not a diagram box): `fromRow`, `ghost`, or `col`/`row` other than the child's index (`col: 0`, `row: i`). Diagram boxes keep their own grid `col`/`row`.
