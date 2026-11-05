#!/bin/sh
# usage (from app/): npm run app:install
#   builds the checkout as it is now (uncommitted changes too) into the installed Mira and the
#   server it starts (src-tauri/src/server.rs), so `npm run app:dev` can rebuild and restart freely
#   beside it. The snapshot is built next to the running one and swapped in at the end, so a Mira
#   open while this runs keeps working until then. macOS and Linux.
set -e
os=$(uname)
case $os in
Darwin) data="$HOME/Library/Application Support/dev.mira.app" ;;
# Tauri's app_data_dir on Linux.
Linux) data="${XDG_DATA_HOME:-$HOME/.local/share}/dev.mira.app" ;;
*) echo "app:install is for macOS and Linux." >&2; exit 1 ;;
esac

snap="$data/server"
next="$data/server-next"
mkdir -p "$data"
rm -rf "$next"
# A copy-on-write clone of the last snapshot, so rsync and next build only redo what changed.
if [ -d "$snap" ]; then
  if [ "$os" = Darwin ]; then cp -cR "$snap" "$next"; else cp -R --reflink=auto "$snap" "$next"; fi
fi
rsync -a --delete --exclude /src-tauri --exclude /.next --exclude /out --exclude '*.tsbuildinfo' ./ "$next/"
(cd "$next" && node node_modules/next/dist/bin/next build)
# The Node and PATH of this shell, minus the node_modules folders npm puts first, for a Mira
# opened from Finder. `command -v`, not process.execPath: Homebrew's resolves to a versioned
# Cellar path that its next upgrade deletes.
node -e '
const path = process.env.PATH.split(":").filter((p) => !p.includes("/node_modules/")).join(":");
require("fs").writeFileSync(process.argv[1], JSON.stringify({ node: process.argv[2], path }) + "\n");
' "$next/env.json" "$(command -v node)"

if [ "$os" = Darwin ]; then npx tauri build --bundles app; else npx tauri build --no-bundle; fi

if command -v lsof >/dev/null; then
  lsof -ti tcp:3123 -sTCP:LISTEN | xargs kill 2>/dev/null || true
else
  fuser -k -n tcp 3123 2>/dev/null || true
fi
rm -rf "$snap.old"
if [ -d "$snap" ]; then mv "$snap" "$snap.old"; fi
mv "$next" "$snap"
rm -rf "$snap.old"

if [ "$os" = Darwin ]; then
  rm -rf /Applications/Mira.app
  ditto src-tauri/target/release/bundle/macos/Mira.app /Applications/Mira.app
  echo "Installed /Applications/Mira.app. Quit Mira if it's open, then open it again."
else
  bin="$HOME/.local/bin"
  icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/128x128/apps"
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$bin" "$icons" "$apps"
  # Beside the running binary, then over it: a running executable can't be written in place.
  cp src-tauri/target/release/mira "$bin/.mira.new"
  mv "$bin/.mira.new" "$bin/mira"
  cp src-tauri/icons/128x128.png "$icons/mira.png"
  printf '[Desktop Entry]\nType=Application\nName=Mira\nComment=A visual map of a codebase\nExec=%s\nIcon=mira\nCategories=Development;\n' \
    "$bin/mira" >"$apps/mira.desktop"
  echo "Installed $bin/mira, with Mira in your applications menu. Quit Mira if it's open, then open it again."
fi
