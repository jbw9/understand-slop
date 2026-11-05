---
name: demo-gif
description: After a commit to jbw9/understand-slop that changes what a person sees in Bluprint (app/) or on the landing page (landing/) is pushed, record a short GIF of the change, add it to the `demos` prerelease, and post it as a comment on that commit. Use when a UI commit has been pushed, when the user asks for a demo or GIF of a change, or when they invoke /demo-gif. Skip commits that change only logic.
---

# Demo GIF

Each pushed UI change gets one GIF. The GIF plays in two places:
- on the commit's page, as a commit comment
- on the [`demos` prerelease](https://github.com/jbw9/understand-slop/releases/tag/demos), under the commit's title

The repo stays small, because the GIF is a release asset and not a file in git. Use GIFs only. An MP4 release asset downloads instead of playing.

In this file, `<root>` is the checkout's top folder (`git rev-parse --show-toplevel`). The scripts are in `<root>/.claude/skills/demo-gif/scripts/`.

## Step 1 - Gate: is this a UI change?

Make a GIF only if a person using Bluprint or the landing page can see a difference on screen.

Read the diff with `git show --stat <sha>`, then read the parts you are not sure about. The commit title's `area:` is a first hint, but not the answer.

**Make a GIF** if the commit changes any of these:
- what `app/components/`, `app/app/` or `landing/` draws: JSX, `className`, `globals.css`, tokens, icons, images
- copy that is shown on screen
- how the UI responds: drag, click, hover, keyboard, motion, layout at a window size

**Skip** if the commit changes only these:
- `app/lib/` logic, `app/app/api/` routes, `app/scripts/` (generate, verify, plan), `app/src-tauri/` Rust
- tests, types, lint, config, `.gitignore`, docs (`*.md`), dependencies
- a refactor that leaves the screen pixel-identical

**Test:** write one sentence that says what a person sees before and after. If you cannot, skip, and tell the user in one line why. If a commit mixes both kinds, record only the visible part.

Do not ask the user each time. Decide, and say what you decided.

## Step 2 - Name it from the pushed commit

- Use the commit as it is on `origin`. The user often rewords and force-pushes `main` after you push, so `git fetch` first. Get the hash from `git log origin/main` and the title from `git log -1 --format=%s <sha>`.
- Never reuse a title from memory or from an earlier proposal.
- File name: `<short-hash>-<kebab-name>.gif`, for example `bd815f5-drag-box-to-tab.gif`.

## Step 3 - Record

1. Start the dev server from the checkout that holds the commit, in the background:
   - Bluprint: `npx next dev -p 3217` in `app/`
   - landing page: `npm run dev` in `landing/` (port 3001)

   Next allows only one dev server per folder. If one is already running, use it. The Chrome extension's browser can be on a different machine and not reach this one, so record with a local headless browser.
2. Install the driver once per session in the scratchpad: `npm i playwright-core@1.48.2`. Launch the system Chrome with `channel: "chrome"`. Playwright finds it on macOS and Windows. The tools the scripts need are Node, bash, `ffmpeg` and `gh`. On macOS, install the ones that are missing with `brew install ffmpeg gh`.
3. Write a scenario script in the scratchpad. Import `recorder.mjs` through `pathToFileURL`, because Node on Windows rejects a bare `C:/` path, and a hand-written `file:///` URL is wrong on one OS or the other. Every helper saves one frame per step, so the GIF plays at the speed the scenario was written for, however slow the screenshots are:
   - `hold(n)` repeats n frames
   - `glide(to, steps)` makes an eased pointer move
   - `press`, `release` and `click` act where the pointer is
   - `type(text)` types one key per frame

   ```js
   import { chromium } from "playwright-core";
   import { pathToFileURL } from "node:url";
   const { recorder } = await import(pathToFileURL("<root>/.claude/skills/demo-gif/scripts/recorder.mjs").href);

   const browser = await chromium.launch({ channel: "chrome" });
   const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
   const r = await recorder(page, "frames");
   await page.goto("http://localhost:3217", { waitUntil: "networkidle" });
   await page.evaluate(() => {
     for (const k of Object.keys(localStorage)) if (k.startsWith("slop:tabs:")) localStorage.removeItem(k);
   });
   await page.reload({ waitUntil: "networkidle" });
   await r.hold(20);
   await r.glide(await r.centre(page.locator('a[href="?at=blog-listing"]').first()), 18);
   await r.press();
   await r.glide({ x: 300, y: 16 }, 36);
   await r.hold(12);
   await r.release();
   await r.hold(30);
   await browser.close();
   ```

   The scenario must:
   - start from a clean, known state. Bluprint keeps reader state in `localStorage` under `slop:` keys (`slop:tabs:<map>`, `slop:settings`). Clear the keys the change touches, then reload.
   - show the start state for about 0.7 s, then the change, then the end state for about 1 s
   - move the pointer with `glide`, so the viewer can follow it
   - stay between 5 and 15 s
4. Run all recording in one `node` process. On Windows, each new `node.exe` flashes a console window on the user's screen.

## Step 4 - Encode and check

```
bash <root>/.claude/skills/demo-gif/scripts/encode.sh <frames-dir> <out.gif>
```

The script writes a 960px-wide GIF at 15 fps, and prints its size and 3 check frames (start, middle, end). Look at all 3 frames. Fix the scenario and record again if any of these is true:
- the change is not visible
- the cursor is off screen
- a dialog, the Next.js error overlay, or a loading state covers the UI
- the GIF is over 5 MB

## Step 5 - Publish

Run from inside the checkout:

```
bash <root>/.claude/skills/demo-gif/scripts/publish.sh <sha> <out.gif>
```

The script:
1. Checks that the commit is on `origin`.
2. Makes sure the `demos` prerelease exists.
3. Uploads the GIF.
4. Adds a `### <short> - <title>` section with the GIF to the top of the release notes, under the header, so the newest demo comes first.
5. Posts the GIF as a comment on the commit.

Each step that is already done is skipped, so running it again is safe. The auto-mode classifier blocked a plain `gh release create` before, but it allowed `--verify-tag` on the existing `demos` tag, uploads, notes edits and commit comments. If a step is blocked, give the user the exact command from the script's output to run with `!`.

## Step 6 - Report

Give the commit comment link and the release link. In the report, say "plays on the commit page". Do not say "attached to the commit": GitHub has no way to put a file inside a commit.
