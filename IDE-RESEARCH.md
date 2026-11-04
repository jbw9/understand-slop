# Do we still need an IDE? What it means for Mira

Notes on two pieces from October 2026, what we agree and disagree with, and
what Mira should change because of them. Written 2026-11-04.

- Isaac Levin, [“Why We Still Need an IDE”](https://blog.jetbrains.com/blog/2026/10/20/why-we-still-need-an-ide/), JetBrains Blog, 2026-10-20.
- Sam Witteveen, [“What is the Future of IDEs”](https://www.youtube.com/watch?v=I5VxMzaBD6s), YouTube, 14:30. Sponsored by JetBrains; he says so up front.

Background numbers used on the landing page:

- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/ai): 66% hit AI answers that are “almost right, but not quite”; 45.2% say debugging AI-generated code takes longer; 46% distrust AI accuracy, 3% highly trust it.
- [METR, 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/): experienced open-source developers took 19% longer with AI tools, expected to be 24% faster, and afterwards still believed they had been 20% faster.

---

## 1. What they say, in short

**Levin (JetBrains).** The job moved from typing syntax to directing intent.
An IDE is the cockpit: the agent is the flight computer, the engineer still
owns the flight. Three problems:

1. **Context.** “If you can’t see what it’s seeing, you’re not actually
   steering it.” A chat window shows one message at a time; an agent that
   touches a dozen files for a two-line fix leaves you to judge whether it was
   the right dozen.
2. **Ownership.** “Code being correct and code being yours are two different
   things.” “You can’t own code you don’t understand.” “Accountability doesn’t
   transfer just because the authorship did.”
3. **Judgment.** Engineers solve problems; code was the medium. The craft is
   the architecture and the decision about what should exist.

Then the pitch: give agents the IDE’s deterministic tools (types, lint,
tests) mid-task, avoid AI walled gardens via ACP (agent protocol) and BYOK
(your own model keys). That part is JetBrains Air.

**Witteveen.** IDEs still matter but must change drastically. “The IDEs are
really not where you write code anymore. It’s where you read it, where you
check it, where you decide whether it ships. The writing part has gotten
cheap. The verification hasn’t.” What he still opens one for:

1. **Diffs.** An agent touches 10–15 files; “from the terminal alone you
   really can’t see any of that.”
2. **Navigation.** Jump to callers, find usages, see what implements an
   interface, to judge whether a change is safe.
3. **Verification.** Run tests, see which pass, check tests aren’t just
   `return true`, step through with a debugger when something looks off.
4. **Documentation.** Agents should write docs and you should review them:
   why does this component exist, what are its constraints, did the agent
   change things I didn’t ask for.
5. **Context for agents.** “An agent that can only grep through files … is
   often an agent that’s kind of working blind.” Better context means more
   accurate output and fewer tokens.

Other points he makes that matter to us:

- Several agents (Claude Code, Codex, Fable, OpenCode) touched his test
  harness, “and often each of them has got their own idea about how that
  should actually all work.” What he needs is to know how the codebase is laid
  out in modules.
- His trick, from someone at Anthropic: have agents write **HTML
  documentation and diagrams of how everything is laid out, citing file
  names**, so he can open those files in an IDE.
- Review now takes longer than writing. A team JetBrains talked to saw PR
  time go *up* as agents rolled out, and he would be more worried by a team
  whose review time dropped to zero.
- AI reviewing AI catches things, but someone who knows what the system is
  *supposed* to do still has to check it isn’t breaking the law or running
  up compute and database bills.
- Today’s $100–$500 plans hide the token cost. If it moves to API pricing,
  context efficiency suddenly matters a lot.

---

## 2. Where they back what Mira already does

| They say | Mira today |
|---|---|
| “Go very quickly from the high-level chunks down to the low-level chunks” (Witteveen) | The whole product: features first, one level at a time, down to the line (D16, D28) |
| Agent-written HTML docs and diagrams citing file names | A Mira map is exactly that, except every sentence is checked against the code it cites (Verifying Claims) and kept current as the code changes (D64) |
| Diffs, not a wall of text in a terminal | Changes drawn on the map: section verdicts, +/− per box, Prev / Next through every changed part (D72–D78) |
| “If you can’t see what it’s seeing, you’re not steering it” | Picks go into the agent’s prompt; Claude moves your view to the section it is explaining (D59) |
| Review the docs; did it change things I didn’t ask for? | Docs reader (D65–D66); the Plan tab compares planned sections with what actually changed |
| IDE intelligence is for the agent too | `map_search`, `map_section`, `map_where` for Claude |
| Several agents side by side | Claude Code, Codex and OpenCode tabs in the workspace |
| Know what you can trust | `derived` / `partial` / `inferred`, and claims that fail the check are removed (D3) |
| Agents scaffold a stack you don’t know; then you explore it (Levin’s browser-extension story) | Import a project made by an agent and read its map; the explain level adapts to how well you know it (D70) |

## 3. Where we disagree, or only partly agree

- **“None of that needs to be reinvented; just point it at agent output.”**
  Go-to-definition, find usages and the file tree were built for code you
  already know. For code you didn’t write, the missing instrument is *what
  each part is for and how the parts connect*, and no IDE draws that. Both
  authors name the problem Mira solves and then prescribe the old tool.
- **“Really read it, not skimming diffs.”** Right about ownership, wrong about
  method at agent speed. Reading every line doesn’t scale to agent output,
  and METR suggests people misjudge their own speed anyway. The answer is
  reading at the right height: the shape first, then lines only where the
  shape changed or the risk is.
- **The IDE as the one cockpit.** For many people the agent now lives in a
  terminal and the editor is open “sometimes”. A tool beside both (the map
  plus agent tabs) fits how people actually work better than pulling
  everything into one editor.
- **ACP and BYOK.** The lock-in argument is fair and applies to us: making a
  map needs Claude Code or Bedrock. But ACP is early. MCP already gives
  tools to any agent, and that is the cheaper way to be agent-neutral now.
- **“Saves tokens.”** Plausible, unmeasured. We should measure map tools
  against plain grep on a real task before we claim it.
- **Debugger, test runner, refactoring.** Real IDE jobs, not ours. Mira sits
  beside the editor; it does not replace it.
- **Bias.** Both pieces are JetBrains marketing to some degree. The
  observations hold up; the conclusion (“so use our IDE”) does not follow.

## 4. What history adds (DECISIONS.md D1)

CodeSee built zoomable codebase maps plus PR review maps. GitKraken bought it
and **shut the map down, keeping the review part**. Greptile started as
codebase onboarding and **pivoted to PR review**. Sourcetrail was archived:
“the sort of thing that you would need only once or every once in a while.”

Both sources now say review is the bottleneck. Together that says Mira’s
strongest story is **reviewing what agents changed, at the architecture
level, and owning it**. Exploring an unfamiliar repo is still the way in, and
the reason the map exists, but review is what people do every day.

---

## 5. What to change in the app

In priority order. Effort: S small, M medium, L large.

### 5.1 Mark reviewed (S)
In the change bar (D78), each changed part gets a “Reviewed” check, and the
bar counts “4 of 7 reviewed”. Kept per commit or range, so a reload keeps
progress. This answers ownership directly: you know you have looked at every
part the agent touched.

### 5.2 Agent footprint (M)
A PostToolUse hook on Read / Grep / Glob, next to the existing edit hook in
`src-tauri/src/claude.rs`, sends the paths the agent opened as an act.
Sections it read light faintly and edited sections are marked. After the
turn: “Looked at 6 sections, changed 2.” This is Levin’s “see what it’s
seeing”, literally. Light only files the agent opened, not every search hit,
or it turns to noise.

### 5.3 Scope check (M)
Compare the sections a turn edited with what was picked or planned, and flag
“changed outside what you asked about”. The Plan tab’s map coverage already
does this for plans; this extends it to plain prompts. Witteveen: “did the
agent go off and change things that I didn’t want changed?”

### 5.4 Architecture drift (M)
When a change adds an arrow between two roots that weren’t connected, or
moves code across a root boundary, say so in the change bar: “New
dependency: Billing → Auth.” The overview diagram already diffs boxes and
arrows after an update (D74). This answers Witteveen’s several agents, each
with its own idea of the architecture, and Levin’s “whether it fits how the
system is supposed to work”.

### 5.5 Used in (M)
From a symbol in a code pane, list the sections that call or import it,
from the scanner’s import graph. This is “find usages”, answered as sections
rather than a list of files. It is the navigation check Witteveen uses to
judge whether a change is safe.

### 5.6 Map tools for every agent (M)
Register Mira’s MCP server with Codex and OpenCode when the agent strip
launches them, so `map_search` and friends work there too. Today they open as
plain terminals. This is our answer to walled gardens, and it backs the
landing page’s “works beside Claude Code, Codex and OpenCode”.

### 5.7 Explain the change (S–M)
Levin: you must be able to “explain and defend” a change in a postmortem.
D77 already summarizes a commit. Extend it to a range: a PR description
built from the sections it moved, the parts reviewed, and anything marked
partial. Paste it into the PR.

### 5.8 Tests on the map (L, later)
Run the project’s test or typecheck script and pin failures to sections via
`map_where`. A section could also show which tests cite its code, so a
reviewer sees untested parts, and can spot Witteveen’s `return true` tests.

### 5.9 Measure the token claim (S)
Run one real task twice in a Mira tab, with map tools and without, and record
tokens and turns. If it holds up, it is a landing-page claim and a reason
for 5.6.

### Not doing
- Debugger, refactoring, language servers: the editor’s job.
- ACP integration: revisit if it spreads; MCP covers tools today.
- A Codex or OpenAI generation backend: real lock-in risk, large change.
  Keep the LLM backend boundary clean and decide later.

---

## 6. Landing page (done 2026-11-04, not committed)

- New **“Why we’re building this”** section (`landing/components/landing-why.tsx`),
  linked as “Why” in the nav. Headline “Code got cheap. Understanding
  didn’t.” Two paragraphs of backstory from PLAN.md’s problem statement. Four
  frustrations, each with a sourced quote or number and what Mira does:
  1. You can’t see what the agent changed.
  2. Reviewing takes longer than writing.
  3. You own what you ship, whoever typed it.
  4. Your agent is working blind too.

  Then a “Worth reading” list: Levin, Witteveen, Stack Overflow, METR.
- **Testimonials replaced.** The old ones were placeholders with invented
  roles (“SDE at Meta”). The carousel now shows three real, linked quotes.
- **FAQ:** “Is this an IDE?” No: keep your editor; Mira shows how the whole
  repository fits together and what a change did to it.

Still open for the landing page:

- **Personal backstory.** The current text is in the project’s voice. A few
  first-person lines on how Mira started would make it stronger.
- **Lead with review?** If 5.1–5.4 land, the hero could say so, for example
  “See what your agent changed, and own it.”
- **The token claim** waits for 5.9.

## 7. Questions for us

1. Is review, rather than first-time exploring, the story we lead with?
2. How far do we go to be agent-neutral (5.6 now; a second generation
   backend later or never)?
3. Do tests belong on the map (5.8), or is that the IDE’s job?
