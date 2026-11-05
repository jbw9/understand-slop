# Saved sign-ins for the Preview browser

You sign in to a site once in the Preview, choose "all projects" or "this project only", and from then on Claude opens it already signed in. Mira keeps the site's session cookies the way a browser does and never stores your password.

```diagram
{"caption": "Where a sign-in is kept",
 "boxes": [
  {"id": "claude", "label": "Claude", "sub": "navigate / sign_in tools", "col": 0, "row": 0},
  {"id": "mcp", "label": "Preview tools", "sub": "src-tauri/src/mcp.rs", "col": 0, "row": 1, "change": "changed"},
  {"id": "bar", "label": "Sign-in bar", "sub": "components/preview.tsx", "col": 1, "row": 0, "change": "new"},
  {"id": "rules", "label": "Site rules", "sub": "vault sign-ins.json (hosts only)", "col": 1, "row": 1, "change": "new"},
  {"id": "browser", "label": "Web view", "sub": "src-tauri/src/browser.rs", "col": 1, "row": 2, "change": "changed"},
  {"id": "global", "label": "Shared store", "sub": "WebKit default, all projects", "col": 2, "row": 1},
  {"id": "project", "label": "Project store", "sub": "WebKit store per project id", "col": 2, "row": 2, "change": "new"}
 ],
 "arrows": [
  {"from": "claude", "to": "mcp", "label": "sign_in"},
  {"from": "mcp", "to": "bar", "label": "asks you", "change": "new"},
  {"from": "bar", "to": "rules", "label": "your choice", "change": "new"},
  {"from": "rules", "to": "browser", "label": "picks store", "change": "new"},
  {"from": "browser", "to": "global", "label": "default"},
  {"from": "browser", "to": "project", "label": "project-only", "change": "new"}
 ]}
```

```screen
{"title": "Preview, Claude needs a sign-in", "device": "web", "route": "instagram.com/reel/…",
 "items": [
  {"type": "heading", "text": "Claude needs you to sign in to instagram.com", "note": "new bar above the page; Claude can't type into the page while it's showing"},
  {"type": "choice", "label": "Keep this sign-in for: All projects · Only this project", "note": "new; the default is 'All projects' for social sites and 'Only this project' for everything else"},
  {"type": "button", "label": "I'm signed in", "note": "new; Claude carries on"},
  {"type": "image", "label": "the site's own login page", "note": "you type your password here yourself"}
 ]}
```

## Steps
1. Give every project its own WebKit cookie store, next to the shared one that already persists today.
2. Keep a short list of which sites use which store: shared sites in the vault and project-only sites in the project's folder. The list holds site names only, never secrets.
3. When the web view opens a site, use the store that site's rule names. If the store has to change, close the view and reopen it.
4. Add a `sign_in` tool for Claude. It shows the bar, you pick where to keep the sign-in, the page reopens in that store, and you sign in yourself. The tool returns when you click "I'm signed in".
5. While the bar is up, block Claude from typing into the page. Always block it from reading or filling password fields.
6. Add "Saved sign-ins" to settings with a Forget button for each site. Removing a project also deletes its store.

## Files
```files
~ app/src-tauri/src/browser.rs — open the web view with a per-project store; add commands to forget a site and to drop a project's store
~ app/src-tauri/Cargo.toml — turn on the WebKit data-store features in objc2-web-kit
~ app/src-tauri/src/mcp.rs — add the sign_in tool and tell Claude when to use it
~ app/components/preview.tsx — sign-in bar, choose the store when opening a site
+ app/lib/sign-ins.ts — read and write site rules (shared and per project)
~ app/src-tauri/src/agent.js — refuse to fill or reveal password fields
~ app/components/settings (existing panel) — list of saved sign-ins with Forget
```

## Risks
- Per-project stores need macOS 14 or later. On older systems every site falls back to the shared store.
- Cookies live in WebKit's store under your macOS account, which is as safe as Safari's but not encrypted separately. Anything already running as your user could read them.
- These sign-ins only work inside the Preview. Claude's plain web fetch stays signed out.

## Check
- Sign in to Instagram choosing "All projects", restart Mira and open another project. The reel loads already signed in.
- Sign in to a site choosing "Only this project", open another project, and the same site is signed out there.
- Ask Claude to type into the password field. The request is refused.
