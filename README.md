bombed my onsite interview bcs i dont understand the code :(

# understand-slop

See a codebase as a map of cards, and edit it from there:
- the top layer is what a person sees: pages, UI and the journey between them;
- one click down is the data flow behind it;
- below that is the code, which you edit in the card and save straight to the file.

## Install (once)

```sh
cd ~/projects/understand-slop
npm install           # installs the app's deps (in ui/)
npm link              # puts `slop` on your PATH
slop install-skill    # adds /slop-map to Claude Code (~/.claude/skills)
```

## Use it on a repo

```sh
cd ~/projects/anything
claude                # then: /slop-map   — Claude reads the repo and writes .slop/story.json
slop                  # indexes the code, checks the story, opens the map in your browser
```

The first `slop` builds the app, which takes about a minute. After that it starts in a couple of seconds.

In the browser:
- Click a card to go down a layer, and use back (or the mouse's back button) to come up again.
- In the code pane, edit a function's signature or body in place. **save** (or Ctrl+S) writes it to the file.
- If the file changed on disk since the map loaded, the save is refused rather than overwriting it.

When the code moves on, just run `slop` again. The code side is re-read every time, so line numbers and bodies are never stale. A card whose function was renamed or deleted turns red and says so. Run `/slop-map` again to update the story; it keeps the existing card ids, so links still work.

## Where things live

| | |
|---|---|
| `.slop/story.json` | The story: cards, flows, links. Written by Claude, so commit it. It names code only by id (`src/lib/vault.ts#removeVault`). |
| `.slop/index.json` | Every function, class and method, read from the code. Rebuilt by `slop`, and git-ignored. |

## Commands

```
slop [dir]            index, check, serve on 127.0.0.1, open the browser
slop index [dir]      rebuild .slop/index.json
slop symbols [dir] [text]   list the units (what a story can point at)
slop check [dir]      validate the story; errors exit 1, drift is a warning
slop schema           the JSON Schema a story is written against
slop demo             the bundled example maps (snecko, VisuLearn), read-only
slop install-skill    (re)install /slop-map for Claude Code
```

Only TypeScript and JavaScript are indexed. A story can still quote any other file with an anchored `source` block. This repo maps itself: run `slop` here.
