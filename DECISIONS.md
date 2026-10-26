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

## D11 — Re-author the fixture against taxBuddy, don't rename it

**Chose:** delete `app/lib/visulearn.ts` and write `app/lib/taxbuddy.ts` from a
fresh read of the target repo.
**Beat:** find-and-replace the repo name, keeping the tree and swapping labels.

The fixture is not configuration. Every `detail`, `why`, `flow` step and quoted
block is a specific claim about one repository, carrying a real path and a real
line number. Renaming VisuLearn to taxBuddy would have left taxBuddy's name over
VisuLearn's facts — a file that typechecks, renders, and is wrong in every
sentence. That is precisely the failure this project exists to study, so
producing one as a demo was not available.

**The top-level cut is `derived` here, and that is new.** VisuLearn's roots were
`inferred` and said so on every card: grouping 115 files into "Asking a
question" was a judgement call no compiler made. taxBuddy names its own stages —
`ONBOARDING_STEPS` in `lib/config/onboarding.ts` is an ordered literal, and
`Stage` in `lib/types.ts` is the union it draws from. The roots follow that list,
so the least certain thing on the old screen is now read out of the source. Four
roots are not wizard steps (consent gates the flow, the engine runs between two
steps, the store sits under everything, `/check` bypasses all of it), and those
are marked for what they are.

**19 quotes, each re-read at its offset before being pasted.** The previous pass
needed a corrective commit for five wrong line numbers (470f82a), so every
`start` here was verified with `sed -n` against the real file rather than trusted
from the survey that found it. Two came back richer than reported and were
re-quoted longer: `packetCache.ts:42` carries the v8→v9 renumbering rationale,
`profile/page.tsx:285` states its own re-read reasoning.

**Five claims come from `docs/STATUS.md`, not from code**, and are marked
`partial` naming the doc: the S3 delete 403, the ledger's 0 rows against 14
filings, the Free-plan posture, the consent gate's reach, and the $19/1,000
cost. These are the operator's report of what production does, which reading the
repository cannot confirm or refute.

**Cost accepted:** `LINKS` endpoints are `owner:rowKey` strings that `tsc` cannot
check — `rowId()` takes arbitrary strings, so a typo draws no wire and reports
nothing. Guarded with a throwaway script that re-derives each block kind's anchor
key from `components/anatomy.tsx` (schema→column name, map→`from`, flow→`n`,
source→the literal `"source"`, the rest→`label`) and cross-references all 48
endpoints. It is not in the repo, so the next edit to `LINKS` has no guard unless
someone writes it again.
**Breaks at scale:** the fixture is one hand-authored file per repository, which
is the thing that cannot scale at all — it is the prototype's whole premise that
a real run would emit this shape. Nothing here computes it, and the cost of
re-authoring is now measured: a full day's reading for one mid-size repo.

## D12 — The level-1 camera is wrong, and this is not the change that fixes it

Driving the taxBuddy board found it: clicking any root frames the card and
leaves its children below the fold. One scroll reaches them, and every deeper
level is framed correctly.

**It is not a regression.** `git show HEAD:app/components/canvas.tsx` has
`if (path.length < 2) return;` in the post-commit framing effect and
`frame({ x: p.x, y: p.y, w, h })` — no `"top"` anchor — in `drillInto`. So a
first-level drill has always taken the centred pre-commit guess and never the
measured top-anchored correction. D9's four fixes were row-drills and deep
levels; level 1 was never in that set. The old board hid it: three roots per
row at 360px wide centred acceptably, where a 607px computed box on this wider
board does not.

**Chose:** report it and leave the camera alone.
**Beat:** passing `"top"` to `drillInto`'s frame call, or dropping the guard to
`path.length < 1`.

Either edit is two characters and neither is safe here. D8 records twelve
attempts at this camera, and the guard exists because at level 1 the opened
card is the root — the one node whose position is known before commit — so the
measured path and the guessed path are aiming at different things by design.
Changing it during a fixture swap means shipping an untested camera change
inside a commit whose subject is data.

**Cost accepted:** the first click of any demo needs a scroll, which is the
worst possible click to have a rough edge on.
**Breaks at scale:** every root on this board has children, so this is one
scroll on ten cards rather than an occasional annoyance. It should be fixed
next, on its own, with the browser open — which is the only way it was found.

## D13 — `withRowChildren` recurses into the rows it synthesizes

`lib/taxbuddy.ts`. The helper built a node per `under`-carrying row and set
`anatomy: r.under`, then never looked at that anatomy again. Since `under` is
itself an `Anatomy[]`, a row inside it can carry its own `under` — so the
second level of nesting stayed data and never became a node. Every root
measured exactly 3 levels deep however deeply it was authored.

**Beat:** authoring around it (flattening the deep material into longer
`facts` blocks). Rejected — it would have made the file shallower to suit a
helper, which is backwards, and the content was already written.

**Cost:** the synthesized subtree is now walked twice, once to build and once
to recurse. At this fixture's size that is microseconds at module load.

**Found by:** my own endpoint audit, which reports depth per root. The
typecheck and lint were both green with the bug present — the tree was
structurally valid, just truncated. Nothing else would have caught it.

**Carried over, not introduced:** the helper came from the visulearn fixture
verbatim. This is the first fixture authored deeply enough to reach the limit.

**At scale:** a cycle in `under` would not terminate. Nothing can author one
today (the data is a literal), but a generated fixture could, and this would
recurse forever rather than erroring.

## D14 — depth is authored, not derived

After D13 three roots reached 4 levels and seven stayed at 3. That is not a
second defect: `deepRows` only synthesizes children for `map` and `flow` rows,
so a branch ending in a `facts` block is a leaf by construction. The seven
shallow roots bottomed out in `facts`.

**Decision:** deepen by re-authoring those terminals as `map`/`flow` rows
carrying a further `under` that ends in a verbatim `source`, rather than by
teaching `deepRows` to descend into `facts`.

**Beat:** making every block kind drillable. Rejected — `facts` is the shape
used for "here are five flat attributes", and giving every one of them a caret
would put a drill affordance on rows that have nothing underneath, which is
the dead-affordance problem the row/card click rule exists to avoid.

**At scale:** depth stays a property of what the analysis actually found. A
branch with nothing more to say stops, and that is information.

## D15 — `onOpenRow` resolves the owner with `lastIndexOf`, not `indexOf`

`app/components/canvas.tsx`. A row id is `rowId(owner, key)` = `${owner}:${key}`.
When a row lives inside another row's `under`, its owner is itself a row node,
so the id carries two colons: `eng-path:2:not expired`, owned by `eng-path:2`.
`indexOf(":")` cut at the first colon and returned `eng-path` — a real node, but
the wrong one — so `nodeAt([...at, id])` resolved null and the click did nothing
at all. The row tinted on hover and the level never opened.

**Beat:** flattening the ids (e.g. a separator that can't appear twice).
Rejected — the id is also the wire anchor key, so changing its shape would
have meant re-pointing every LINKS endpoint to match.

**Cost:** a key containing a colon would now split in the wrong place. No key
in this fixture does, and the anatomy row keys are authored rather than derived
from source text, so it is controllable.

**Found by:** driving the board in Chrome, not by typecheck, lint or the data
audit — all three were green. The failure is invisible except as a click that
does nothing, which is exactly the class of defect only a real interaction
surfaces.

**At scale:** this is the second latent limit (see D13) that only appeared once
a fixture nested `under` inside `under`. The row-drill path had never been
exercised past one level of nesting.

## D16 — The top level is features, and the directory spread is the evidence

**Chose:** roots are product features (Consent, Eligibility, Extraction, Engine…).
**Beat:** an architecture cut (frontend / backend / database / server), which was
the live alternative.

Not taste. I mapped every root to the directories its content actually came
from:

| root | directories |
|---|---|
| `eligibility` | `lib/rules` |
| `extraction` | `lib/parsing`, `lib/ai`, `lib/extraction` |
| `identity` | `app/(protected)`, `lib/rules`, `app/api` |
| `packet` | `lib/server`, `lib/rules`, `lib/pdf` |

Features cut across directories, and `lib/rules` alone is touched by four of
them. An architecture cut would put `lib/rules` in one box and force
eligibility, engine, identity and packet to share it — which is precisely the
"I don't know what belongs to what" confusion this round exists to delete. The
feature cut keeps each question in one place; the cost is that a directory
appears under several features, which is why `Node.footprint` now states the
file footprint explicitly rather than leaving it to be inferred from the title.

**Cost accepted:** "show me the backend" is not a question this board answers.
Someone looking for a layer rather than a behaviour has to know which feature
owns it.
**Breaks at scale:** feature extraction is the hard part of a real run. The
fixture's ten roots were read out of `ONBOARDING_STEPS`, an ordered literal —
a repo with no such list gives the analysis nothing to anchor on, and the
top-level cut becomes `inferred` rather than `derived`.

## D17 — Depth was never the inconsistency; breadth was

**Chose:** leave the four-level depth alone and attack text volume per card.
**Beat:** adding levels to the shallow branches, which is what the symptom
("some parts go as deep as the code, for some it just goes very shallow")
suggests on its face.

The symptom is real and the diagnosis it implies is wrong. Audited: 9 of 10
roots are exactly 4 levels, `unreachable` is 3, and **all 10 reach a real
`source` block**. 56 of 85 leaves are source. Depth is already uniform.

What varies by 26x is content per card:

| node | children | anatomy chars |
|---|---|---|
| `engine › Every formula` | 13 | 12,742 |
| `store › What is stored in the clear` | 0 | 483 |

Identical card treatment over that range is what reads as "no consistency at
all". The fix is `summary` on the dense ones and authoring the outliers down —
not new levels under the sparse ones, which would have invented structure the
analysis never found.

**Cost accepted:** a sparse branch still looks sparse. `store › What is stored
in the clear` is one fact and stays one fact.
**Breaks at scale:** `CARD_ROWS_SOFT = 8` is a guess from one fixture. On a
repo whose average card is denser, the threshold stops separating anything.

## D18 — Cards scale to content; no hard row cap

**Chose:** let a card's size follow what it holds, and require a `summary` line
past `CARD_ROWS_SOFT`.
**Beat:** a hard cap of ~5 rows per card, pushing overflow into child levels —
which would have produced a perfectly even rhythm at every depth.

A card's size is information about the thing it describes. `engine › Every
formula` holding 13 formulas *should* look denser than a card holding one fact;
flattening both to five rows throws that signal away and hides exactly the
outliers that most need authoring attention. The even rhythm would have been
bought by making the board lie about the shape of the code.

**Cost accepted:** the board's rhythm stays irregular, which is the thing the
user noticed first. `summary` mitigates it (you know what you are scrolling
before you scroll) but does not remove it.
**Breaks at scale:** a card with 60 rows has no good rendering under this rule.
Past some breadth the honest move is to say "60 formulas" and make the level
itself the list, which is a different layout, not a taller card.

## D19 — An arrow claims real sequence, or there is no arrow

**Chose:** wires only between siblings where one genuinely precedes another;
unordered siblings render as a `set` with a note saying so.
**Beat:** connecting everything with typed edges (`then` / `calls` / `reads` /
`writes`), which would have made every level look like a diagram.

The board shipped with 6 edges, all at root, and none below it — so every level
past the first was a silent pile of cards. Both the silence and the fix-by-
connecting-everything are failures of the same kind: the first lets a real
relationship go unstated, the second states relationships the analysis cannot
support. D3's principle applies to edges exactly as it applies to nodes —
inventing arrows turns a weak claim into a confident-looking one, and a reader
cannot tell which arrows were earned.

Saying "these five are unordered, they all read the same table" is information.
Saying nothing reads as missing analysis.

**Cost accepted:** some levels will have no arrows at all and will look plainer
than a diagram tool's output. That is the honest rendering of a set.
**Breaks at scale:** `ordering` is authored per node here. Deriving it from a
real analysis means proving one call happens before another, which is a
dataflow question, not an import-graph one — and the import graph is the only
thing D2 established as 98-100% precise.

## D20 — The code level reads the real repository

**Chose:** read `source` slices from `~/Desktop/Code/taxBuddy` at request time,
and allow a gated write back.
**Beat:** keeping the verbatim text pasted in `lib/taxbuddy.ts` (the shipped
design), and separately, refusing editing entirely.

The pasted text was verified once at authoring time and drifts silently the
moment the file changes — a map that is confidently wrong about code it quotes,
which is the exact failure this project exists to study. D11 already paid for
this once: five wrong line numbers needed a corrective commit. The repo is a
live git checkout and every spot-checked anchor (`lib/rules/income.ts:733`,
`:189`, `lib/payoutBreakdown.ts:8`, `lib/extraction/disagreementLog.ts:85`)
resolved to the right line, so reading it is sound today.

`matchesFixture` is the load-bearing field: when disk and fixture disagree the
UI must say the map has drifted, never silently render fresh text under a stale
explanation.

**Writing is the one operation that can destroy work**, so it is narrow by
construction: inside the repo root only, one contiguous slice at a time,
`expected` must still match disk (optimistic concurrency), a diff is shown, and
nothing is ever written on blur, on a timer, or on navigation.

**Cost accepted:** the prototype now depends on a second repository existing at
a known path. A missing or moved `taxBuddy` degrades the deepest level of the
demo, and the read endpoint takes arbitrary caller-supplied paths — the
containment check is the entire security model.
**Breaks at scale:** one hard-coded `REPO_ROOT` per run. Mapping several repos,
or a repo the server does not have on local disk, needs a different binding
altogether — and a write endpoint reachable by anything other than localhost
would need real authorization before it could ship.

## D21 — A declared sequence draws its chain from child order

**Chose:** when a node declares `group.ordering === "sequence"` but authors no
`edges`, chain its children in array order; the synthesized edge is `derived`
only if both endpoints are.
**Beat:** requiring authored `edges` before any wire is drawn.

Load-bearing, not a fallback. Workstream A landed `group` on 42 nodes — 14
sequence, 28 set — and **zero `edges:` anywhere in `taxbuddy.ts`**. Requiring
authored edges would have shipped sequence arrows as dead code against the only
data that exists.

The honesty argument is that a node reaches this branch only by asserting
`ordering: "sequence"`. Drawing the chain *reads* that assertion rather than
adding to it. The state rule is what keeps it from overclaiming: a synthesized
edge inherits `partial` unless both endpoints are `derived`, so an inferred
sequence never renders as a confident one. Authored `edges` still win, sorted
by `Edge.order`.

Verified in the running app: `identity` (sequence) draws 2 arrows chaining its
three children; `eligibility` (set) draws none and states its note instead.

**Cost accepted:** child array order is now semantically load-bearing in the
fixture. Reordering two children of a `sequence` node silently redraws the
chain, and nothing type-checks that.
**Breaks at scale:** a generated fixture would have to emit children in true
execution order or declare `set`. Deriving that order means proving one call
precedes another — a dataflow question, not an import-graph one, and the import
graph is the only thing D2 established as 98-100% precise.

## D22 — The level-1 camera framed a box the content does not occupy

**Chose:** frame the union of the opened card and its children's columns.
**Beat:** framing `opened.parentElement` (what shipped), and computing the box
from `CHILD_W`/`CHILD_GAP`.

D12 named one defect — `if (path.length < 2) return;` skipping the measured
correction at level 1. Lifting that guard was not enough, and the second defect
only became visible once the first was gone: the effect framed the opened card's
parent, which at level 1 is the root wrapper carrying a **fixed**
`width: cardWidth(node)`. Children overflow it horizontally rather than
stretching it. Measured on `identity`: the wrapper reported **309px** wide while
its three children actually spanned **1054px**. The old code was truthfully
measuring a rectangle the content does not occupy.

At depth ≥2 the parent column genuinely is the subtree, so the union equals the
column and D8's deep-drill behaviour is byte-identical there. That is why twelve
previous attempts never hit this: none of them were at level 1.

Measured, `identity`, viewport 1920×808:

| | before | after |
|---|---|---|
| world transform | `212.5, 27.3` — identical to overview; the camera never fired | `-627.6, -194.3` |
| owner card y | 294 | **72** (= `TOP_GUTTER`) |
| deepest child right edge | 2202 → **282px off-screen** | 1365 → 555px spare |
| content bottom | 1097 vs 808 → **289px below fold** | 892 → 84px below fold |

Rejected `width: max-content` on the wrapper: it would have broken the
deliberate fixed tier width that stops a one-line title card spanning 1100px.
Rejected computing from constants — D8 records that guessed boxes are exactly
what failed twelve times.

**Cost accepted:** two extra `querySelector` calls per drill, and the camera now
depends on children being in the DOM at measure time.
**Breaks at scale:** a card whose subtree exceeds the viewport still cannot be
framed by any box. `eng-math` renders ~3,000px tall and is the live proof — see
D18's accepted cost.

## D23 — Orientation chrome lives outside the camera transform

**Chose:** breadcrumb, legend and key hints as fixed overlays, mounted as
siblings of the transformed world.
**Beat:** placing them in the world so they sit with the diagram.

Driven in Chrome three levels deep, the board carried no `h1`, no nav landmark,
no breadcrumb and no legend — nothing but cards on a dot grid. There was no way
to answer "where am I" except from memory, which is the exact failure this
project was started over.

A breadcrumb that panned away with the camera would be useless precisely when a
reader is lost, so none of it rides the transform. `trail` is built from real
nodes rather than ids, so a renamed node renames its own crumb; `jumpToDepth`
reuses the same `overviewView` computation `drillOut` does, rather than making a
second guess at where the overview is.

The legend is collapsed by default. 7 of 10 root cards read `partial`, and with
nothing defining the word the board read as "mostly broken" rather than
"honestly bounded" — but an always-open glossary in the corner is clutter, so
the meanings are one click away.

**Cost accepted:** three fixed overlays occupy screen corners permanently, and
the Next dev badge overlaps the key hints in development.
**Breaks at scale:** the breadcrumb is one line. A path ten levels deep would
need eliding in the middle, and `max-w-[min(680px,60vw)]` currently just
truncates the last crumb.

## D24 — A card shows what it contains, not the contents

**Chose:** a row that has somewhere to go renders its TITLE only; its
explanation moves to the level behind the click.
**Beat:** shortening the prose in place, which was the obvious read of "it's
very text-heavy".

Measured, and the number is the argument:

| level | words rendered at once |
|---|---|
| `extraction` | **732** |
| `engine` | **1,085** |
| `packet` | 560 |
| `interview` | 467 |

732 words is a three-minute read — two pages of prose — presented as one
screen. Trimming sentences would have taken that to maybe 400 and changed
nothing about why it is unreadable.

**The actual defect is structural.** The card `BDA Parse` already has four real
children: "Stage the PDF in S3", "Sign the request by hand", "Invoke, then
poll", "Follow the pointer". It *also* printed all four inline with their full
`detail` paragraphs — 240 words on one card. The next level was being painted
onto the current one, so drilling revealed nothing that was not already on
screen, and the level read as an essay in columns rather than a map.

This is the failure the whole product is supposed to delete. D1 rejected a
zoomable map in favour of question-answering, but a level that renders every
answer at once is not answering a question — it is the wall of context the tool
exists to replace. The user's own words: *"It's just like talking into a
chatbot, right? It doesn't really help."*

**Cost accepted:** more clicks to reach the same sentence, and a level now
shows less than it knows. A reader who wants everything at once cannot get it.
**Breaks at scale:** `LEVEL_WORD_BUDGET` is 120 against a fixture whose densest
level is 1,085. If real analysis output is uniformly dense, the budget becomes
a cap on what can be authored rather than a check on what is rendered — at
which point the honest move is more levels, not smaller type.

## D25 — Logos and diagrams are facts, drawn only where they are true

**Chose:** hand-authored inline SVG — brand marks for real dependencies, and
purpose-built figures where the arrangement IS the finding.
**Beat:** an icon package (no network; npm cache is broken), and diagrams-only
with no brand marks.

The marks are not decoration. Every brand rendered is a real entry in the
mapped repo's `package.json` — `@aws-sdk/client-bedrock-runtime`,
`@supabase/supabase-js`, `openai`, `next`, `pdf-lib`, `zod` — and the fixture
already names them in prose 19, 18 and 16 times respectively. A Supabase glyph
says in one symbol what "Supabase Postgres, one wide row per filing" says in
seven words, and a reader scanning ten cards for "where is the database" finds
it without reading anything.

The figures are held to D19's standard: an invented diagram is an invented
arrow. A fan-out is drawn only where three legs genuinely run, a pipeline only
where the stages are real. A card with nothing true to draw gets no shape.

**Cost accepted:** hand-authored glyphs are simplified silhouettes, not the
real corporate artwork, and they will look approximate to anyone who knows the
brands well. Nine marks and four figures are also a maintenance surface that
grows with every new technology a mapped repo uses.
**Breaks at scale:** this does not generalise. A real run against an unknown
repo would meet technologies with no authored glyph and no authored figure, and
fall back to the neutral chip — so the visual richness that makes this board
readable is exactly the part that is hand-made. The honest version is a mark
registry keyed on package name, which is a project, not a file.

## D26 — A figure renders at its designed width or it is decoration

**Chose:** `minWidth: FIG_W` on every figure, letting the card column give way.
**Beat:** `width: 100%` inside the anatomy column, which is what shipped.

Measured on the Extraction level: figures authored at a 240x120 viewBox
rendered **113px wide**, scaling their 6.5px labels to an effective **5.6px**.
A diagram whose text cannot be read is exactly the decoration D25 says these
must never be — it occupies the space of a finding and delivers none of it.
After the fix they render at 206px and are legible at the reading zoom.

**Found only by measuring in the browser.** `tsc` and `eslint` were green with
the figures at half size, and a screenshot alone reads as "the diagrams are a
bit small" rather than "their labels are at 5.6px". The number is what made it
actionable.

**Cost accepted:** a card containing a figure is now at least 240px wide plus
padding, so figures set a floor on card width that text-only cards do not pay.
**Breaks at scale:** two figures side by side in one card, or a figure inside a
deeply nested row, would both overflow. Nothing authors that today.

## D27 — The deferred paragraph has to land somewhere

**Chose:** carry `Step.detail` through `deepRows` onto the synthesized child
node.
**Beat:** leaving it, which is what D24's first implementation did.

D24 stopped a card rendering a step's paragraph when that step has somewhere to
go. But `withRowChildren` never copied `Step.detail` onto the child it builds,
so the paragraph was rendered on the parent, suppressed there, and never picked
up below: **content present in the fixture and invisible in the entire UI**.

That is the precise failure this project exists to find, produced by this
project, and it stayed green through `tsc` and `eslint` — the same class as
D9's four silent no-op clicks. It was caught by a builder reading its own work
rather than by any check.

**Cost accepted:** row children now carry both a `sub` and a `detail`, which on
a `map` row can restate the same fact twice if an author writes both.
**Breaks at scale:** every future "defer this to the level below" change has
the same hazard — suppression and re-rendering live in different files
(`anatomy.tsx` decides, `taxbuddy.ts` carries), and nothing checks that what
one hides the other shows.

## D28 — One level at a time, not a canvas that grows

**Chose:** the open node is the header, its children are the body, and the
path back is a rail on the left. The repo itself is a level drawn the same way.
**Beat:** keeping the pan/zoom canvas and fixing it in place (wrap siblings
into a grid, redraw the overview), and Finder-style columns.

The canvas failed the user's three screenshots for one structural reason:
every drill added a row of cards beside the last, so depth was paid for in
width. A root wrapper was 360px and its children were flex items that could
shrink, so five 400px cards were squeezed to their min-content — `Formulas`
rendered one word per line, `Engine Flags` one word per line over twenty lines.
The top level was a hand-placed serpentine whose second row read
right-to-left, with the three off-path roots parked wherever there was room.

Now every level is the same template, which is what makes "a lot of layers"
cheap: level six looks like level one, and the bottom of every branch is the
`source` block at full width, read from disk and editable. A sequence wraps
like text, numbered, with the arrow on the LEFT of each step so a wrapped row
opens with an arrow coming in rather than ending on one pointing at nothing.
A set packs into columns. Figures are kept off the overview's cards (one made
Consent 3x its neighbour's height) and drawn in the header once opened.

Supersedes the camera decisions D7, D8, D12 and D22 — there is no camera.
Sibling arrows are no longer wires; FK and trace wires still are.

**Cost accepted:** no spatial overview of the whole tree at once, and the
board no longer looks like a diagram. You cannot see two branches side by side.
**At scale:** a level with 30 children is a long scroll of cards; the budget
(~7 per level) is authored, not enforced. A generated map would need to group
or page wide levels.

## D29 — The open level lives in the URL; empty space does nothing

**Chose:** the path is `?at=a&at=b`, pushed with native `pushState`, read
with `useSearchParams`. Back is the browser's back, the trackpad swipe, Esc,
the named "← parent" link above the title, or any stop on the rail.
**Beat:** clicking empty space to go back (shipped), and component state with
our own `history.state` (tried first).

Clicking the background is the most common accidental click there is, and it
threw away where you were. The first history attempt stored the path in
`history.state`; Next's App Router owns that object, and back from three
levels deep landed on the repo. Measured after the switch: back steps
`Sign the request by hand → BDA Parse → Extraction`, one level each.

**Cost accepted:** `<Suspense>` around the page; history fills with one entry
per drill, so Esc after a trail jump is "up", not "back".
**At scale:** row ids go into the URL verbatim. Deep paths make long URLs, and
a renamed node id breaks old links — they fall back to the repo level.

## D30 — REPO_ROOT resolves from the home directory

**Chose:** `resolve(homedir(), "Desktop/Code/taxBuddy")` as the fallback.
**Beat:** the literal `/Users/jonathanmacmini/...` it shipped with.

On any other machine every `source` block failed to read and silently showed
the pasted quote with "Could not read the repository" — the code level was
never live here. Containment is unchanged: `../../../etc/passwd` still refuses.

**Cost accepted:** still assumes `~/Desktop/Code/taxBuddy`; `SLOP_REPO_ROOT`
overrides it.
**At scale:** one repo per server. A second repo needs the root chosen per
map, not per process.

## D31 — A level names its parts; it never shows their contents

**Chose:** children render as compact rows — title, one sentence, a peek at
what is behind the click (`summary`, else child names, else "5 steps · code"),
and the file. Order is a numbered rail down the left; a set is a grid with no
numbers. The level's picture lives in its header.
**Beat:** cards carrying their own figure, steps and facts with arrows between
them (round 2's first cut), which the user called "jumping through a lot".

Two findings, both from the user's screenshots. The arrows between wrapped
cards said nothing: a row of three cards with an arrow at each gap claims
adjacency, not sequence, and on a set level there was no sequence at all. And
each card painting its own contents put two levels on one screen — open
Extraction and you were already reading BDA Parse's pipeline, its five steps
and four facts — so the next click revealed little and the one after felt
like a leap. D24 deferred prose; this defers everything.

Numbers on a rail now mean order and a grid means none, so no arrow is needed
to make the claim. The hand-off verbs E0 already carried ("uploads to",
"should gate") are written on the rail, dashed where the hand-off is partial.

**Cost accepted:** a level is less rich at a glance — nothing of a part is
visible until you open it. More clicks to reach the same fact.
**At scale:** fine to ~12 parts; past that the rail is a long scroll, and the
peek line is the only thing distinguishing similar rows.

## D32 — Facts in the fixture, plumbing in `lib/map.ts`

**Chose:** a fixture exports `RUN`, `AUTHORED`, `E0`, `LINKS`; `lib/map.ts`
derives the row nodes and `nodeAt`/`levelAt`/`allNodes`, and picks the active
fixture in one import. `REPO_ROOT` defaults to `~/Desktop/Code/<RUN.repo>`.
**Beat:** copying taxbuddy.ts's 100 lines of tree helpers into explorify.ts.

The second repo arrived (explorify), and D11 had already measured a fixture as
a day of reading. The helpers are not facts about any repo; duplicating them
would mean two copies of D13/D27's hard-won row-child rules drifting apart.

**Cost accepted:** one fixture active per build — switching is an edit, not a
picker.
**At scale:** the selector should become a route segment or a query param so
several mapped repos can be open at once.

## D33 — The path forks into lanes where the code does

**Chose:** `Edge.lane` names a branch. The overview draws the ordered, lane-less
edges as the shared path (Sign Up, Launch Routing), then one numbered column
per lane side by side (Students: Event Feed, RSVP · Organisations: Create Event,
Check-In). Numbering continues into each lane; a lane step's eyebrow reads
"Organisations · Step 4 of 4". Edges with no `order` are hand-offs between
lanes ("↗ publishes into Event Feed · Students"), written under the step they
leave, not counted as steps.
**Beat:** the single chain of round 2, which interleaved two apps
(create-event → feed → rsvp → check-in) so that every other step changed who
was using the app.

The fork is a fact, not a layout choice: `app/_layout.tsx:56-73` routes an id
found in `individual` to `app/individual` and one found in `organizations` to
`app/org`. Check-In follows Create Event in the org app via
`eventdetails.tsx:200`.

**Cost accepted:** `lib/data.ts` (a contract) gained an optional field, changed
in the main thread. One fork only — the overview renders lanes after the first
fork node; nested forks would need the lanes to recurse.
**At scale:** past ~3 lanes the side-by-side columns get too narrow; they would
stack, losing the at-a-glance comparison.

## D34 — A level explains; the code is a drawer, not the bottom

**Chose:** every authored node carries `code` refs (file + line range, read live
in a folded drawer on its level) and explains itself in blocks drawn as the
thing they describe: `diagram` (boxes on a grid, arrows routed by the
renderer), `table` (the real values), `sequence` (who talks to whom),
`screen` (what the user sees), `example` (a stored value). Problems move out
of prose into `issues` ("Watch out"). `partial`/`inferred` render as "not
certain" with a required `unsure` reason. Figures render full width as the
level's main picture.
**Beat:** branches that bottom out in a verbatim `source` block — the user
"dives straight into the code" — and a `partial` chip with no reason, which the
user asked to have explained.

Exemplar: opening Interest Categories now shows the eight categories, where
they are picked/stored/compared, every screen that shows them, a stored value,
and one problem; the code is five labelled places, one click away.

**Cost accepted:** `code` refs are line ranges, not quotes, so they can drift
silently when the repo changes — check-map catches out-of-range, not
shifted-by-ten. Every node now needs a person (or agent) to write a real
explanation; the fixture roughly doubles.
**At scale:** a generated map would need these blocks emitted by analysis, and
`diagram` layout by col/row stops working past ~5 columns.

## D35 — The path is a breadcrumb across the top, not a rail

**Chose:** a sticky one-line breadcrumb on the page's own background that wraps
when deep. **Beat:** the 232px left rail (D29), which the user said "wastes
space and is not fluid"; and the user's alternative of keeping the rail but
dropping its border, which still spends the column.
**Cost accepted:** the per-stop dot-and-line descent is gone; depth reads from
left to right instead. **At scale:** past ~8 stops it wraps to two lines.

## D36 — File paths only near the bottom of a branch

**Chose:** a level's header and a part's card show file paths only when that
node is at most one level above the bottom of its branch (`nearBottom`).
**Beat:** paths on every card and header (D31), which the user said were not
needed "till the 2nd to last layer". Higher up, a path answers a question
nobody has asked yet; the code drawer still lists every file on every level.
**Cost accepted:** a root no longer says at a glance which directories it
spans. **At scale:** unchanged — it is a per-node height check.

## D37 — Screens are real screenshots of the app, on sample data

**Chose:** `screen.shot` points at a PNG under `app/public/shots/<repo>/`, taken by
`app/scripts/capture/phone.mjs`. The script drives explorify's own Expo web build in
headless Chrome at 390x844 @2x. Every `*supabase.co` request is answered from
`fixtures.mjs` (made-up people and events), and the served bundle is patched
in memory for three web-only gaps: `Appearance.setColorScheme`, NativeWind's
web output, and the missing `SvgXml`. The noted parts sit beside the shot as
numbered callouts. **Beat:** drawn phone mockups, which the user said weren't
"realistic and relevant to what actually shows"; and screenshots against the
live project, which would read and write real users' data.
**Cost accepted:** shots go stale when the app changes and need retaking by hand.
The bundle patches are tied to explorify's current library versions, and a few
native-only screens (camera, push) can't be captured on web, so they stay drawn.
**At scale:** each repo needs its own harness and fixtures; nothing here is
generic beyond "serve the app, stub its backend, screenshot".

## D38 — Detail is two sentences at most; the rest is pictures

**Chose:** `detail` ≤ 2 sentences and ≤ 40 words, enforced by check-map.
What used to be paragraphs moves into `diagram`, `sequence`, `table` and
`screen` blocks, plus `issues`. **Beat:** 1-3 paragraphs (D34), which the
user called "way too long … i want to replace the huge text block with
beautiful simple diagrams". **Cost accepted:** nuance that only fits in prose
(why a thing is shaped as it is) has to fit in a diagram label, an issue, or
`unsure`, or it gets cut. **At scale:** the limit is per node, so it holds.

## D39 — Brand marks sit inline in the title row

**Chose:** `InlineMarks`: small pills (glyph + name) beside the title, with the
note as a tooltip. **Beat:** a right-hand column of marks with a note under
each, which the user called "a waste of space" with icons too small to read.
**Cost accepted:** the note is hover-only. **At scale:** past ~4 marks the
title row wraps.

## D40 — The picture is the way down; the parts list is the fallback

**Chose:** a `DiagramBox` may name the child it belongs to (`opens`), and
that box becomes a real link into that part. Where a level's diagram covers
its parts, the cards below collapse to a quiet one-line index (`List`):
name, problem count, chevron — no blurb, no block counts, no borders.
**Beat:** the grid of cards as the only way down, which the user said felt
like "we don't know what to do with the rest of it so we just dump it all
here … random buttons and it's pretty hard to understand what's going on".
**Why authored, not matched:** boxes outnumber parts (measured: 8.2 boxes to
3.7 parts per level) and name different things — a box is a thing at runtime
(`individual table`), a part is a chapter about it (`Checking Who You Are`).
Naive label matching linked 0-3 of 4-6 children per level, and `sb-tables`
matched 1 of 3 despite being a perfect conceptual fit. So `opens` is written
by the author; a box without one stays inert scenery rather than promising a
click it cannot honour.
**Mechanics:** a live box is an SVG `<a href>`, not a `<g role="button">` —
Chrome refuses focus to a `<g>` even with `tabIndex`, which would have left
the picture mouse-only. The href is the part's own URL, so a box is also
shareable and cmd-clickable. Verified: focus lands on a box (keydown log) and
Enter navigates.
**Cost accepted:** 67 links are hand-authored, one per box, and they rot if a
diagram is re-drawn without updating them. 3 of 13 levels have a part with no
box (`su-cats`, `ce-dates`, `ci-tap`) — the caption then reads "3 of 4 on the
picture above" and the list still reaches them, which is exactly why the list
stays. **At scale:** per-box authoring, like every other fixture fact; a
second repo pays it again.

## D41 — A diagram has no frame

**Chose:** the diagram renders straight onto the level — no border, no card
background. **Beat:** the bordered white panel, which drew a box around the
one thing that should read as the page itself; the user asked to "make it
part of the thing itself without the borders". **Cost accepted:** a wide
diagram's scroll edge is less obvious without a frame to clip against.
**At scale:** unchanged.

## D42 — No file paths on a part's card, ever

**Chose:** a card never shows a path. The open level's own header still shows
its footprint, and the code drawer still names every file on every level.
**Beat:** D36's "paths at most one level above the bottom", which still put
`app/_layout.tsx` on cards the user was reading as a menu: "you sometimes
write the path of the file. I really don't think we need that since we can go
deeper into that anyway and then later you can show the file path itself."
**Cost accepted:** to learn where a part lives you must open it — one extra
click, which is the point. **At scale:** unchanged.

## D43 — The scenery recedes; the live box wears a badge

**Chose:** a live diagram box carries a filled green disc with a chevron,
drawn at rest, and on a navigable diagram the boxes that open nothing drop to
0.55 opacity. Hover adds a lift and grows the badge.
**Beat:** a bare `›` at 0.45 opacity in the corner (D40), which the user could
not see: "the diagram is not that obvious that i can click on it". A lone
chevron at rest read as decoration, so the affordance was only discoverable by
hovering — which you only do if you already suspect it is clickable.
**Why the scenery dims rather than the live boxes shouting:** measured, most
boxes on a parent level are live — 8 of 10 on `feed`, 8 of 12 on `rsvp`, 9 of
11 on `supabase`. Making every live box loud would make the whole picture
loud and signal nothing. Fading the 2-3 inert ones is the cheaper, quieter
signal and leaves the live boxes at full contrast.
**Why green, not the box's own stroke:** the accent reads as "this does
something" everywhere else on the page, and it stays legible on a `warn` box
whose stroke is amber (`feed`'s `guests` box is both warn and live).
**Cost accepted:** a live box reserves 26px of width for its badge and
centres its label in what is left, so the label and its `sub` are no longer
centred on exactly the same axis. Measured imperceptible; verified 0 label
and badge overlaps across all 13 diagram levels.
**At scale:** per-box, no layout pass.

## D44 — A screen's callouts are body text, not captions

**Chose:** the numbered notes beside a `screen` shot are 15.5px with relaxed
leading and a 4-unit gap, in a column up to 760px wide.
**Beat:** 13.5px, snug leading, `gap-2.5` and a 240px minimum, which the user
called out: "there's so much empty space vertically. I don't get why you don't
make the text any bigger … it's so small and it's really squished together".
The list sits beside a ~700px phone, so it was set tiny against a column of
dead space.
**Cost accepted:** a screen with many long notes is now taller than its phone
rather than shorter. **At scale:** unchanged.

## D45 — Zoom magnifies the level; it does not reflow it

**Chose:** pinch, ⌘/Ctrl-scroll and ⌘ +/−/0 scale the open level with a
`transform` (100–400%) around the point under the cursor, the level keeping
its 100% layout and growing past the window to be scrolled around
(`components/zoom.tsx`). A pill with −/%/+ shows only while zoomed.
**Beat:** page zoom (CSS `zoom`, or the browser's own). It reflows, and a
diagram is already `width: 100%` up to its natural size, so reflowing left it
exactly as small as it was: the one thing the user wanted bigger. CSS `zoom`
on a pinned width would magnify too, but getBoundingClientRect inside it means
different things in Chrome and WebKit, and the wires measure with it; a
transform reads the same in both, and `WireLayer` already divides by `scale`.
**Cost accepted:** a pinch re-rasterises every frame. Zoom is not kept across
reloads, and does not go below 100% (a transform leaves the unscaled layout
box behind, so zooming out would leave dead scroll space).
**At scale:** one transform on one element, nothing re-renders but the wires.

## D46 — Native traffic lights on a Mac, drawn buttons elsewhere

**Chose:** `tauri.macos.conf.json` turns decorations back on with
`titleBarStyle: Overlay` and a hidden title, so macOS draws its own traffic
lights over our title bar; the bar leaves 78px for them and drops its own
minimize/maximize/close. Other platforms keep the drawn buttons.
**Beat:** drawing traffic lights in HTML: they would look right, but lose the
native hover glyphs, ⌥-click zoom, the fullscreen menu, and dimming when the
window is inactive.
**Cost accepted:** the lights' vertical position (`trafficLightPosition`) is
tuned by eye to the 36px bar. The override file repeats the whole window
object, because a merge patch replaces arrays wholesale.

## D47 — The light terminal floors contrast instead of re-theming Claude

**Chose:** on the light palette xterm's `minimumContrastRatio` is 4.5, so a
foreground too faint for its cell is darkened (or lightened, on a dark cell).
**Beat:** making Claude Code itself draw light. Its theme lives only in the
user's global `~/.claude.json` (default `dark`), with no flag or env var, and
it picks its colours in RGB, which no palette reaches. Its own `auto` theme
asks the terminal (OSC 11, which xterm answers), but switching to it is the
user's global choice, not the app's.
**Cost accepted:** Claude's dark-theme prompt row is still a dark bar in a
light terminal; it is readable, not pretty.

## D48 — Colour carries the one fact the picture knows: what opens

**Chose:** a `plain` diagram box that names a part (`opens`) is drawn in its
own indigo tint (`TONE.door`, derived from `opens` — never authored). The
corner badge adopts that ink too, so the box and its cue say one thing.
Scenery dimming on a navigable diagram lifts from 0.55 to 0.82.
**Amended twice, and now superseded by D52.** The indigo first spread to the
part cards as a spine; the user removed it ("don't see the point of it, the
diagram colors are nice tho") — a vertical list where every entry opens does
not need a mark saying so. Then the one shared tint on the boxes went too:
"it's alr obvious that we can open it by that arrow thing". Both are the same
error — spending colour to repeat what another cue already says. The corner
badge (D43) answers "can I open this"; colour is now spent on D52's question
instead, which nothing else answered.
**Beat:** the 8px green corner badge alone (D43). **Why:** measured across
every map, 2,440 of 2,596 boxes are `plain` — so a picture was a field of
identical rectangles, and the single most useful thing it knew ("you can go in
here") was carried by a badge smaller than a word. The user's report was that
the app "feels a bit boring, not inviting … doesn't make it interesting to
explore more", which is this: nothing on the page looks like an invitation.
**Why indigo, not the green accent:** green already means `derived` on every
state chip. A door is not a state, so it gets a hue of its own.
**Cost accepted:** a fourth hue in a palette that had three. `warn` boxes keep
amber and show an indigo badge — the tint is the warning, the badge is the way
in. **At scale:** derived, so it costs no authoring and cannot rot.

## D49 — One hue per actor in a sequence

**Chose:** `actorTone` assigns a colour by position in `actors`; the lifeline,
the chip and every arrow the actor SENDS take it. A message the map is unsure
of keeps amber and its dashes — doubt outranks identity.
**Beat:** two identical grey chips with every arrow in the same green, where
tracking who spoke over a six-message exchange meant re-reading every label.
**Cost accepted:** four hues defined; a fifth actor wraps to the first. No
authored sequence has more than four. **At scale:** assigned, not authored.

## D50 — The code pane is syntax-coloured, and bigger

**Chose:** `lib/highlight.ts`, a dependency-free tokenizer (strings, comments,
numbers, keywords, types, calls, annotations) with a language resolved from
the file's extension; 12.5px/1.65 rather than 11.5px/1.55.
**Beat:** one flat ink for every line. The map exists to make code legible, so
its own code pane cannot be the least legible pane in the product.
**Why a tokenizer, not a parser:** the maps cite nine languages; a grammar per
language to colour a 14-line slice costs more than it returns. The lexical
layer they share is the part that carries the reading.
**Cost accepted:** it is lexical, so a word that is a keyword in one of the
C-family languages is tinted in all of them. Wrong at worst by one word's
colour, never by hiding a line. **At scale:** one file, no dependency.

## D51 — Prose keeps a measure; pictures take the width

**Chose:** the level's cap goes 1220px → 1680px. The header splits at `xl`
into prose (≤660px) and a right rail carrying the footprint, the repo link
and a real "View the code" button. A diagram grows to fill the level, up to
`DIAGRAM_MAX_SCALE` (1.35), and its caption moves ABOVE it. Sequences and
tables keep their own widths.
**Beat:** a 660px header and a 900–1000px block cap on a 1600px window, which
left the right third empty dots while the diagram — the main thing on the
level (D40) — rendered at natural size inside a column half again as wide.
That smallness is what zoom (D45) was invented to work around.
**Why the caption moved:** it says what you are about to look at, which is
only useful before you look.
**Cost accepted:** past ~1.35 the labels read as a poster. Below 1100px the
header is one column again, in the old order. **At scale:** unchanged — the
audit (`audit-diagrams.mts`) lays out in viewBox units, so uniform scaling
cannot introduce an overlap; 23 maps, 0 problems after the change.


## D52 — A box is coloured by the SECTION it opens, not by the fact that it opens

**Chose:** `sectionOrder` numbers the distinct parts a diagram leads into, in
the order its boxes first name them, and `sectionTone` gives each a hue from a
seven-colour ramp. Every box opening that part is drawn in it, and the part's
entry in the list below carries the same dot. Authored `good`/`warn` tones
still win — those are claims about the code; a section hue is only an index.
**Beat:** one shared indigo on every live box (D48), which the user rejected
because the corner badge already says a box opens. **Why this instead:** the
picture and the index were two unconnected lists of the same six things, and
nothing tied a box to its chapter. Colour now answers that, and it answers it
in the one place it pays most: 64 of 254 diagrams draw a single part as two or
more boxes, which previously looked like unrelated boxes.
**Why seven:** measured, the widest diagram opens 7 distinct parts; past that
the ramp wraps.
**Cost accepted:** a level whose list is a `Grid` of cards (no diagram) gets no
dots, and a part with no box of its own gets none either — 3 of 13 levels have
one. A dot that matched nothing would be worse than no dot.
**Mechanics, learned the hard way:** these variables are referenced only from
inline `var()` in SVG attributes, never through a Tailwind class. Tailwind v4's
`@theme` emits a variable only where its scanner sees a class using it, so
declaring them there dropped the LIGHT values silently — every section box
rendered black in light mode while dark, being plain CSS under
`:root[data-theme="dark"]`, looked correct. Both themes are now plain CSS
outside `@theme`. The same bug was shipped unnoticed in D49's actor colours
and is fixed with it.

## D53 — Provenance is a second axis, never a fourth state

**Chose:** an optional `Origin { by: "user" | "claude"; at; note? }` on a node
and on a `note` block, rendered as a quiet mono line beside `StateChip`, never
instead of it.
**Beat:** adding `user` to `State`, which was the obvious one-line change.

`State` is an epistemic claim about how well the analysis knows a fact about the
repository: `derived` was resolved by the compiler, `inferred` is a guess from
naming. A reader's own sentence is not a weaker form of that — it is true by a
different authority, theirs. Putting it on the same axis would rank a person's
words against a compiler's, and because `derived` is deliberately unmarked (D3),
a fourth mark would make every unmarked thing look like one more kind of
analysis failure. That is the two-tier read D3 exists to prevent.

`update.ts` already overloads `partial` + `unsure` to mean "the update failed
here" — a process fact wearing an epistemic label. That is one overload; this
decision refuses to add a second.

**Cost accepted:** two marks can appear on one level (a section can be both
`not certain` and partly the reader's), and a reader scanning for "what is mine"
has no filter — the history panel is the list, not the map.
**At scale:** a map with hundreds of additions needs the additions findable from
the map, not only from a dialog.

## D54 — The reader's additions live beside the map, never inside it

**Chose:** `<vault>/projects/<id>/overlay.json` holding additions and edits,
`history.json` holding every version before this one, composed into the map by
`apply()` inside `loadMap` — the one seam every reader of a map already passes
through. `map.json` stays byte-for-byte as the generator wrote it.
**Beat:** merging additions straight into `map.json`, which is simpler to render
and needs no composition step.

`map.json` has two writers that rewrite it without asking: `regenerate` replaces
it wholesale, and every `update.ts` run rewrites the sections whose code moved.
A reader's note in that file is a note the generator will win against, silently,
at exactly the moment the reader has most invested in it. Separate files mean the
two writers never share one.

Composing in `loadMap` rather than in the canvas is what kept this small: the
renderer, the title bar and the text handed to Claude all see composed content
with no knowledge that an overlay exists. Verified by replacing a project's
`map.json` with a completely different map — the entries were kept and reported
as orphaned, not dropped, and reattached when the original returned.

**Cost accepted:** an entry naming a section that a regenerate renamed is
orphaned and shows nowhere until the reader deals with it; the alternative is
deleting their work, so it is kept and reported. Examples under `app/maps/` get no
overlay at all — they are committed fixtures shared by every reader of the
checkout, so they are read-only by construction.
**At scale:** orphan recovery is manual. Re-attaching a note to a renamed section
wants fuzzy matching on the old title, which nothing does yet.

## D55 — A reader's correction goes through the updater; their words do not

**Chose:** two routes behind one "Fix this". "Say what's wrong" posts a
`{section, note}` correction down the path `slop-map-fix` already takes
(`lib/vault.ts` → `turns.json` → `update.ts`), so the section is re-read against
the real file and stays code-derived. "Write it myself" stores the reader's text
in the overlay, marked as theirs, and reads no code.
**Beat:** one box that always re-authors, and separately, one box that always
just saves the text.

They answer different questions. "The capacity check is in the edge function
too" is a claim about the code that the code can settle, and the right outcome is
a section that cites the line — still `derived`, because the repository is what
was consulted. "This is the stage that actually costs money" is not in the code
at all and never will be. Collapsing them either throws away a model's ability to
go and check, or files a person's judgement as a compiler's finding.

`named()` in `update.ts` already resolved a section by id or title for an agent's
notes, so the reader's note needed no new pipeline — it joins the queue an agent
uses, and gets the same checked-and-verified re-author.

**Cost accepted:** "say what's wrong" costs a model call and a wait, and works
only on the reader's own imported projects; an example describes some other copy
of its code and says so.
**At scale:** nothing reconciles the two routes. A reader who writes their own
words and later corrects the same section via the updater ends up with both, the
overlay winning.

## D56 — A diff is shown over the map's own pictures, and says when it cannot be

**Chose:** diff mode decorates the normal level — sections tinted, a removed
section kept on screen struck through in red, a dropped schema row red beside a
new one in green, a removed diagram box red beside its replacement. Default range
is the map's commit → working tree, so uncommitted work counts. Any two commits
can be picked; a range the map's line references cannot speak to returns
`basis: "files"` with a `why` and no section verdicts.
**Beat:** a separate diff screen listing changed files, and separately, inventing
section verdicts for any commit pair.

The question a reader has while reviewing is "what did this do to the
architecture", and a file list does not answer it — the whole reason the map
exists is that file lists do not. Section verdicts are only meaningful when the
map's refs mean something on the `from` side, which holds when `from` is the
map's own commit; past maps are not stored per commit, so for an arbitrary pair
the honest answer is a file diff that admits it. `basis` is that admission, and
it exists so the fallback is visible rather than quietly wrong.

The git half of `update.ts` — `changes`, `diffOf`, `moved`, `touches`, `refs` —
moved to `scripts/generate/gitdiff.ts` unchanged and is shared. Two copies of
`moved` would drift into two different answers about the same commit.

**Cost accepted:** the diff re-reads and re-diffs on every range change, with no
cache. Block-level matching is by id (diagram boxes), column name (schema) and
first cell plus occurrence index (tables) — the last because a first cell is not
unique, which was measured: two identical maps reported four changed rows until
occurrence was counted.
**At scale:** storing a map per commit would make the both-sides-have-a-map path
real for any pair, and that path is already written and currently unreachable.

## D57 — A root is published when it is accepted, not when the run ends

**Chose:** the author stage writes `map.json` each time a root is accepted,
plus a `progress.json` the project list polls, so finished sections are
explorable while the rest are still being written. One `assemble()` produces
both the partial and the final map.
**Beat:** keeping the map until the run ends and only enriching the progress
line, which was the safe option and the one the user explicitly allowed
("if this is not possible without sacrificing output quality dont").

It costs nothing because the gate was already in the right place. `authorRoot`
only returns a root that passed `shapeProblems` and `check()` inside its own
submit tool, so "accepted" already means "would have shipped". Publishing at
that moment shows nothing the end of the run would not have shown. Measured on a
full run: `verifyPassRate` 100 before and after, 0 check problems before and
after, 5/5 roots accepted, and `check()` on a mid-run snapshot clean over 123
refs.

`row` is the root's index in the cut, never its index among those finished, so a
root that lands fifth takes row 1 if that is its place and moves nothing already
on screen. Writes go through a serialising chain rather than latest-wins: that is
not needed for `map.json` alone, but it stops `map.json` and `progress.json`
disagreeing about which roots exist, which would tell a reader a section is
explorable before the map they would open contains it.

**Cost accepted:** the statuses are only the ones the generator can report.
`authorRoot` logs once per submit and `runTool` reports nothing, so `reading
<file>` — which the approved sketch showed — is not derivable and is not
claimed. A root in flight shows `drafting`, or `revising — N problems` while the
repair loop converges.
**At scale:** a reader can open a half-made map and form a picture of a
repository from half its sections, with nothing on the level itself saying the
map is incomplete — only the project list knows.

## D58 — The diff is a list you navigate from, not a bar on the level you are on

**Chose:** one icon in the title bar opens a panel listing every section with a
verdict — its title, its trail, and the files behind it — and clicking an entry
opens that level. The red and green stay where they were (D56): the panel
routes, the level shows the change.

**Why:** the first build put the verdict counts in a bar across the top of
whatever level happened to be open. That is the summary of a whole comparison
rendered on a page showing one of its entries, so finding the three sections
that moved meant already knowing where they were — the hunt the map exists to
remove. A changed-files list is how a diff is read everywhere else, and it is
the one shape that answers "what changed?" before "what changed *here*?".

**Cost accepted:** two surfaces now describe the same comparison, and a reader
who never opens the panel sees tints with no index to them. Worth it: the index
is one click away and the tints are where the detail belongs.

## D59 — Claude drives the map through a script, and names sections from an outline

**Chose:** `slop-map-show section "<title>"` / `slop-map-show diff "<from>"
["<to>"]`, appended to a marker beside the tab's queue and drained on EVERY
`pty_state` poll rather than at the Stop hook. A second script, `slop-map-list`,
prints the map's sections from a file written when the tab starts.

**Why:** the channel had to exist anyway — `slop-map-fix` is the same shape, and
reusing it costs no new transport. Draining mid-turn is the whole point: a
reader who asks how sign-ups work wants to be looking at sign-ups while the
answer arrives, and navigation that lands after the explanation has finished is
navigation they have already done by hand. The outline exists because Claude
only learns section names when the reader picks one, which for a cold question
is never — without it, every `section` call would be a guess at a title that may
not exist. Refs are passed through unresolved (`"last commit by hindra2"`) and
resolved by `resolveRef`, so Claude never shells out to git to work one out.

**Cost accepted:** a name that resolves to nothing, or to several sections
equally, moves nobody and says so. That is deliberate — `findSection` refuses an
ambiguous match rather than opening an arbitrary one of them, because being
taken to the wrong section mid-answer is worse than not moving.
