#!/usr/bin/env bash
set -euo pipefail

sha=${1:?usage: publish.sh <sha> <file.gif>}
gif=${2:?usage: publish.sh <sha> <file.gif>}
tag=demos

[ -f "$gif" ] || { echo "no such file: $gif" >&2; exit 1; }
case "$gif" in *.gif) ;; *) echo "only .gif files: $gif" >&2; exit 1 ;; esac

repo=jbw9/bluprint
full=$(git rev-parse "$sha")
short=$(git rev-parse --short "$sha")
title=$(git log -1 --format=%s "$full")
name=$(basename "$gif")

case "$name" in "$short"-*) ;; *) echo "name the file $short-<name>.gif, not $name" >&2; exit 1 ;; esac

git fetch -q origin
[ -n "$(git branch -r --contains "$full" 2>/dev/null)" ] || { echo "$short is not on the remote yet; push it first" >&2; exit 1; }

url="https://github.com/$repo/releases/download/$tag/$name"
header="Short GIFs of UI changes, named <short-hash>-<name>.gif. Each one is also posted on its commit."

run() {
  echo "+ $*"
  "$@" || { echo "failed. To run it yourself: ! $*" >&2; exit 1; }
}

if ! gh release view "$tag" -R "$repo" >/dev/null 2>&1; then
  if gh api "repos/$repo/git/refs/tags/$tag" >/dev/null 2>&1; then
    run gh release create "$tag" -R "$repo" --prerelease --verify-tag --title "Demos" --notes "$header"
  else
    run gh release create "$tag" -R "$repo" --prerelease --target main --title "Demos" --notes "$header"
  fi
fi

if gh release view "$tag" -R "$repo" --json assets --jq '.assets[].name' | grep -qx "$name"; then
  run gh release upload "$tag" "$gif" -R "$repo" --clobber
else
  run gh release upload "$tag" "$gif" -R "$repo"
fi

body=$(gh release view "$tag" -R "$repo" --json body --jq .body)
if ! grep -qF "### $short " <<<"$body"; then
  section=$(printf '### %s - %s\n\n![%s](%s)' "$short" "$title" "$title" "$url")
  [ -n "$body" ] || body=$header
  intro=$(awk '/^### /{exit} {print}' <<<"$body")
  older=$(awk 'f||/^### /{f=1; print}' <<<"$body")
  if [ -n "$older" ]; then
    notes=$(printf '%s\n\n%s\n\n%s' "$intro" "$section" "$older")
  else
    notes=$(printf '%s\n\n%s' "$intro" "$section")
  fi
  run gh release edit "$tag" -R "$repo" --notes "$notes"
fi

if gh api "repos/$repo/commits/$full/comments" --jq '.[].body' | grep -qF "$url"; then
  echo "commit comment already there"
  comment=$(gh api "repos/$repo/commits/$full/comments" --jq "map(select(.body | contains(\"$url\")))[0].html_url")
else
  comment=$(gh api "repos/$repo/commits/$full/comments" -f body="![$title]($url)" --jq .html_url) || {
    echo "failed. To run it yourself: ! gh api repos/$repo/commits/$full/comments -f body='![$title]($url)'" >&2
    exit 1
  }
fi

echo "commit: $comment"
echo "release: https://github.com/$repo/releases/tag/$tag"
