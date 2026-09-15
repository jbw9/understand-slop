# understand-slop

## The plan is empty

Deliberately. Everything previously here — stack, scope, sequencing, the three
states, the question targets — was written against a different idea of what this
is, and is no longer authoritative. It is in git history if it is ever wanted.

Nothing below is settled. This file holds the problem only, and stays that way
until something has been tested rather than argued.

## The problem

Code gets written faster than anyone can read it. The mistakes that matter are
architectural, and they surface months later, when fixing them means
understanding a large amount of code nobody ever read.

Reading it all is not possible and will not become possible. So the goal is a
high-level view of a project that a developer can hold in their head, with the
ability to drill into any part of it down to the code itself — showing enough at
each level to be understood, and no more.

Open questions, all genuinely open:

- Whether the top level is the repo's architecture or the product's components.
- How many levels there are, and what makes each one worth existing.
- How much belongs on screen at any level before it becomes clutter.
- What the bottom level is, and whether "why it was done this way" can be
  answered honestly there.

## What exists

A UI prototype in `ui/`, running on a hand-written fixture. No repository is
analysed yet. The current focus is the experience — what a developer sees, and
what happens when they go deeper — ahead of how any of it would be computed.
