# Decisions

Every non-obvious choice, the option it beat, the cost accepted, and where it
breaks at scale. Recorded as made.

---

## D1 — Not a zoomable architecture map

**Chose:** question-answering over a resolved graph, at function granularity.
**Beat:** an interactive zoomable map with semantic drill-down (the original idea).

CodeSee built almost exactly that — semantic-zoom codebase maps plus PR review
maps, VC-funded, strong founder. GitKraken acquired it May 2024 and **sunset the
map**, keeping the review piece. Sourcetrail: archived 2021, and a competitor's
diagnosis in its HN thread is the category epitaph — call-graph visualizers are
*"the sort of thing that you would need only once or every once in a while."*
Greptile launched as Onboard AI doing codebase onboarding, pivoted to PR review,
and that pivot raised a $25M Series A.

Kuhn et al. put a spatial code map *inside Eclipse* — removing the "not in my IDE"
excuse — and developers *"rarely used the map for direct navigation"* and found the
base layout *"surprising and often confusing."* What they did use it for was
decorating search results and call graphs they were already running.

**Cost accepted:** no striking screenshot, so no viral launch moment. Fine — the
goal is a working tool, not a business.
**Breaks at scale:** if a map is ever added, node-link + Sugiyama layering for
paths (never force-directed, never a matrix for path-following), and
`DOI = importance − distance-from-focus` to serve both broad and deep entry.

---

## D2 — TypeScript/JavaScript only

**Chose:** TS compiler API resolution, TS/JS targets only.
**Beat:** multi-language via tree-sitter tags + name matching.

Measured on six repos, ~106k LOC. Name-matched edge precision:

| Repo | Lang | Strict precision |
|---|---|---|
| react-router | TS | 45.6% |
| vue-core | TS | 40.6% |
| flask | Py | 31.4% |
| axios | JS | 28.5% |
| requests | Py | 24.6% |
| httpx | Py | 19.8% |

The majority of edges are wrong in every repo. Every "name defined in >5 places"
bucket scored **0.0%** — `get` is defined in 11 vue-core files, `__init__` in 15
flask files. Python tops out at 43.8% even fully filtered.

Parsing import statements directly: **98–100%** precise, verified by re-deriving
specifiers textually from source.

This is the same approach Aider's repomap uses, and correctly so — there a wrong
edge costs an LLM almost nothing. It is not a correctness substrate.

**Cost accepted:** "works on any repo" is a promise we cannot keep, and won't make.
**Breaks at scale:** adding a language means adding a real resolver for it, not a
grammar. Budget it as a project, not a config entry.

---

## D3 — Three states, not two

**Chose:** `derived` / `partial` / `inferred`.
**Beat:** a binary derived-vs-inferred mark.

Under-approximation does not look uncertain on screen — it looks like clean,
confident, empty space. PyCG reports 99.2% precision but **69.9% recall**: three in
ten real call edges simply missing. A general-purpose JS analyzer measured 48%
recall and failed outright on 5 of 12 applications. A user reading "nothing calls
this function" cannot tell a finding from a blind spot.

The field's own standard, from the soundiness manifesto (CACM 2015): *"we are not
aware of a single realistic whole-program analysis tool that does not purposely
make unsound choices"* — so identify the nature and extent of your unsoundness
rather than letting it lurk in the shadows.

Prior art for the interaction: `git blame`'s `blame.markIgnoredLines` and
`markUnblamableLines` mark uncertain attribution with `?` and `*` rather than
presenting a confident wrong answer.

**Cost accepted:** output is noisier and less impressive than a clean diagram.
**Breaks at scale:** if `partial` counts swamp `derived` ones on a given repo, the
honest response is to say the repo is not analyzable, not to hide the marks.

---

## D4 — No quiz mechanic

**Chose:** at most one *offered* prediction at a moment of consequence. Probably
none in v1.
**Beat:** interrogating the user to force retrieval practice.

A developer built spaced repetition for code: ~4,000 users completed one session,
**fewer than 20 returned** — 0.5%. exbrain.app shipped codebase-flashcards in 2019
and died at two points on HN. The testing effect also *shrinks* as material
complexity rises (van Gog & Sweller), and transfer is near zero: **g=0.58** for the
specific thing tested, **g=0.04** for anything else. Benefits concentrate in
novices; expertise reversal predicts active harm for experts under time pressure.

The design brief, from an Anki user: *"I like that it doesn't nag me."* Anki is the
most successful retrieval tool ever built for adults and it is strictly pull-based.

**Cost accepted:** gives up the strongest mechanism known for converting reading
into durable understanding (verification loops predict comprehension at r=0.96).
**Breaks at scale:** the one version that would justify itself is a *correctness
gate* that catches real defects at merge time — that survives annoyance the way CI
and linters do, and doesn't depend on the learning-science literature at all.

---

## D5 — Capture inputs, never the model's self-explanation

**Chose:** defer intent capture; when built, record prompt, constraints, pinned
files, and human-named alternatives only.
**Beat:** persisting the AI's stated rationale from the generating session.

Anthropic's own research: Claude 3.7 Sonnet mentioned hints it actually used
**25%** of the time; in reward-hacking setups models admitted it **<2%** of the
time; larger models are *less* faithful. Stated rationale is a plausible narrative
generated alongside the code, not a causal account of it.

This sits against a genuine finding (CMU 2026) that AI code *"arrives without a
design rationale, since no human author formed the intent and there is no one to
ask"* — so mining cannot work and capture is the only option. Both are true. The
resolution: capture what was *asked*, which is a fact. Never what the model says it
was *thinking*, which is confabulation.

SpecStory already occupies the raw-capture niche; ~20 session exporters sit at 0–5
stars each. That is many attempts and no winner.

**Cost accepted:** the single most-reported hard question — *"Why wasn't it done
this other way?"* (15 reports) — gets answered "no recorded rationale found" most
of the time.
**Breaks at scale:** that honest negative is only valuable if it is *fast*. If it
takes 30s to say "I don't know," nobody asks twice.

---

## D7 — Camera values are plain MotionValues, never `useSpring`

**Chose:** `useMotionValue` for pan/zoom state, with `animate(value, target, spring)`
for deliberate camera moves.
**Beat:** `useSpring(OVERVIEW.x, {...})`, which is what the canvas shipped with.

`useSpring(80, {...})` does **not** create a settable spring. It is
`useFollowValue(source, {type:"spring"})`, which calls
`attachFollow(value, source, options)` — installing a passive effect that springs
the value toward `source`. When `source` is a plain number that number is
constant forever, so every `.set()` is routed through the passive effect and
re-targeted back at the constant. `.jump()` bypasses it (`stopPassiveEffect()`),
which is why it works.

The correlation across seven call sites was exact: every `set()` site was broken
(drill-in framing, the `0` key, `drillOut` returning to overview) and every
`jump()` site worked (mount, wheel pan, drag pan, zoom). The symptom users saw
was "clicking a card renders nothing" — the branch opened correctly and the
camera never moved to it.

Found only by instrumenting the running code. Five hypotheses formed by reading
the source were each killed by measurement: a stale closure, a render race, a
poisoned NaN spring, an early return on a null ref, and a broken build. The
library source (`motion-dom/dist/es/value/index.mjs`, `follow-value.mjs`) named
the cause in ten lines once read.

**Cost accepted:** camera motion is now explicit at every call site — a move
that forgets `animate()` cuts instead of glides, and nothing warns you.
**Breaks at scale:** if pan/zoom ever needs to interrupt an in-flight camera
animation, `animate()` handles are currently discarded; they would need holding
and cancelling.

---

## D6 — Build fresh, steal from CodeBoarding

**Chose:** new tool; borrow CodeBoarding's grounding discipline (MIT).
**Beat:** forking `unslop-xyz/noodles`, or contributing to CodeBoarding.

noodles is abandoned — zero commits in six months; an outside contributor's
234-line fix has sat since August with zero comments despite being mergeable. Its
core is bare-name matching: run against `psf/requests` (19 files) it produced 672
nodes and **209 orphans, 31% of all functions**, with `__init__` resolving to 24
candidates. Those orphans look like findings; they are analysis failures. The part
we would have to discard is the part that determines output quality.

CodeBoarding is healthy (26 contributors, weekly releases) and its grounding is
real — of 126 relations in its checked-in output, **126 static-backed, 0 LLM-only**;
LLM edges without a static counterpart are silently discarded. But its open issues
are dominated by LSP performance work (a mid-size Java repo took >2h, CPU-bound),
and it abstracts *up* to components. Contributing means working their roadmap.

Two ideas taken wholesale: sample the planner **three times and keep the medoid**
(*"a single draw makes the first run's luck the architecture"*), and preserve prior
wording when backing edges are unmoved so a one-line diff doesn't relabel
everything.

**Cost accepted:** starting from zero against a team shipping weekly.
**Breaks at scale:** CodeBoarding is already moving toward "keep architecture
visible while agents code." The defensible edge is granularity and speed, not a
better architecture diagram.

---

## D8 — Deep drill framing is a known limitation, not a solved problem

**Chose:** ship levels 3+ framed imperfectly, and say so.
**Beat:** continuing to iterate on the framing maths.

Opening a subtree past level 2 leaves the opened card's bottom past the
viewport edge: measured, opened card at y:520 with bottom 1049 against an 861px
viewport, deepest descendant at y:1057.

Twelve attempts. The box shape was changed four times (root position, card
height, measured subtree column, viewport-capped height), the centring rule was
replaced with a top anchor, and the anchor reference was moved from the column
to the card. The only change that ever moved a pixel was cancelling in-flight
animations (D7's noted failure mode): `ty` went from pinned-at-62 to -91, and
the card rose 153px. Every other variant produced byte-identical numbers.

Two things make further iteration unreliable rather than merely slow. A subtree
runs 950-1450px against an ~860px viewport, so no anchor shows all of it and
fitting would need ~0.6 scale, under the READ_MIN floor - the content would be
on screen and unreadable. And measurements taken milliseconds apart during the
camera settle disagree: one probe read the deepest card at y:1057 and the next
at y:-28.

**Cost accepted:** the deepest level needs a scroll or a drag to read in full.
Levels 0-2, which is where most reading happens, frame correctly.
**Downgraded by D11:** cards are draggable now, so "needs a scroll or a drag"
is an affordance the product actually offers rather than a workaround it assumed.
The framing is still wrong; it is merely recoverable by hand.
**Breaks at scale:** the real fix is probably structural - a subtree that
overflows the viewport wants its own scroll container, or levels past 2 want to
replace the view rather than nest inside it. Both are larger than a camera
tweak and neither should be attempted without deciding what drilling four deep
is supposed to feel like.

---

## D9 — A row with depth becomes a node, and only the one you clicked opens

**Chose:** every row carrying `under` becomes a real child `Node`
(`withRowChildren`), marked `fromRow`, and `Branch` renders a row child ONLY
when the path names it.
**Beat:** inline expansion under the row (built first), a free-standing detail
card beside the level (built second), and rendering all row children as a
normal level (built third).

Three rejected designs, each a variation on the same mistake: a second way to go
deeper running alongside the drill the product already had. Cards drilled; rows
did something that looked similar and behaved differently, so camera framing,
Escape, `drillOut`, out-of-scope fading and wires all had to be re-implemented
or went missing.

The measured failure of the side-card version: clicking `image` put the row at
**x = −432**, off the left edge, while its card sat at x=467 — the camera framed
the card alone, so the question left the screen exactly when the answer arrived.
The card also opened at x=964, past `ask-mode` (504–844), so its connector wire
crossed an unrelated card.

**The `fromRow` filter is the part that matters.** As plain children, six deep
rows produced six sibling cards on one click, the sixth sliced off the screen
edge. That is the wall of context this tool exists to delete: you asked what
happens to an image and got PDFs, Word docs, plain text and URLs as well.
Authored siblings are a set you are meant to compare ("What you can send" beside
"Subject and mode"); row children are answers to six separate questions. Same
data structure, different meaning, so `Branch` filters on `fromRow`.

The owner card keeps rendering its anatomy while a row child is open
(`detail={!root && (!showChildren || rowOpened)}`), so the row list stays on
screen as the menu you chose from, with the chosen row lit.

**Four bugs found only by driving the running app**, every one of which made the
click a silent no-op:
1. `drillInto` guarded on `node.children?.length === 0`. A row node holds its
   content in `anatomy` and has no children, so every row click returned before
   `setPath`.
2. The deep-level framing effect had the SAME children-only guard, missed on the
   first pass — so even once the path moved, the camera did not, and the level
   opened at y:578 running to y:1304 against a 900px viewport.
3. `onOpenRow` built the path as `[...path, id]`, but a row's owner is a card in
   the level on screen, not the deepest path segment — so it looked up
   `["asking","ask-input:image"]`, which does not exist, and `nodeAt` returned
   null.
4. The row click bubbled to the card's own handler. Instrumented order was
   `ROW click → CARD click`: the row opened the level and the card collapsed it
   on the same event. This is why calling the handler directly worked and every
   genuine pointer click did nothing — a difference no amount of reading the
   source would have shown.

**Cost accepted:** the camera frames the opened level, which pushes the owner
card partly above the viewport (measured y:−279). You can see the row list by
panning up, but it is not in view at rest.
**Breaks at scale:** `deepRows` only understands `map` and `flow` blocks. A deep
row inside `schema`, `bars`, `chips` or `routes` is silently ignored — it renders
a caret and opens nothing, which is the worst failure mode available.

## D11 — Cards drag by offset, and only the offset moves

**Chose:** motion's `drag` on a wrapper holding the card *and* its subtree, with
the resulting offset kept in a ref keyed by node id.
**Beat:** absolute coordinates for child cards; a hand-rolled pointer hook; a
bumped `reflowKey`/`version` to make the wires follow; persisting layout.

Root cards have world coordinates from `PLACE`. Children have none — they are
flex-flowed, and the camera frames a deep level by measuring the column that
contains them (`canvas.tsx`, the post-commit framing effect). Giving children
coordinates would have re-opened exactly the maths D8 records twelve failed
attempts at, so the offset is layered **over** layout and never replaces it.

Three things about the gesture that are not obvious:

**The scale correction is a config, not arithmetic at the call site.** Motion's
drag adds a raw pointer delta onto the element's own transform, so inside the
scaled world a card at 0.5x travels twice as far as the cursor — the same
double-scaling the wire layer corrects when it measures. `transformPagePoint` on
a `MotionConfig` is the supported hook: PanSession runs every point through it
before differencing them, and re-runs it per frame, so zooming mid-drag stays
correct. Only the scale is divided out; pan offsets cancel in the difference.

**`dragListener={false}` costs more than it looks.** Drag is started by hand
from the card so anatomy rows keep their own press. But framer-motion guards its
*whole* draggable setup block on that flag — including the `user-select: none`
it would otherwise apply — so a press on a card title drag-selected across the
board until that was restored by hand. The `source` block needed the opposite
treatment: it renders the verbatim lines the map exists to land you on, so it is
marked `data-copy` and opts out of the drag entirely.

**The re-measure has to stay inside the wire layer.** Dragging writes a
transform straight to the DOM, so no ref, scroll or resize fires and the wires
would stay put. Routing that through Canvas state — a bumped `version` or
`reflowKey` — re-renders every Branch, NodeCard and AnatomyView on the board
sixty times a second to move one card, and nothing is memoised. `WireLayer`
hands its own rAF-coalesced schedule out through a ref instead. Panning, for
comparison, costs zero re-renders: it writes motion values and never touches
React state.

Two things broke the moment a card could move, both found by reading rather than
running, and both invisible to `tsc`:

1. `drillInto` frames a root from `PLACE`, which says where layout *put* it, not
   where it *is*. Drag a domain 400px right, click it, and the camera glided to
   the empty square it came from. Every deeper level is framed from a live
   measurement and needed nothing.
2. An `<svg>` root clips at its viewport, and the wire layer's is sized to the
   world box. A card dragged past that edge rendered fine — the world div does
   not clip — while its wires were silently cut. `asking` sits at `x: 0`, so it
   took 60px to reproduce.

**Cost accepted:** `PLACE`'s own comment says the hand-placed, deliberately
irregular layout *is* information — "the irregularity is the information." Drag
lets a user flatten an authored claim about how a request moves through the
system, and the only way back is `0`. There is deliberately **no per-card undo**:
double-click is the obvious gesture and it fights the single click that opens a
level, so one misdrag costs the whole arrangement or nothing.
**Breaks at scale:** offsets are in memory, keyed by id, for one session. The
moment layout is meant to persist, or two people are meant to see the same
board, the offset layer has to become real coordinates — which means `worldPos`,
`CONTENT` and `WORLD` stop being module constants, and D8's framing maths is
open again.

---

## D10 — Push on a green gate, not on a clock

`understand-slop` commits and pushes at each **verified milestone**: `tsc
--noEmit` clean, `eslint` clean, and the changed behaviour actually driven in the
running app. No milestone, no push; no asking when one is reached.

Beaten: enabling `CC_CHECKPOINT_PUSH=1`, which would publish the Stop hook's
`wip:` checkpoints every ~10 minutes; and pushing at the end of every turn that
edits files. Both raise frequency by removing the gate, which is the only part
worth keeping.

**The browser leg is not ceremony.** D9 records four bugs that each turned a row
click into a silent no-op, and `tsc` and `eslint` were clean through every one of
them. A green typecheck over a dead click is exactly the state the global rule
about `demo.sh` exists to prevent: it looks fine.

**Cost accepted:** fewer pushes than a timer would produce. Long stretches of
refactoring reach the remote only when something is provably runnable, so a
machine failure mid-refactor loses local work the Stop hook committed but never
pushed.
**Breaks at scale:** this repo pushes straight to `main` with no branch, PR or
CI, so "green" means only what was run locally. With a second contributor, or a
deploy watching `main`, the same cadence publishes unreviewed work — the gate
would need to move into CI before that. Each push also carries whatever `wip:`
checkpoints accumulated, which is how 11 unpushed commits went up at once on
15 Sept 2026.

---

## D12 — The flow runs down, and the store gets its wires back

**Chose:** a vertical spine with the dependency tier beside it behind a rule,
and the store's fan-in restored as one bus.
**Beat:** the horizontal serpentine, and leaving the tier unwired.

The serpentine was a real fix for a real problem — six steps in one row is
2520px, which opened at 0.52 scale and was unreadable — and it charged a
reversal for it: you read →→→, then ←←←, then dropped. The one thing a sequence
has to communicate is which way it goes, and the layout said it twice in
opposite directions. A spine spends height instead, and a single column is
narrow enough to have height to spare: **1400×597 closed, opening at 0.89**
against the serpentine's 0.96. Width still binds; height has 12% slack.

`watching` came off the spine because the data says it is not on it.
`generating` has two edges out — it streams to the screen AND it saves — and
only the saving continues. In the column it would have sat between `generating`
and `keeping` with their wire crossing it.

**Reversing the fan-in deletion (820fc5c).** That commit removed five write
edges and `tables → infra` on the grounds that a process sequence and a
dependency fan-in in one flat edge set is a mixture no convention makes, and
that five arrowheads on one box is five relationships fighting over one landing
strip. Both true. What it missed is what a card with no wires actually looks
like: not "a different kind of thing", just unfinished — and the store and the
dashboard are the two cards a reader asks about first. So the edges are back and
the clutter is solved in the routing instead, where it belongs. Four writers
arrive as one lane with one arrowhead, which is the fact the prose was standing
in for. The subtitle that carried it is now trimmed, because a label restating
the drawing beside it is duplication.

**Vertical is a property of the level, not a house style.** A level lays out
downward when its edges form a chain — each child to the next, in declared
order, once. That test, rather than "has edges", is load-bearing: `generating`
fans two children into a third, and stacked, whichever order you pick, one edge
points back up the column and skips a card. A fan-in is a convergence, and the
row already draws convergences well. Five levels stack; `generating` stays a
row.

**Three bugs the screenshots found and the typecheck did not.**
1. The bus was hard-coded to a horizontal lane. On a vertical board every
   writer shares an x, so all of them dropped at the same place and the drops
   stacked into one line running down the spine, directly over the sequence
   wires. The lane now picks its axis from the writers' centroid, and stands off
   the *column* rather than the target — off the target is the obvious
   transposition and makes four parallel lines cross the tier rule where one
   should.
2. A run whose endpoints share an axis short-circuited to a single straight
   segment, discarding the corridor the obstacle loop had just settled. In a
   column that draws straight through whatever card is between the ends.
3. **Faded roots were still obstacles.** Out-of-scope cards stay mounted so
   their anchors survive — and on a vertical board they sit in exactly the
   column an open level unfolds into, so every wire in that level detoured
   around a card nobody could see. This one only exists because the board went
   vertical; horizontally the invisible cards were never in the way.

**Cost accepted:** two expanded cards fit side by side in an 860px viewport;
stacked they are 910px plus the parent card and the gap. **D8's framing
limitation therefore moves from level 3 to level 1** — five level-1 drills now
need a pan where they previously fit. The mitigation is the one D8 already
reached for: a stacked level is top-anchored, so it frames from the card you
clicked and reads downward. The trade is deliberate — a row shows both cards at
once and says nothing about order; a column says "and then this" and costs a
scroll.
**Breaks at scale:** the chain test needs the declared child order to BE the
sequence, so a level whose edges are a chain in a different order than its
children are listed falls back to a row without saying why. And a vertical level
with two sibling foreign keys would draw them on top of each other: stacked
cards share a left edge, so the relation router takes its `self:` left-margin
branch, which has one lane and no offset. One FK exists today (`keep-msg:PK →
keep-conv:SK`), so it has not come up.

---

## D13 — Roots are the surface; kind sets the card, not the depth

**Chose:** the roots are what a person sees — pages, UI elements, the journey
between them. One click down is the data flow behind that surface. Below that,
as deep as a branch needs, is the code that does it, down to functions and
classes. Every node carries a `kind` (`journey | page | element`, `flow |
store`, `module | class | function`), and `layerOf(kind)` in `lib/data.ts` is
the one place a kind maps to its layer.
**Beat:** (a) a fixed four-level ladder (surface → flow → file → symbol), and
(b) the product-step cut it replaces, where "Asking", "Gate" and "Generating"
were roots.

A fixed ladder was rejected for the same reason the tree never had a level cap:
`getUserTier` is a whole finding in four lines two levels under the gate, while
the animation call is an excerpt four levels under the chat box. A ladder would
either pad the short branches with a file level that says nothing, or cut the
long ones off. So kind decides how a card reads — a mono kind label above every
title, and for code units a signature header, `file:start–end`, and numbered
lines — while depth stays whatever the branch earns.

The product-step cut was true and read well, but it is a cut by *what the
server does*. The direction this is heading — the card view as a second way to
edit a codebase — needs the top of the map to be what a person would point at
on screen, so they can follow it down to the code behind it.

**This revises D1.** D1 chose question-answering over a map. The board has been
a drill-down map since D9; this makes it one deliberately, and makes the code
layer the place where editing happens: the signature and body of a code unit
are edited in the card (`components/edits.tsx`). Edits live in memory, keyed
by node id, and are never written to disk — there is no file writer yet — and
the authored `CodeUnit` is never mutated, so "revert" just drops the edit. A
whole-file editor mode is deliberately not planned.

**Cost accepted:**
- Everything moved one level deeper, so "Generating the answer" now reaches
  level 4. D8 applies further down than it used to.
- The surface roots are mostly `inferred`. The VisuLearn source was not on
  hand, and only `ChatInput.tsx` and `AnimationBlock.tsx` were read; the history
  list and the share sheet are guesses at a UI the data layer proves exists.
- Only one quote in the dataset is a complete unit (`getUserTier`, usage.ts
  329–333), so the code layer has a single real card. The other excerpts stay
  as `source` blocks: promoting them would mean writing signatures nobody read.

**Breaks at scale:** the kind label is the only cue to which layer a card is in
apart from the layer trail. A parser emitting hundreds of `function` nodes per
module needs the `module` kind used for real, as a grouping level, or a flow
card will open onto a wall of functions. That is the next layer to build.

---

## D14 — Columns, not a camera

**Chose:** Finder-style columns as the main view (`ui/components/columns.tsx`).
The surface is on the left, the data flow behind your pick to its right, the
code behind that, and the full card for the deepest pick in a pane at the end.
**Beat:** the zoom canvas, kept in the repo (`ui/components/canvas.tsx`) but no
longer rendered by the page; and nested frames on that canvas, tried and
removed.

Three complaints from using it, and one cause. On the canvas you could not tell
where you were, the arrows looked wrong, and moving between layers did not feel
good. Every level opened *beneath* its parent and the camera flew to it, so:
- the ancestors left the screen;
- the wires routed around cards that were still growing;
- every step down was a pan and a zoom.

Frames were tried as a fix for the first problem. They added tint, not
orientation, because the card that named each frame was off-screen above it.

Columns remove the cause instead:
- **The path is the layout.** Every ancestor stays on screen, selected in its
  own column.
- **A step down is one column to the right.** Nothing zooms.
- **Relations are drawn inline.** An edge between two cards that sit one above
  the other is the gap between them, a connector carrying the edge's label
  ("checked by", "allows") — labels the canvas never drew. Any other edge is a
  chip in the footer of the card it leaves, and clicking it jumps there.
- **Row links are a list, not wires.** Clicking a row lists its `LINKS` under
  the anatomy, and each entry jumps to the row it names.

**Cost accepted:**
- No spatial overview and no dragging. The hand-placed spine, the side tier
  and the store's bus (D12) are not on screen any more; the surface column says
  the same thing as order plus a "behind the surface" rule.
- D7, D8 and D11 (camera, deep framing, drag) no longer apply to the main view.
- A deep path scrolls the left columns out of view. That is the Finder trade,
  and the column headers ("in The daily quota") carry the context.

**Breaks at scale:** a level with dozens of members becomes a long column, and
non-adjacent edges become a wall of chips. A real parser will need the `module`
kind as a grouping level (D13) and a filter in each column header. If a spatial
overview is wanted again, the canvas is still there to become a "map" toggle.

---

## D15 — One switch for the repo, and quotes the map cannot retype

**Chose:** every dataset module (`ui/lib/visulearn.ts`, `ui/lib/snecko.ts`)
exports the same `RUN`, `L0`, `E0`, `LINKS` and lookups, built by `makeMap` in
`ui/lib/tree.ts`. The app shows whatever `ui/lib/current.ts` re-exports. That is
one line to switch repos. The snecko map is generated by
`scripts/gen_snecko.py`: the narrative is written by hand in the script, but
every code body, line range and signature is read from `~/projects/snecko`
when it runs.
**Beat:** pasting quotes into a TypeScript file by hand, as VisuLearn's were.
That is how VisuLearn's quotes went wrong once already: they were mangled by a
re-indent and caught only by diffing against a saved copy.

**Cost accepted:** the map still describes snecko by hand, so it goes stale
when snecko changes. Re-running the generator refreshes every quote, and it
stops with an error if a range no longer starts at the declaration it names
(rather than quoting the wrong code). The narrative has to be updated by
hand. A parser replaces the script; the dataset shape stays.

---

## D16 — The map first, one level in focus, code depth in the pane

**Chose:** `ui/components/explorer.tsx` as the main view.
- **Map:** the whole surface at once, laid out from the data (`ui/lib/layout.ts`) and drawn with its relationships.
- **Focus:** clicking a card glides it into the top-left, where it heads a trail of everything opened. Under the trail is one level: the cards inside the deepest thing opened. On the right is the pane with that thing's description and every function behind it, editable.
- **Code depth:** "calls ›" and "methods ›" drill inside the pane, behind a small trail of their own.

**Beat:** the columns (D14), which kept orientation but lost the overview; and a map whose deeper levels open on the map itself (the canvas), which lost orientation.

**Why the pieces are where they are:**
- **One level at a time.** Going deeper adds a card to the trail and swaps the level, so depth never piles up on screen. The trail indents one step per level, capped at three, and the order says the rest.
- **Code is never a level.** Functions are read and edited together in the pane. If they were levels, every function would be a click, and deep call chains would push everything else out of the trail.
- **The map's wires are plain curves.** They are computed from the layout, not routed around measured DOM. Each edge leaves the side of its card that faces the other end. Ports on a shared side are spread out, and wires sit under the cards. Labels finally get drawn: each goes at the first clear spot along its curve. The canvas router (D12) was tuned to one hand-placed board and drew nonsense on a generated one.
- **Layout is computed, and linear.** Surface roots form one column in topological order over the root edges, ties broken by authored order, so the map reads like a list and most arrows point to the next card. An edge that skips cards is an arc in the left gutter, in its own lane (short spans inner). Stores sit in a right column, level with the cards that touch them. No ids are hard-coded, so VisuLearn and snecko both lay themselves out. (A first, ranked version placed cards side by side within a rank; it read as a web, not a sequence, and was replaced.)

**`calls` are matched by name.** `scripts/gen_snecko.py` looks for `name(` in each unit's verbatim body, against the other units in the map:
- a unit's own name is skipped;
- a name two units share is skipped as ambiguous;
- a class's methods are never call targets — they are reached through the class.

That is exact for snecko and wrong in general (shadowing, method calls on objects, dynamic dispatch). A parser replaces it.

**Cost accepted:**
- A class's methods can be edited both in the class body and on their own, as two independent in-memory edits.
- A wire that skips a rank passes behind the cards between its ends.
- The canvas and the columns view stay in the repo, unrendered.

---

## D17 — The map follows the repo while it is edited (proposed, not built; superseded by D18)

**Proposed:** a watcher that re-runs `scripts/gen_snecko.py` whenever
`~/projects/snecko` changes. `next dev` already hot-reloads a rewritten
`ui/lib/snecko.ts`. `explorer.tsx` exports only a component, so Fast Refresh
should keep the focus trail and the pane.
**Beats:** re-running the generator by hand after each change (D15).

**The watcher alone is not enough: line ranges break on almost every edit.**
All 36 `unit(...)` calls and the ~6 `src(...)` quotes hard-code their line
ranges. One line added near the top of `App.tsx` shifts every later function,
and the asserts in `unit()` then stop the whole run. So the real change is to
anchor quotes by name:

- **`locate(file, name, hint)`.** It finds the declaration lines for `name`
  (`function`, `const … =`, `class`, a method at class indentation) and keeps
  the one nearest `hint`, the old start line. It ends the quote by matching
  brackets, skipping strings and comments.
- **`unit()` keeps its signature.** The line numbers become hints, and the
  first-line and last-line asserts stay as sanity checks.
- **`src()` quotes a range, not a declaration.** It gets an anchor instead:
  `src(f, at="<first-line text>", n=<lines>, why=…)`.
- **Failure is per unit, not per run.** A name that is gone or ambiguous
  becomes a `partial`, `alarm` node that says "`pickDir` no longer found in
  src/lib/fileHandler.ts". The rest of the map still updates. Duplicate ids and
  a broken emit still fail hard.
- **Writes are atomic and only on change.** The generator renders to a string,
  writes only if it differs, and uses a temp file plus `os.replace`. Next never
  reads a half-written file, and an unchanged map causes no HMR churn.
- **`RUN` gains `dirty` and `generatedAt`.** The header can then say
  "fcea0b6 · uncommitted changes · updated 12:04:31".
- **The watcher is `scripts/watch_snecko.py`.** It is plain Python and polls the
  mtimes of `git ls-files -co --exclude-standard` (about 93 files) and of the
  generator itself. It debounces for 300ms, runs the generator, and keeps the
  last good file if the generator crashes. It runs as `npm run watch:snecko`
  beside `npm run dev`, with no `concurrently` dependency.

**The UI has to tolerate a map that changes underneath it:**
- A focus path naming a vanished node is cut back to its longest prefix that
  still resolves.
- An in-memory edit (`edits.tsx`) remembers the body it was based on. If the
  source changes under it, the card says so and offers revert.
- Optionally: compare unit bodies with the previous map, kept on `globalThis` so
  it survives HMR, and briefly highlight the cards that changed.

**Cost accepted:** only the quotes stay live. The narrative (titles, `detail`,
`why`, flows) is still hand-written and goes stale (D15). A missing unit now
says so on screen, which is the honest version of that cost.
**Breaks at scale:** name matching shares the limits of the `calls` matching
(D16): overloads, shadowing, generated code. A parser replaces `locate`, and
the watcher and the UI tolerance stay.

**Verify when built:**
1. Regenerating with no snecko changes gives the same `snecko.ts` apart from
   `RUN`.
2. With 5 blank lines added at the top of `App.tsx`, every `App.tsx` start
   shifts by 5 and every body is identical.
3. After renaming `pickDir`, only `fh-pick-dir` turns partial and the run exits
   0.
4. With dev and the watcher both running, editing the focused function updates
   the pane within ~1s, and the trail is kept.

---

## D17 — Maps are JSON files; the LLM writes the story, the repo writes the code

**Chose:** one JSON file per codebase, `ui/public/maps/<name>.map.json`, in the format defined by `ui/lib/schema.ts` (zod). The app loads it at runtime (`ui/lib/load.ts`, `ui/components/map-context.tsx`), picked by `?map=<name>` or the switcher in the header, from the list in `ui/public/maps/index.json`. `scripts/emit_schema.mjs` writes the same schema as JSON Schema (`map.schema.json`) for constraining an LLM's structured output.

**Beat:**
- **`.ts` modules** (what the maps were): compiled into the app, so a new codebase meant a rebuild, and an LLM writing TypeScript can break the build.
- **Markdown:** readable, but the data is a graph with ids and line ranges, and every formatting drift would be a parser bug.

**The split that matters.** A map file has two halves:
- **`index` (machine-filled from the repo):** every function and class (body, line range, signature, calls, class/method parent), and every quoted snippet.
- **`nodes` / `edges` / `links` (the narrative, the part an LLM writes):** cards, flows, labels, and which code belongs where. It refers to code only by symbol or snippet id.

An LLM retyping forty functions would quietly change some of them; a lookup can't. `scripts/gen_snecko.py` is the hand-written stand-in for that pipeline: narrative in the script, index read from `~/projects/snecko`.

**Shape choices:**
- **Nodes are a flat list with `parent`, not a nested tree.** It is easier for a model to write and to check, and `buildMap` rebuilds the tree.
- **A card's `code` is a list of symbol ids**, optionally with an id and narrative. A class's methods follow from the index, so they can't be forgotten or invented.
- **Edges name their `parent`**, so "both ends are siblings" is checkable.

**Loading checks twice and fails loudly:**
1. The schema.
2. The references it can't express: unique ids, parents exist and don't loop, edge ends are siblings, links land on real rows, and every symbol, call and snippet a card names is in the index.

Problems are listed by path (`nodes[3].parent: no node "x"`) on the page, instead of rendering something subtly wrong.

**Verified on conversion:** both maps load to exactly the trees the `.ts` modules produced — every title, state, anatomy row, code body, line range, call and edge. The checks surfaced four VisuLearn links that had never drawn because their rows didn't exist (the "Match rule" / "Match" kind). Three were typos and are repaired; one ("PDF export" on the quota card) had no matching row and was dropped.

**Removed:** the zoom canvas (`canvas.tsx`), the columns view (`columns.tsx`) and the `.ts` datasets. They are in the snapshot commit before this change. `wires.tsx` keeps its router code (unused now) alongside the colours the explorer uses.

**Breaks at scale / next:**
- Calls are still matched by name in the generator. The real indexer (TS compiler or tree-sitter) replaces that and fills `index` for any repo.
- VisuLearn's index holds only the code its map quotes, because its repo isn't on this machine.

---

## D18 — Standalone: `slop` + a Claude Code skill; the story and the code live apart

**Chose:**
- **A local CLI that opens the browser.** `bin/slop.mjs` indexes the repo, checks its story, and runs the Next app on 127.0.0.1 with `SLOP_REPO` set.
- **The narrative comes from a Claude Code skill.** `skills/slop-map` writes `.slop/story.json` and loops on `slop check`; it does not call the API.

**Beat:**
- **A Tauri desktop app:** a Rust shell and packaging, for a window around the same web UI.
- **A VS Code extension:** the UI moves into a webview and the extension API.
- **API calls from the CLI:** billed per run and needs a key. A skill uses the plan the user already has, and Claude can read the repo properly instead of being handed a dump.

**The map is split in two files, by who can be trusted with what:**
- **`.slop/story.json`** (Claude, committed): nodes, edges, links. Code is named by symbol id only, and ids never contain line numbers.
- **The index** (machine): rebuilt from the code on *every* map load (`lib/server/indexer.ts`, the TypeScript compiler API). `.slop/index.json` is a copy for reading, and git-ignored.

This is what D17 was reaching for with `locate()`. With no line numbers in anything hand-written, a shifted file needs no repair. Verified on snecko:
- 5 lines added to the top of App.tsx move every start line by 5, and every body is identical;
- renaming `pickDir` turns only its card partial, and the check still passes.

**The new indexer agrees with the old one.** For the 35 TS units `gen_snecko.py` produced, `indexRepo` gives the same id, kind, parent, start, end, body, signature and calls. The story converted from snecko.map.json merges to the same 57 cards. The one exception is the Rust unit, which is now a drift warning.

**Drift is a warning, not a failure (`lib/load.ts`).** A code ref or quote missing from the index renders as a partial, alarmed card saying what is gone. Schema errors, bad references and malformed blocks still fail the whole map.

**Quotes that aren't units** use anchors: `file` + `at` (the first line, or several lines joined by `\n`) + `lines`. They are resolved at merge time. An anchor that matches twice is a warning naming the line numbers. A converted snecko quote anchored on `{` matched 8 places, which is how that warning came to exist.

**Saving (`/api/save`, `saveSymbol`):**
- The browser sends the symbol id, the body the edit *started from*, and the new body.
- The server re-reads the file, finds the unit by id, and writes only if it still reads `before`; otherwise it returns 409 and writes nothing.
- The write is a temp file plus a rename, keeping the file's mode.
- The page then re-reads the whole map, so every later line number in that file moves too.
- Reverting after a refused save also re-reads, so the card shows the disk version.

**The server only answers its own page:**
- it binds to 127.0.0.1;
- the Host header must be localhost, which stops DNS rebinding;
- writes must come from the same origin;
- a save path must resolve inside the repo.

**What counts as a unit:**
- function declarations at any depth;
- consts holding a function;
- consts whose value is a call wrapping a block-bodied function (`useCallback((e) => { … })`, `ViewPlugin.fromClass(class …)`);
- classes and their members.

Not `xs.filter(v => …)`, `useMemo(…)` or `count((f) => f.short)`, which make values. Object-literal methods aren't units either.

**Cost accepted:**
- TS/JS only (D2). Other languages are quotable by anchor, but they get no cards of their own.
- Every map load re-indexes the repo: about 0.6s on snecko and 2.5s on this repo with the type checker. Fine at this size; at a few thousand files it wants a per-file cache keyed on mtime.
- The build is rebuilt whenever any app source is newer than it, so the first `slop` after an update takes about a minute.

**Breaks at scale / next:**
- No live re-index while you edit in another editor: reload the page.
- A destructured-props head (`function F({`) still reads as a one-line signature `function F(` (the rule in `lib/signature.ts`).
- Calls into object-literal methods are not resolved.

