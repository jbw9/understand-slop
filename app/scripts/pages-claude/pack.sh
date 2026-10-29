#!/bin/sh
# usage (from app/): sh scripts/pages-claude/pack.sh <map> <checkout>
#   zips the function with the demo's map and every file the checkout tracks, so Claude can read
#   past what the map cites, into out/<map>-claude.zip for the Lambda.
set -e
map=$1
root=$2
dir=$(mktemp -d)
cp scripts/pages-claude/index.mjs "$dir/"
cp "../landing/demo/$map/map.json" "$dir/"
git -C "$root" ls-files -z | node -e '
  const { readFileSync } = require("node:fs");
  const files = readFileSync(0, "utf8").split("\0").filter(Boolean);
  process.stdout.write(JSON.stringify(Object.fromEntries(files.map((f) => [f, readFileSync(process.argv[1] + "/" + f, "utf8")]))));
' "$root" > "$dir/source.json"
rm -f "out/$map-claude.zip"
(cd "$dir" && zip -q -r - .) > "out/$map-claude.zip"
echo "out/$map-claude.zip"
