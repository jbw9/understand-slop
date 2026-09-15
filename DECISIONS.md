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
