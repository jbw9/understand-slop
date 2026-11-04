#!/bin/sh
# usage (from app/): npm run app:install
#   builds the checkout as it is now (uncommitted changes too) into the installed Mira.app and the
#   server it starts (src-tauri/src/server.rs), so `npm run app:dev` can rebuild and restart freely
#   beside it. The snapshot is built next to the running one and swapped in at the end, so a Mira
#   open while this runs keeps working until then. macOS only.
set -e
[ "$(uname)" = Darwin ] || { echo "app:install is macOS only." >&2; exit 1; }

data="$HOME/Library/Application Support/dev.mira.app"
snap="$data/server"
next="$data/server-next"
mkdir -p "$data"
rm -rf "$next"
# A copy-on-write clone of the last snapshot, so rsync and next build only redo what changed.
if [ -d "$snap" ]; then cp -cR "$snap" "$next"; fi
rsync -a --delete --exclude /src-tauri --exclude /.next --exclude /out --exclude '*.tsbuildinfo' ./ "$next/"
(cd "$next" && node node_modules/next/dist/bin/next build)
# The Node and PATH of this shell, minus the node_modules folders npm puts first, for a Mira
# opened from Finder. `command -v`, not process.execPath: Homebrew's resolves to a versioned
# Cellar path that its next upgrade deletes.
node -e '
const path = process.env.PATH.split(":").filter((p) => !p.includes("/node_modules/")).join(":");
require("fs").writeFileSync(process.argv[1], JSON.stringify({ node: process.argv[2], path }) + "\n");
' "$next/env.json" "$(command -v node)"

npx tauri build --bundles app

lsof -ti tcp:3123 -sTCP:LISTEN | xargs kill 2>/dev/null || true
rm -rf "$snap.old"
if [ -d "$snap" ]; then mv "$snap" "$snap.old"; fi
mv "$next" "$snap"
rm -rf "$snap.old"
rm -rf /Applications/Mira.app
ditto src-tauri/target/release/bundle/macos/Mira.app /Applications/Mira.app
echo "Installed /Applications/Mira.app. Quit Mira if it's open, then open it again."
