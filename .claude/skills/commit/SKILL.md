---
name: commit
description: Write a commit in jbw9/understand-slop. Every commit is a title only, in the form `area: summary`. Use for every commit in this repo, in every directory and on every branch, and when the user invokes /commit.
---

# Commit

## Format

A commit is a title only, in the form `area: summary`.

- `area` is the lowercase product part the commit changes: `app`, `canvas`, `terminal`, `tabs`, `projects`, `generate`, `preview`, `workspace`, `landing`, `repo`.
- `summary` is lowercase and short. It says what the product does after the commit, not what code changed.
- No trailing period, no body and no co-author line.

## Examples

- `terminal: click a file to open it in an editor tab`
- `app: maps of large repos generate on Windows; the author's system prompt no longer overflows the command line`
- `repo: every checkout and worktree gets the demo-gif skill and the commit rules`

Not like this:
- `Fix spawn bug in claude-code.ts` - names the code, not the behaviour, and has no area
- `app: The app now opens Markdown as a preview.` - capitalised, trailing period

## Steps

1. Read the staged diff (`git diff --cached`) and pick the one area it changes most.
2. Write the title, then commit with `git commit -m "<title>"`.
3. If the diff holds two unrelated changes, make two commits.
4. After you push a commit that changes what a person sees, run the `demo-gif` skill.
