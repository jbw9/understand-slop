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

**Chose:** delete `ui/lib/visulearn.ts` and write `ui/lib/taxbuddy.ts` from a
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

**It is not a regression.** `git show HEAD:ui/components/canvas.tsx` has
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
