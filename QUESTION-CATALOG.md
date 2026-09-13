# Developer Question Catalogs — Consolidated Design Input

Sources mined directly from PDF (full text extracted locally, not summarized):

| Source | Status | Notes |
|---|---|---|
| Sillito, Murphy & De Volder, "Questions Programmers Ask During Software Evolution Tasks" (FSE 2006) | **RETRIEVED, complete** | All 44 questions, 4 categories, with session-occurrence codes |
| LaToza & Myers, "Hard-to-Answer Questions about Code" (PLATEAU 2010) | **RETRIEVED, complete** | 20 category headers extracted (see discrepancy note below) |
| Ko, Myers, Coblenz & Aung, "How Developers Seek, Relate, and Collect..." (TSE 2006) | **RETRIEVED, complete** | Behavioral/time-cost data, not a question list |
| LaToza & Myers, "Developers Ask Reachability Questions" (ICSE 2010) | **NOT RETRIEVED** | See Gaps |
| Rationale-mining empirical work | **NOT RETRIEVED** | See Gaps — this is the significant gap |
| AI-generated-code question catalogs (2024-2026) | **PARTIALLY SUBSTITUTED** | See Part E |

### Data-integrity notes (read before using the numbers)

1. **LaToza category count.** The paper's abstract claims *"21 categories and 94 distinct questions"* and *"179 respondents reported 371 questions."* Extraction finds **20 numbered subsections summing to 355 reports**, and 114 lines ending in a count (that 114 over-counts: several are wrapped continuation lines and figure text). The paper contains a **numbering error** — two consecutive sections are both labelled `4.2.1` ("Intent and Implementation" and "Method properties"). So the 21st category is either mislabelled, or folded into a neighbour. The 16-report gap (371 − 355) is unexplained by the section headers alone; some reports were likely uncategorized. **Treat category totals as reliable and the 21/94/371 headline as the authors' own count.**
2. **Sillito occurrence codes.** Numbers like `(1.1 1.2 2.15)` are *session IDs*, not frequencies. Study 1 = sessions 1.x (newcomers, lab), Study 2 = sessions 2.x (industrial, own code). Count of sessions ≈ crude frequency proxy. The authors explicitly decline to rank: *"We have made no effort to rank the questions we observed being asked by some measure of importance."*

---

## Part A: The Consolidated Question List

### A.1 Sillito et al. (FSE 2006) — all 44, verbatim, by category

Methodology: two qualitative studies. Study 1 — newcomers, pairs, ~45 min, medium codebase (~20 KLOC). Study 2 — 15 industrial programmers on their *own* change tasks, ~30 min, up to >1M LOC. Grounded theory analysis.

#### Category 1 — Finding initial focus points (5 kinds)

1. Which type represents this domain concept or this UI element or action? `(1.1 1.2 1.3 1.5 1.6 1.7 1.8)`
2. Where in the code is the text in this error message or UI element? `(1.5 1.9)`
3. Where is there any code involved in the implementation of this behavior? `(1.1 1.2 1.3 1.5 1.6 1.10 1.11 2.11)`
4. Is there a precedent or exemplar for this? `(1.1 1.10 1.12 2.6 2.14 2.15)`
5. Is there an entity named something like this in that unit (for example in a project, package or class)? `(1.1 1.2 1.4 1.5 1.6 1.10)`

#### Category 2 — Building on those points (15 kinds)

6. What are the parts of this type? `(1.2 1.5 1.6 1.7 1.8 1.10 1.11 2.15)`
7. Which types is this type a part of? `(1.2 1.5)`
8. Where does this type fit in the type hierarchy? `(1.1 1.2 1.3 1.5 1.6 1.12)`
9. Does this type have any siblings in the type hierarchy? `(1.5 1.11)`
10. Where is this field declared in the type hierarchy? `(1.5 1.7)`
11. Who implements this interface or these abstract methods? `(1.5 1.6 1.7 1.10)`
12. Where is this method called or type referenced? `(1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.10 1.11 1.12 2.1)`
13. When during the execution is this method called? `(1.2 1.4 1.5 2.15)`
14. Where are instances of this class created? `(1.2 1.5 1.7 1.8 1.10)`
15. Where is this variable or data structure being accessed? `(1.4 1.5 1.6 1.7 1.12 2.1 2.8 2.14)`
16. What data can we access from this object? `(1.8 2.15)`
17. What does the declaration or definition of this look like? `(1.2 1.5 1.8 1.10 1.11 2.1 2.11 2.13 2.15)`
18. What are the arguments to this function? `(1.2 1.3 1.4 1.5 1.7 1.8 1.10 1.11 1.12)`
19. What are the values of these arguments at runtime? `(1.4 1.9 1.12 2.15)`
20. What data is being modified in this code? `(1.6 1.11)`

> Note: the paper lists 15 kinds in this category but numbers 6–20 inclusive; the count is consistent.

#### Category 3 — Understanding a subgraph (13 kinds)

21. How are instances of these types created and assembled? `(1.1 1.2 1.4 1.7 1.9 1.10 1.11 1.12)`
22. How are these types or objects related? (whole-part) `(1.2 1.10)`
23. How is this feature or concern (object ownership, UI control, etc) implemented? `(1.1 1.2 1.4 1.7 1.11 1.12 2.1)`
24. What in this structure distinguishes these cases? `(1.2 1.12 2.8)`
25. What is the behavior these types provide together and how is it distributed over the types? `(1.1 1.2 1.3 1.4 1.6 1.11 1.12 2.11)`
26. What is the "correct" way to use or access this data structure? `(1.8 2.15)`
27. How does this data structure look at runtime? `(1.10 2.15)`
28. How can data be passed to (or accessed at) this point in the code? `(1.5 1.6 1.8 1.12 2.14)`
29. How is control getting (from here to) here? `(1.3 1.4)`
30. Why isn't control reaching this point in the code? `(1.4 1.9 1.12 2.1 2.10)`
31. Which execution path is being taken in this case? `(1.2 1.3 1.7 1.9 1.12)`
32. Under what circumstances is this method called or exception thrown? `(1.3 1.4 1.5 1.9)`
33. What parts of this data structure are accessed in this code? `(1.6 1.8 1.12)`

#### Category 4 — Questions over groups of subgraphs (11 kinds)

34. How does the system behavior vary over these types or cases? `(1.2 1.3 1.4)`
35. What are the differences between these files or types? `(1.2 2.1 2.2 2.13 2.15)`
36. What is the difference between these similar parts of the code (e.g., between sets of methods)? `(1.7 1.8 1.10 1.11 2.6 2.11 2.14 2.15)`
37. What is the mapping between these UI types and these model types? `(1.1 1.2 1.5)`
38. Where should this branch be inserted or how should this case be handled? `(1.4 1.5 1.6 1.8 1.9 2.11 2.15)`
39. Where in the UI should this functionality be added? `(1.1 1.5 1.7 2.1)`
40. To move this feature into this code what else needs to be moved? `(2.7 2.13)`
41. How can we know this object has been created and initialized correctly? `(1.10 1.12)`
42. What will be (or has been) the direct impact of this change? `(1.5 1.8 1.10 1.11 1.12 2.1 2.7 2.12 2.15)`
43. What will be the total impact of this change? `(1.7 2.1 2.3 2.4 2.5 2.9 2.11)`
44. Will this completely solve the problem or provide the enhancement? `(1.1 1.9 1.11 2.2 2.14)`

---

### A.2 LaToza & Myers (PLATEAU 2010) — all categories, verbatim, with report counts

Methodology, verbatim: *"We conducted a survey of software developers at Microsoft as part of a larger study investigating reachability questions [19]. We invited approximately 2000 developers... 469 developers responded."* The free-response item — *"What other hard to answer questions about code have you recently asked?"* — was completed by **179 developers**, yielding **371 questions** clustered into 94 distinct questions. Respondents: 149 individual contributors, 22 leads, 8 architects; median 10 years' experience, median 1 year on current codebase; 68% agreed they were "very familiar with my current codebase."

**Critical framing:** these are explicitly *hard-to-answer* questions, not all questions. That makes this catalog a difficulty signal, where Sillito's is a frequency signal.

#### 4.1 Questions about Changes

**4.1.1 Debugging (26)**
- How did this runtime state occur? (12)
- What runtime state changed when this executed? (2)
- Where was this variable last changed? (1)
- How is this object different from that object? (1)
- Why didn't this happen? (3)
- How do I debug this bug in this environment? (3)
- In what circumstances does this bug occur? (3)
- Which team's component caused this bug? (1)

**4.1.2 Implementing (19)**
- How do I implement this (8), given this constraint (2)? (10)
- Which function or object should I pick? (2)
- What's the best design for implementing this? (7)

**4.1.3 Policies (15)**
- What is the policy for doing this? (10)
- Is this the correct policy for doing this? (2)
- How is the allocation lifetime of this object maintained? (3)

> Paper's verdict: *"Helping developers find policies is an open, unexplored problem."*

**4.1.4 Rationale (42) — the largest category**
- Why was it done this way? (14)
- Why wasn't it done this other way? (15)
- Was this intentional, accidental, or a hack? (9)
- How did this ever work? (4)

**4.1.5 History (23)**
- When, how, by whom, and why was this code changed or inserted? (13)
- What else changed when this code was changed or inserted? (2)
- How has it changed over time? (4)
- Has this code always been this way? (2)
- What recent changes have been made? (1)
- Have changes in another branch been integrated into this branch? (1)

**4.1.6 Implications (21)**
- What are the implications of this change for (5) API clients (5), security (3), concurrency (3), performance (2), platforms (1), tests (1), or obfuscation (1)? (21)

**4.1.7 Refactoring (25)**
- Is there functionality or code that could be refactored? (4)
- Is the existing design a good design? (2)
- Is it possible to refactor this? (9)
- How can I refactor this (2) without breaking existing users (7)? (9)
- Should I refactor this? (1)
- Are the benefits of this refactoring worth the time investment? (3)

**4.1.8 Testing (20)**
- Is this code correct? (6)
- How can I test this code or functionality? (9)
- Is this tested? (3)
- Is the test or code responsible for this test failure? (1)
- Is the documentation wrong, or is the code wrong? (1)

**4.1.9 Building and branching (11)**
- Should I branch or code against the main branch? (1)
- How can I move this code to this branch? (1)
- What do I need to include to build this? (3)
- What includes are unnecessary? (2)
- How do I build this without doing a full build? (1)
- Why did the build break? (2)
- Which preprocessor definitions were active when this was built? (1)

**4.1.10 Teammates (16)**
- Who is the owner or expert for this code? (3)
- How do I convince my teammates to do this the "right way"? (12)
- Did my teammates do this? (1)

#### 4.2 Questions about Elements

**4.2.1 Intent and Implementation (32) — second largest**
- What is the intent of this code? (12)
- What does this do (6) in this case (10)? (16)
- How does it implement this behavior? (4)

**4.2.1[sic] Method properties (2)** — *duplicate section number in the original*
- How big is this code? (1)
- How overloaded are the parameters to this function? (1)

**4.2.2 Location (13)**
- Where is this functionality implemented? (5)
- Is this functionality already implemented? (5)
- Where is this defined? (3)

**4.2.3 Performance (16)**
- What is the performance of this code (5) on a large, real dataset (3)? (8)
- Which part of this code takes the most time? (4)
- Can this method have high stack consumption from recursion? (1)
- How big is this in memory? (2)
- How many of these objects get created? (1)

**4.2.4 Concurrency (9)**
- What threads reach this code (4) or data structure (2)? (6)
- Is this class or method thread-safe? (2)
- What members of this class does this lock protect? (1)

#### 4.3 Questions about Element Relationships

**4.3.1 Contracts (17)**
- What assumptions about preconditions does this code make? (5)
- What assumptions about pre(3)/post(2)conditions can be made? (5)
- What exceptions or errors can this method generate? (2)
- What are the constraints on or normal values of this variable? (2)
- What is the correct order for calling these methods or initializing these objects? (2)
- What is responsible for updating this field? (1)

**4.3.2 Control flow (19)**
- In what situations or user scenarios is this called? (3)
- What parameter values does each situation pass to this method? (1)
- What parameter values could lead to this case? (1)
- What are the possible actual methods called by dynamic dispatch here? (6)
- How do calls flow across process boundaries? (1)
- How many recursive calls happen during this operation? (1)
- Is this method or code path called frequently, or is it dead? (4)
- What throws this exception? (1)
- What is catching this exception? (1)

**4.3.3 Dependencies (5)**
- What depends on this code or design decision? (4)
- What does this code depend on? (1)

**4.3.4 Data flow (14)**
- What is the original source of this data? (2)
- What code directly or indirectly uses this data? (5)
- Where is the data referenced by this variable modified? (2)
- Where can this global variable be changed? (1)
- Where is this data structure used (1) for this purpose (1)? (2)
- What parts of this data structure are modified by this code? (1)
- What resources is this code using? (1)

**4.3.5 Type relationships (15)**
- What are the composition, ownership, or usage relationships of this type? (5)
- What is this type's type hierarchy? (4)
- What implements this interface? (4)
- Where is this method overridden? (2)

**4.3.6 Architecture (11)**
- How does this code interact with libraries? (4)
- What is the architecture of the code base? (3)
- How is this functionality organized into layers? (1)
- Is our API understandable and flexible? (3)

---

### A.3 Ko et al. (TSE 2006) — behavioral findings, not a question list

This paper is a **cost model, not a catalog**. Its value is quantifying how expensive answering these questions is. 31 developers recruited, analysis focused on **10** most experienced with Java; 5 tasks (2 debugging, 3 enhancement), 70 minutes, Eclipse, ~2,870 transcribed actions.

Key quantified findings, directly usable as difficulty weights:

- **35% of time on navigation mechanics.** *"developers to spend, on average, 35 percent of their time performing the mechanics of navigation within and between source files"* — an average of 19 minutes of the non-interrupted time.
- **88% of searches fail.** *"An average of 88 percent (± 11) of developers' searches led to nothing of later use in the task."*
- **36% of time inspecting irrelevant code** — an average of 25 (± 9) minutes.
- **Misleading names drive wrong starts.** On the YELLOW task, *"half of them first inspected the PencilPaint class, but the file that was actually relevant was the generically named PaintWindow."* The authors name this the vocabulary problem.
- **Navigation volume:** average 65 (± 18) dependency navigations per 70-minute session; 58% direct, 42% indirect.
- **Relevance is sparse and scattered:** developers deemed ~7% of a 508-line program relevant, and returned to relevant code an average of 18 (± 9) times (THICKNESS) and 12 (± 9) times (LINE).
- Ko's model (search → relate → collect) matches Sillito's four-category structure closely: *finding initial focus points* = searching, *building on points / subgraph* = relating.

---

## Part B: Derivability Triage

Legend: **[STATIC]** parse/analyze code · **[HISTORY]** git/PR/issue mining · **[RUNTIME]** execution traces · **[HUMAN]** needs a person who was there · **[LLM-INFERENCE]** plausible guess, unverifiable.

A label in `[A → B]` form means *A gets you most of the way, B closes the gap*. Percentages are my engineering judgment, not from the papers.

### B.1 Cleanly STATIC (build these first; they are correctness-checkable)

| Question | Source | Triage | Caveat |
|---|---|---|---|
| Where is this defined? | LaToza Location | **[STATIC]** | Trivially exact with an index |
| Where is this method called or type referenced? | Sillito 12 | **[STATIC]** | Exact modulo dynamic dispatch |
| Where are instances of this class created? | Sillito 14 | **[STATIC]** | Exact modulo reflection/DI |
| What does the declaration or definition of this look like? | Sillito 17 | **[STATIC]** | Exact |
| What are the arguments to this function? | Sillito 18 | **[STATIC]** | Exact |
| Where does this type fit in the type hierarchy? / siblings / field declared where | Sillito 8, 9, 10 | **[STATIC]** | Exact |
| Who implements this interface or these abstract methods? | Sillito 11 | **[STATIC]** | Exact (closed world) |
| What are the parts of this type? / Which types is this type a part of? | Sillito 6, 7 | **[STATIC]** | Exact |
| What implements this interface? / type hierarchy / where overridden | LaToza Type relationships | **[STATIC]** | Exact |
| Where is this variable or data structure being accessed? | Sillito 15 | **[STATIC]** | Exact for lexical scope |
| What code directly or indirectly uses this data? | LaToza Data flow | **[STATIC]** | Indirect use needs interprocedural analysis; precision degrades |
| What is the original source of this data? | LaToza Data flow | **[STATIC]** | Backward slicing; thin slicing exists |
| Where can this global variable be changed? | LaToza Data flow | **[STATIC]** | Exact |
| What does this code depend on? | LaToza Dependencies | **[STATIC]** | Exact |
| What depends on this code? | LaToza Dependencies | **[STATIC]** | Exact for code; **[HUMAN]** for "…or design decision" |
| What includes are unnecessary? | LaToza Building | **[STATIC]** | Exact |
| How big is this code? / parameter overloading | LaToza Method properties | **[STATIC]** | Trivial |
| Is there an entity named something like this in that unit? | Sillito 5 | **[STATIC]** | Fuzzy match; Ko's vocabulary problem limits recall |
| What throws / What is catching this exception? | LaToza Control flow | **[STATIC]** | Exact in checked-exception languages; weaker elsewhere |
| Is this method or code path called frequently, or is it dead? | LaToza Control flow | **[STATIC + RUNTIME]** | Static gives *reachable*; only runtime gives *frequently* |
| What are the possible actual methods called by dynamic dispatch here? | LaToza Control flow (6) | **[STATIC]** | **Soundness-limited** — the classic over-approximation problem |

### B.2 STATIC but precision-limited (the "soundiness" band)

These *look* static but degrade badly in real codebases with reflection, DI, dynamic dispatch, callbacks, and cross-process calls. Sillito observed exactly this: *"for questions about connections involving polymorphism, inheritance events and reflection... the results were more noisy and more difficult to interpret."*

| Question | Triage | Why it degrades |
|---|---|---|
| How is control getting (from here to) here? (Sillito 29) | **[STATIC → RUNTIME]** | Static path enumeration explodes; a trace answers it exactly |
| Which execution path is being taken in this case? (Sillito 31) | **[RUNTIME]** | "in this case" is a concrete execution |
| Under what circumstances is this method called or exception thrown? (Sillito 32) | **[STATIC → RUNTIME]** | Static gives candidate conditions; runtime confirms reachable ones |
| In what situations or user scenarios is this called? (LaToza) | **[RUNTIME → HUMAN]** | "User scenario" is a product-level concept absent from code |
| How do calls flow across process boundaries? | **[STATIC-weak → RUNTIME]** | Static analysis usually stops at the process edge |
| What threads reach this code or data structure? | **[STATIC]** | Solved by thread coloring per the paper; sound tooling exists |
| Is this class or method thread-safe? | **[STATIC-weak → HUMAN]** | Thread-safety is an *intended contract*, only partly checkable |
| What assumptions about preconditions does this code make? | **[STATIC-weak → HUMAN]** | Inferable assertions ≠ intended contract. LaToza: contracts *"only describe assumptions that the original developer decided to express"* |
| What is the correct order for calling these methods? | **[STATIC-weak → HUMAN]** | Typestate can express it; it is rarely written down |
| What is the "correct" way to use or access this data structure? (Sillito 26) | **[HUMAN → LLM-INFERENCE]** | "Correct" is a convention, not a property of the code |

### B.3 RUNTIME (needs execution)

| Question | Source | Triage |
|---|---|---|
| How did this runtime state occur? (12 — top debugging question) | LaToza | **[RUNTIME]** — WhyLine-class omniscient debugging; *not* available for crash dumps |
| What runtime state changed when this executed? | LaToza | **[RUNTIME]** |
| Where was this variable last changed? | LaToza | **[RUNTIME]** (dynamic last-write) |
| Why didn't this happen? | LaToza | **[RUNTIME]** — the "why not" question; WhyLine's core contribution |
| Why isn't control reaching this point in the code? (Sillito 30) | Sillito | **[RUNTIME]** — same shape as above |
| What are the values of these arguments at runtime? (Sillito 19) | Sillito | **[RUNTIME]** |
| How does this data structure look at runtime? (Sillito 27) | Sillito | **[RUNTIME]** |
| When during the execution is this method called? (Sillito 13) | Sillito | **[RUNTIME]** (call stack) |
| In what circumstances does this bug occur? | LaToza | **[RUNTIME → HUMAN]** — environment-dependent; LaToza notes environments *"that could not be recreated locally"* |
| How do I debug this bug in this environment? | LaToza | **[HUMAN]** — a procedural/tooling question, not a code question |
| Performance: which part takes the most time / memory / object counts | LaToza Performance | **[RUNTIME]** — profilers already solve this. LaToza: *"It is unclear what missing functionality could be added"* |
| How many recursive calls happen during this operation? | LaToza | **[RUNTIME]** |

### B.4 HISTORY (git/PR/issue mining — the under-exploited seam)

| Question | Source | Triage | Reliability |
|---|---|---|---|
| When, how, by whom was this code changed or inserted? (13) | LaToza History | **[HISTORY]** | **Near-exact.** Blame/log answers who/when/what mechanically |
| …and **why** was this code changed? (same question) | LaToza History | **[HISTORY → HUMAN]** | **The pivot point.** Who/when/what are free; *why* depends entirely on commit-message quality — see Part C |
| What else changed when this code was changed or inserted? | LaToza History | **[HISTORY]** | Exact — the commit is the unit of co-change |
| How has it changed over time? | LaToza History | **[HISTORY]** | Exact, but LaToza notes tools force *"searching through all changes at the file level"* when developers want **snippet-level** history |
| Has this code always been this way? | LaToza History | **[HISTORY]** | Exact |
| What recent changes have been made? | LaToza History | **[HISTORY]** | Exact |
| Have changes in another branch been integrated into this branch? | LaToza History | **[HISTORY]** | Exact (cherry-pick/merge detection) |
| Who is the owner or expert for this code? (3) | LaToza Teammates | **[HISTORY]** | **Strong.** Expertise-browser style contribution mining works well |
| Which team's component caused this bug? | LaToza Debugging | **[HISTORY + STATIC]** | Ownership map + blame; LaToza notes some devs debug *only* to route the bug |
| Did my teammates do this? | LaToza Teammates | **[HISTORY]** | Exact |
| Is there a precedent or exemplar for this? (Sillito 4) | Sillito | **[STATIC + HISTORY]** | Find similar past changes — strong, under-served |
| What will be (or has been) the direct impact of this change? (Sillito 42) | Sillito | **[STATIC]** for direct refs; **[HISTORY]** for "has been" |
| What will be the total impact of this change? (Sillito 43) | Sillito | **[STATIC-weak + HISTORY]** | Transitive static impact over-approximates; co-change history often predicts better |
| Why did the build break? | LaToza Building | **[HISTORY + RUNTIME]** | Bisect + CI logs; largely mechanizable |

### B.5 HUMAN (irreducible — no derivable source)

| Question | Source | Why irreducible |
|---|---|---|
| **Why wasn't it done this other way? (15)** | LaToza Rationale | **The hardest question in the literature.** The alternative was never written down because it was never built. No artifact records a road not taken unless a human wrote it down. |
| Was this intentional, accidental, or a hack? (9) | LaToza Rationale | Requires the author's mental state. Code cannot distinguish deliberate from careless. |
| How did this ever work? (4) | LaToza Rationale | Usually implies a false premise; needs archaeology + a witness |
| How do I convince my teammates to do this the "right way"? (12) | LaToza Teammates | Social, not technical. LaToza: *"No research has yet investigated how consensus on such conventions forms"* |
| Is the existing design a good design? | LaToza Refactoring | Value judgment |
| Should I refactor this? / Are the benefits worth the time investment? | LaToza Refactoring | Requires business context and cost of delay |
| What's the best design for implementing this? | LaToza Implementing | Judgment under local constraints |
| Is our API understandable and flexible? | LaToza Architecture | Requires users, not code |
| What is the policy for doing this? (10) | LaToza Policies | **[HUMAN → HISTORY]** partially — policy may exist in an unwritten team norm. Paper calls it *"an open, unexplored problem"* |
| Will this completely solve the problem? (Sillito 44) | Sillito | Requires knowing the true requirement |
| Where in the UI should this functionality be added? (Sillito 39) | Sillito | Design judgment |

### B.6 LLM-INFERENCE (plausible, unverifiable — handle with care)

This is the band where an LLM is *most tempting and most dangerous*, because the output is fluent and unfalsifiable.

| Question | Source | Risk |
|---|---|---|
| What is the intent of this code? (12) | LaToza Intent | An LLM will always produce a confident intent. It is describing *what the code does*, then relabeling it as *what it was meant to do*. When code is buggy these differ — and that gap is exactly what the developer is asking about. **Highest-value, highest-risk.** |
| What does this do in this case? (16) | LaToza Intent | Tractable when "this case" can be pinned to a concrete input — then it is **[RUNTIME]** and verifiable. Left abstract, it is a guess. |
| How does it implement this behavior? | LaToza Intent | **[STATIC + LLM]** — a summarization task over a verified slice; safe if the slice is real |
| Why was it done this way? (14) | LaToza Rationale | **[HISTORY → LLM-INFERENCE]** — see Part C. Retrieved evidence = good; unretrieved = fabrication |
| Which type represents this domain concept? (Sillito 1) | Sillito | **[STATIC + LLM]** — embedding/semantic search over identifiers; mitigates Ko's vocabulary problem. **Verifiable** because the answer is a code location the developer can check |
| Where is there any code involved in the implementation of this behavior? (Sillito 3) | Sillito | **[STATIC + LLM]** — same; feature location, verifiable output |
| Is this functionality already implemented? | LaToza Location | **[STATIC + LLM]** — semantic search; verifiable |
| What is the behavior these types provide together? (Sillito 25) | Sillito | **[STATIC + LLM]** — summarization over a real subgraph |
| What are the differences between these files/types? (Sillito 35, 36) | Sillito | **[STATIC + LLM]** — structural diff is exact; the *significance* of the difference is inference |
| Is this code correct? (6) | LaToza Testing | **[HUMAN]** at root — needs a spec. An LLM guessing at correctness manufactures false confidence |
| What are the implications of this change for security/concurrency/API clients? (21) | LaToza Implications | **[STATIC + LLM]**, verifiable only for the call-graph part; security/concurrency judgments are unsound guesses |

### B.7 Triage summary (by question mass)

Using LaToza report counts as the weight:

| Band | Approx. reports | Share |
|---|---|---|
| HUMAN-rooted (incl. Rationale 42, Teammates 16, parts of Refactoring/Policies) | ~95 | ~27% |
| STATIC (incl. relationships, data/control flow, location) | ~105 | ~30% |
| RUNTIME (Debugging 26, Performance 16, parts of control flow) | ~55 | ~15% |
| HISTORY (History 23, ownership, co-change) | ~30 | ~8% |
| LLM-INFERENCE-dependent (Intent 32, parts of Implementing) | ~45 | ~13% |
| Mixed/process (Building, Testing) | ~30 | ~8% |

**The headline for tool design: roughly a quarter of hard questions have no derivable source at all, and the single largest category (Rationale, 42) sits almost entirely in that quarter.**

---

## Part C: The Rationale Problem

### C.1 The precise rationale questions

From LaToza 4.1.4, **42 reports — the most frequent category**, verbatim:

| Question | Reports | Triage |
|---|---|---|
| Why wasn't it done this other way? | **15** | **[HUMAN]** — unrecorded counterfactual |
| Why was it done this way? | **14** | **[HISTORY → HUMAN]** |
| Was this intentional, accidental, or a hack? | **9** | **[HUMAN]** |
| How did this ever work? | **4** | **[HISTORY + RUNTIME → HUMAN]** |

Adjacent rationale-bearing questions elsewhere in the catalog:
- *When, how, by whom, and **why** was this code changed or inserted?* (13, History)
- *What depends on this code **or design decision**?* (4, Dependencies)
- *What is the policy for doing this?* (10, Policies)
- *Is this the correct policy for doing this?* (2, Policies)

**Total rationale-bearing mass: ~71 of 371 reports (~19%).**

The paper's own framing of *what kinds of decisions* trigger these questions is directly useful as a tool's trigger list — verbatim: *"naming, code structure, inheritance relationships, where resources are freed, code duplication, lack of instrumentation, lack of refactoring, reimplimenting instead of reusing, algorithm choice, optimizations, where behavior is implemented, parameter validation, visibility, and exception policies."*

### C.2 Why this is structurally hard (the paper's own diagnosis)

LaToza is unusually explicit, and each sentence kills a candidate solution:

> *"While some rationale questions could be answered by implementing a change and testing, most of the reported decisions concerned **non-functional properties where testing or verification is not possible**."*

> *"Despite their prevalence, effective support for answering rationale questions remains an **open problem**. A popular strategy – ask an expert teammate – **interrupts the teammate**, interrupts the question asker when the teammate is unavailable, and **does not work when the teammate has left the company**."*

> *"Systems for explicitly representing rationale have been devised, but have mostly focused on **higher-level decisions earlier in the life cycle**."*

> *"Comments might also help, but **require future questions to be anticipated**, the comments to be **correctly updated**, and the author to **make the time investment**. Moreover, some questions reflected questions about decisions that are **infrequently commented**."*

That last sentence is the core economic problem: **rationale capture is a cost paid by the author for a benefit received by a stranger, at an unknown future time, for a question the author cannot predict.** This is why every voluntary-capture mechanism decays.

### C.3 Source-by-source reliability assessment

Ordered best to worst by what I could actually verify. **Where I am reasoning rather than citing, I say so.**

**1. Code review threads — the strongest empirically-attested source.**
This is the one claim in Part C I can support with a retrieved primary source. Bacchelli & Bird (ICSE 2013) quote Sutherland & Venolia's Microsoft finding verbatim:

> *"the meat of the code review dialog, no matter what medium, is the **articulation of design rationale**"* and thus *"code reviews are an **enticing opportunity for capturing design rationale**."*

Bacchelli & Bird also confirm the demand side, citing LaToza directly: *"many problems encountered by developers were related to understanding the rationale behind code changes."*

**But the same paper shows the capture is aspirational, not achieved.** In their survey of 873 developers/testers, *"Track Rationale"* ranks **second-to-last** among motivations for doing code review (above only "Team Assessment"), and again near the bottom among *outcomes*. So rationale is articulated in review dialogue as a by-product, while almost nobody reviews *in order to* record it — and nothing is designed to make it retrievable later.
**Reliability: high-density where review threads are substantive; unindexed, unlinked to the line, and decays as review culture thins. This is the best available seam and the most under-exploited.**

**2. Commit messages.** Mechanically complete for *who/when/what*, unreliable for *why*. Retrieved corroboration, from the 2026 "3100 Opinions" paper's related work: AI-authored *"commit messages [are] more descriptive than rationale-capturing"* — i.e. they restate the diff rather than explain it, and this is measurably worsening in the AI era.
**Reliability: high for metadata, low and declining for rationale.**

**3. Issue trackers / PR descriptions.** Bacchelli's interviews show developers rely on the change description precisely when they lack context, and that a good one *"states what was changed and why"* — but the same passage records the counter-view: *"people can say they are doing one thing, while they are doing many more of them,"* and *"the description is not enough."*
**Reliability: moderate; best for the *motivating* why (what the change was for), poor for the *design* why (why this shape over another).**

**4. ADRs (Architecture Decision Records).** The only artifact that directly records *"why not the alternative"* — the exact shape of LaToza's top question (15 reports). But LaToza's critique of formal rationale systems applies: they capture *"higher-level decisions earlier in the life cycle,"* not the method-level decisions that generate these questions. Coverage is typically a handful of documents against millions of lines.
**Reliability: very high precision where present, near-zero recall. (Assessment, not a retrieved measurement.)**

**5. Code comments.** LaToza's four objections above. Additionally Ko found comments serve mainly as *relevance cues* during search rather than as rationale stores.
**Reliability: low and silently stale — the worst failure mode, since a wrong comment is confidently believed.**

**6. Chat (Slack/Teams).** Highest raw rationale density, worst structure: no linkage to code, poor retention, high noise.
**Reliability: unindexable in practice without dedicated linking. (Assessment, not retrieved.)**

**7. Design docs.** Same shape as ADRs — high precision, low recall, drifts from the code.

### C.4 Is this solved, hard, or a dead end?

**Verdict: hard, structurally — and it decomposes into one tractable half and one genuinely impossible half.**

- **Tractable:** *"Why was it done this way?"* (14) and *"When/by whom/why was this changed?"* (13) are **retrieval problems**. The evidence often exists — in review threads and linked issues — but is not indexed against the line of code. Building that index is engineering, not research. Bacchelli/Sutherland & Venolia establish the raw material is genuinely there.
- **Impossible to derive:** *"Why wasn't it done this other way?"* (15, the single most-reported question) asks about an alternative that, by definition, left no artifact unless a human wrote it down. **No amount of mining recovers a decision that was never recorded.** A tool can at best *surface the alternatives that were discussed* (review threads sometimes contain rejected suggestions — a real and under-used signal) and honestly report silence otherwise.
- **The dead end is LLM-generated rationale.** Asking a model "why was this written this way?" without retrieved evidence produces a fluent, plausible, unfalsifiable answer — the single worst outcome for a comprehension tool, because it *feels* like an answer and forecloses the search. This is the "surface plausibility" failure the 2026 code-review paper documents. **Design rule: rationale answers must be quoted from a retrieved artifact with a link, or the tool must say "no recorded rationale found."**

### C.5 Gap I must flag

**I could not retrieve any empirical study of mining design rationale from repositories with reported accuracy/coverage figures.** WebSearch was exhausted (200/200 calls) before I could issue those queries, and none of the ~26 PDFs already on disk contains such a study — I scanned all of them for `design rationale|rationale mining|rationale extraction|classifier.*rationale|F1` and found only the incidental mentions cited above.

So **Part C's request for "what accuracy/coverage does it achieve" is unanswered**, and I am not going to invent numbers. Known-relevant work I would target with a restored search budget:
- Rogers et al. — rationale in commit messages
- Alkadhi et al. — rationale in team chat (IRC/HipChat), which reports annotation/classifier performance
- Viviani & Murphy — design discussions in pull requests
- Ko, DeLine & Venolia, "Information Needs in Collocated Software Development Teams" (ICSE 2007) — LaToza's `[15]`, the source of many cross-citations above
- LaToza & Myers, "Developers Ask Reachability Questions" (ICSE 2010) — the parent study of the PLATEAU survey

To lift the cap: `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`.

---

## Part D: Scoring — the 10 questions to target first

**Scoring model.** Three factors, 1-5 each, multiplied:

- **Frequency (F):** LaToza report count and/or Sillito session breadth.
- **Difficulty (D):** how poorly current tools serve it — Ko's 88% failed-search and 35% navigation overhead are the empirical anchor for "hard."
- **Tractability (T):** is there a *derivable, verifiable* source? **This is the veto factor** — HUMAN-only questions score T=1 and are deliberately excluded no matter how frequent.

Score = F × D × T (max 125).

| # | Question | Source | F | D | T | Score | Derivation |
|---|---|---|---|---|---|---|---|
| 1 | **When, how, by whom, and why was this code changed?** | LaToza History (13) | 4 | 5 | 4 | **80** | **[HISTORY]** — who/when/what exact; *why* via linked PR/review thread. Snippet-level, not file-level, is the unmet need |
| 2 | **What is the intent of this code?** | LaToza Intent (12) | 5 | 5 | 3 | **75** | **[STATIC + LLM]** *grounded in retrieved history*. T capped at 3: unverifiable unless evidence-linked |
| 3 | **Where is there any code involved in the implementation of this behavior?** | Sillito 3 (8 sessions) | 5 | 5 | 3 | **75** | **[STATIC + LLM]** feature location. Directly attacks Ko's 88% search-failure rate. Output is a code location → verifiable |
| 4 | **How did this runtime state occur?** | LaToza Debugging (12) | 4 | 5 | 3 | **60** | **[RUNTIME]** — WhyLine proved feasible; unsolved for crash dumps/prod |
| 5 | **What will be the total impact of this change?** | Sillito 43 (7 sessions) | 4 | 5 | 3 | **60** | **[STATIC + HISTORY]** — static transitive closure over-approximates; co-change history disambiguates |
| 6 | **Which type represents this domain concept or UI element?** | Sillito 1 (7 sessions) | 5 | 4 | 3 | **60** | **[STATIC + LLM]** — the vocabulary problem, verifiable output |
| 7 | **What are the possible actual methods called by dynamic dispatch here?** | LaToza Control flow (6) | 3 | 5 | 4 | **60** | **[STATIC]** — precision, not possibility, is the gap; a ranked/filtered answer beats today's noise |
| 8 | **Why wasn't it done this other way?** | LaToza Rationale (15) | 5 | 5 | 2 | **50** | **[HUMAN]**, partially **[HISTORY]**. T=2 *only* for surfacing explicitly-rejected alternatives in review threads. **Include for honest-negative answering** |
| 9 | **Is there a precedent or exemplar for this?** | Sillito 4 (6 sessions) | 3 | 4 | 4 | **48** | **[STATIC + HISTORY]** — "show me past changes shaped like mine." Badly under-served today |
| 10 | **What assumptions about preconditions does this code make?** | LaToza Contracts (5+5) | 3 | 5 | 3 | **45** | **[STATIC-weak + HISTORY]** — inferred assertions + crashes/fixes that revealed violated assumptions |

### Deliberately excluded despite high frequency

| Question | Reports | Why excluded |
|---|---|---|
| How do I convince my teammates to do this the "right way"? | 12 | T=1, purely social |
| What is the policy for doing this? | 10 | T=1-2; no derivable source. High value if a team *writes* policies — then it becomes retrieval |
| Was this intentional, accidental, or a hack? | 9 | T=1; an LLM guess here is actively harmful |
| How can I refactor this without breaking existing users? | 9 | Partly **[STATIC]** (callers) but the hard half is judgment |
| What is the performance of this code? | 8 | Solved by profilers; LaToza says so |
| Is this code correct? | 6 | T=1 without a spec |

### Design rules implied by the triage

1. **Never answer a HISTORY or RATIONALE question without a link to the artifact.** Quote the commit/PR/thread. No retrieved evidence → say so. (Part C.4.)
2. **"No recorded rationale found" is a correct, valuable answer.** It tells the developer to stop digging and go ask a person — which Ko shows is cheaper than 25 minutes in irrelevant code.
3. **Prefer questions whose answers are code locations.** They are checkable in one click, which makes LLM assistance safe (#3, #6).
4. **Snippet granularity, not file granularity** — LaToza's explicit complaint about history tools.
5. **Attack search failure first.** Ko: 88% of searches fail, 36% of time in irrelevant code. Questions #3 and #6 target the single largest measured time sink.

---

## Part E: AI-generated code — partial substitution

The requested 2024-2026 catalog work on questions about AI-generated code **could not be searched for** (budget exhausted). Three retrieved papers bear on it:

**"3100 Opinions on Code Review in an AI World" (arXiv 2607.07980, CMU, 2026)** — 38,709 grey-literature documents, 3,100 coded, yielding 26 constructs and 67 relationships. It names the construct that matters most here: **"Code opacity (lost intent)"**, verbatim:

> *"AI-written code arrives without a design rationale, since **no human author formed the intent and there is no one to ask** why the code is the way it is."*

Its three documented consequences, verbatim: *"it directly lowers review efficiency, because an engaged reviewer must **reconstruct the intent** rather than check against it"*; *"it lowers review effectiveness even at full effort, because **the yardstick for judging correctness, the intent itself, is gone**"*; and *"it lowers motivation, because reviewing code whose **rationale can never be recovered** is draining."* Practitioner quotes: *"One reason AI-generated code is harder to review is that you're reconstructing intent"* (G2066); *"You can't meaningfully review code you didn't write and don't understand"* (G2413).

**This is the decisive finding for tool design.** LaToza's rationale problem was *"the person who knew has left the company."* For AI-generated code it becomes *"the rationale never existed."* Mining cannot recover what was never formed — so for AI-authored code the only viable strategy is **capture at generation time** (record the prompt, the alternatives considered, the constraints given) rather than archaeology afterward. A tool that captures intent *as code is generated* addresses the top-frequency question category at its source, which no post-hoc miner can do.

**"Code Comprehension with GitHub Copilot" (Qiao et al., OSU)** — 15 graduate students, within-subjects. Comprehension-performance decoupling: significant performance gains but *no* comprehension improvement (p = 0.59); performance gains **negatively** correlated with reverse-engineering comprehension (ρ = −0.57, p = 0.026). Crucially: *"Engaging in verification loops in which programmers actively reviewed generated code strongly predicted comprehension (p < 0.001, r = 0.96), with high-comprehension participants verifying code 4.7 times more frequently."* → Tools should force verification loops, not summarize away the need for them.

**"Echoes of AI" (Borg et al., preregistered, 151 participants, 95% professional)** — Phase 2 found *"no significant differences in subsequent evolution with respect to completion time or code quality"*; Bayesian analysis suggests any effect was *"at most small and highly uncertain."* Useful as a corrective: the maintainability panic is not yet empirically supported.

---

## Gaps — explicitly flagged

1. **Rationale-mining accuracy/coverage studies — NOT RETRIEVED.** The central empirical question of Part C is unanswered. No fabricated figures supplied. (Cause: WebSearch budget 200/200 exhausted on the first tool call of this task.)
2. **LaToza & Myers, "Developers Ask Reachability Questions" (ICSE 2010) — NOT RETRIEVED.** This is the parent study; the PLATEAU survey was *"part of a larger study investigating reachability questions."* It contains ratings of **14 control-flow questions** that would materially sharpen Part D's frequency weights.
3. **Ko, DeLine & Venolia (ICSE 2007) — NOT RETRIEVED.** Cited throughout LaToza as `[15]` (21 questions); 11 of those 21 recurred in LaToza's data.
4. **Fritz & Murphy (ICSE 2010) — NOT RETRIEVED.** LaToza's `[7]`; 78 questions integrating code, work items, change sets, teams, comments, web. 10 recurred in LaToza. **This is the most relevant missing catalog for a tool spanning code + history.**
5. **LaToza 21st category.** Paper claims 21; extraction yields 20 headers (one duplicate `4.2.1` label) summing to 355 of 371 reports. Likely an error in the original paper.
6. **Sillito 2008 TSE extension** (`[24]` in LaToza) not retrieved — the expanded journal version of the FSE 2006 paper.
