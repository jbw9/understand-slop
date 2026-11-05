#!/bin/sh
# Installs Mira on macOS or Linux, built from source:
#   curl -fsSL https://raw.githubusercontent.com/jbw9/understand-slop/main/install.sh | sh
# The source is kept in ~/.mira/src (MIRA_DIR moves it); running this again updates and rebuilds.
set -e

# Everything happens inside main, called on the last line, so a download cut short runs nothing.
main() {
  repo=${MIRA_REPO:-https://github.com/jbw9/understand-slop.git}
  ref=${MIRA_REF:-main}
  dir=${MIRA_DIR:-$HOME/.mira}/src
  os=$(uname)
  case $os in
  Darwin | Linux) ;;
  *) die "Mira installs on macOS and Linux." ;;
  esac
  # rustup's default place, for a shell opened before Rust was installed.
  [ -x "$HOME/.cargo/bin/cargo" ] && PATH="$HOME/.cargo/bin:$PATH"

  missing=""
  if [ "$os" = Darwin ]; then
    need git "xcode-select --install"
    need c++ "xcode-select --install"
    need node "Node 20 or newer: https://nodejs.org (or: brew install node)"
    need cargo "Rust: https://rustup.rs"
    need cmake "brew install cmake (or https://cmake.org/download)"
  else
    need git "your package manager's git"
    need node "Node 20 or newer: https://nodejs.org/en/download/package-manager"
    need cargo "Rust: https://rustup.rs"
    if command -v apt-get >/dev/null; then
      sys="sudo apt-get install -y build-essential cmake pkg-config rsync libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libasound2-dev libpulse-dev"
    elif command -v dnf >/dev/null; then
      sys="sudo dnf install -y gcc-c++ cmake pkgconf-pkg-config rsync webkit2gtk4.1-devel gtk3-devel librsvg2-devel openssl-devel alsa-lib-devel pulseaudio-libs-devel"
    elif command -v pacman >/dev/null; then
      sys="sudo pacman -S --needed base-devel cmake rsync webkit2gtk-4.1 gtk3 librsvg openssl alsa-lib libpulse"
    else
      sys="a C++ compiler, cmake, pkg-config, rsync, and the development packages of webkit2gtk-4.1, gtk3, librsvg, openssl, alsa and libpulse"
    fi
    for c in c++ cmake pkg-config rsync; do need "$c" "$sys"; done
    if command -v pkg-config >/dev/null; then
      for m in webkit2gtk-4.1 gtk+-3.0 librsvg-2.0 openssl alsa libpulse; do
        pkg-config --exists "$m" || missing="$missing
  - the $m development files: $sys"
      done
    fi
  fi
  [ -z "$missing" ] || die "Mira builds from source, and needs:$missing
Install those, then run this again."
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] ||
    die "Mira needs Node 20 or newer; this is $(node -v)."

  say "Getting the source into $dir"
  mkdir -p "$dir"
  git init -q "$dir"
  git -C "$dir" fetch -q --depth 1 "$repo" "$ref"
  git -C "$dir" checkout -q -f --detach FETCH_HEAD
  git -C "$dir" clean -qfd

  cd "$dir/app"
  say "Installing packages"
  npm ci --no-audit --no-fund
  say "Building Mira (the first build compiles the app: 10 to 20 minutes)"
  sh scripts/install-app.sh

  command -v claude >/dev/null ||
    say "Mira makes maps through Claude Code, which isn't on your PATH: https://claude.com/claude-code"
}

need() { command -v "$1" >/dev/null 2>&1 || missing="$missing
  - $1: $2"; }
say() { printf '\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '%s\n' "$1" >&2; exit 1; }

main "$@"
