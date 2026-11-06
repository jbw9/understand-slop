#!/bin/sh
# usage (from app/): npm run app:install
#   builds the checkout as it is now (uncommitted changes too) into the installed Bluprint and the
#   server it starts (src-tauri/src/server.rs), so `npm run app:dev` can rebuild and restart freely
#   beside it. The snapshot is built next to the running one and swapped in at the end, so a Bluprint
#   open while this runs keeps working until then. macOS, Linux, and Windows (Git Bash).
set -e
os=$(uname)
case $os in
Darwin) data="$HOME/Library/Application Support/dev.bluprint.app" ;;
# Tauri's app_data_dir on Linux.
Linux) data="${XDG_DATA_HOME:-$HOME/.local/share}/dev.bluprint.app" ;;
# Tauri's app_data_dir on Windows: %APPDATA%.
MINGW* | MSYS* | CYGWIN*) os=Windows; data="$(cygpath -u "$APPDATA")/dev.bluprint.app" ;;
*) echo "app:install is for macOS, Linux and Windows." >&2; exit 1 ;;
esac

snap="$data/server"
next="$data/server-next"
mkdir -p "$data"
rm -rf "$next"
# Copy-on-write where the disk allows it (APFS, btrfs, XFS), a plain copy elsewhere.
clone() { if [ "$os" = Darwin ]; then cp -ca "$@"; else cp -a --reflink=auto "$@"; fi; }
mkdir -p "$next"
# The last snapshot's build caches, so next build only redoes what changed.
for f in "$snap/.next" "$snap"/*.tsbuildinfo; do
  if [ -e "$f" ]; then clone "$f" "$next/"; fi
done
# The checkout, minus the Rust side and its own build output.
for f in ./* ./.[!.]*; do
  case $f in ./src-tauri | ./.next | ./out | *.tsbuildinfo) continue ;; esac
  if [ -e "$f" ]; then clone "$f" "$next/"; fi
done
(cd "$next" && node node_modules/next/dist/bin/next build)
# The Node and PATH of this shell, minus the node_modules folders npm puts first, for a Bluprint
# opened from Finder. `command -v`, not process.execPath: Homebrew's resolves to a versioned
# Cellar path that its next upgrade deletes.
# On Windows, node sees PATH in its own form (C:\..., split by ;), and Git Bash's `command -v`
# path isn't one Windows can run, so it is node's own.
node -e '
const { delimiter, sep } = require("path");
const path = process.env.PATH.split(delimiter).filter((p) => !p.includes(`${sep}node_modules${sep}`)).join(delimiter);
const node = process.platform === "win32" ? process.execPath : process.argv[2];
require("fs").writeFileSync(process.argv[1], JSON.stringify({ node, path }) + "\n");
' "$next/env.json" "$(command -v node)"

if [ "$os" = Darwin ]; then npx tauri build --bundles app; else npx tauri build --no-bundle; fi

if [ "$os" = Windows ]; then
  netstat -ano | awk '$2 ~ /:3123$/ && $4 == "LISTENING" { print $5 }' | sort -u |
    while read -r pid; do taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true; done
elif command -v lsof >/dev/null; then
  lsof -ti tcp:3123 -sTCP:LISTEN | xargs kill 2>/dev/null || true
else
  fuser -k -n tcp 3123 2>/dev/null || true
fi
rm -rf "$snap.old"
if [ -d "$snap" ]; then mv "$snap" "$snap.old"; fi
mv "$next" "$snap"
rm -rf "$snap.old"

if [ "$os" = Darwin ]; then
  rm -rf /Applications/Bluprint.app
  ditto src-tauri/target/release/bundle/macos/Bluprint.app /Applications/Bluprint.app
  echo "Installed /Applications/Bluprint.app. Quit Bluprint if it's open, then open it again."
elif [ "$os" = Windows ]; then
  bin="$(cygpath -u "$LOCALAPPDATA")/Programs/Bluprint"
  mkdir -p "$bin"
  # A running exe can't be written over, but it can be moved aside.
  rm -f "$bin/bluprint.old.exe" 2>/dev/null || true
  if [ -e "$bin/bluprint.exe" ]; then mv "$bin/bluprint.exe" "$bin/bluprint.old.exe"; fi
  cp src-tauri/target/release/bluprint.exe "$bin/bluprint.exe"
  rm -f "$bin/bluprint.old.exe" 2>/dev/null || true
  exe=$(cygpath -w "$bin/bluprint.exe")
  lnk=$(cygpath -w "$(cygpath -u "$APPDATA")/Microsoft/Windows/Start Menu/Programs/Bluprint.lnk")
  powershell -NoProfile -Command "\$s = (New-Object -ComObject WScript.Shell).CreateShortcut('$lnk'); \$s.TargetPath = '$exe'; \$s.WorkingDirectory = '$(cygpath -w "$bin")'; \$s.Save()"
  echo "Installed $exe, with Bluprint in your Start menu. Quit Bluprint if it's open, then open it again."
else
  bin="$HOME/.local/bin"
  icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/128x128/apps"
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$bin" "$icons" "$apps"
  # Beside the running binary, then over it: a running executable can't be written in place.
  cp src-tauri/target/release/bluprint "$bin/.bluprint.new"
  mv "$bin/.bluprint.new" "$bin/bluprint"
  cp src-tauri/icons/128x128.png "$icons/bluprint.png"
  printf '[Desktop Entry]\nType=Application\nName=Bluprint\nComment=A visual map of a codebase\nExec=%s\nIcon=bluprint\nCategories=Development;\n' \
    "$bin/bluprint" >"$apps/bluprint.desktop"
  echo "Installed $bin/bluprint, with Bluprint in your applications menu. Quit Bluprint if it's open, then open it again."
fi
