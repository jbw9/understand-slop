#!/bin/sh
# usage (from app/): sh scripts/publish-pages.sh <map>
#   puts out/<map> (built by export-static.mts) at <map>/ on the gh-pages branch and pushes it.
#   The other maps already on the branch stay; the push is a plain fast-forward.
set -e
map=$1
[ -f "out/$map/index.html" ] || { echo "build it first: scripts/export-static.mts $map"; exit 1; }
remote=$(git remote get-url origin)
dir=$(mktemp -d)
git clone -q --depth 1 --branch gh-pages "$remote" "$dir"
rm -rf "${dir:?}/$map"
cp -R "out/$map" "$dir/$map"
touch "$dir/.nojekyll"
cd "$dir"
git add -A
git commit -q -m "$map: static build of maps/$map" || { echo "nothing changed"; exit 0; }
git push -q origin gh-pages
echo "published $map"
