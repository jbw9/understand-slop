#!/bin/sh
# usage (from app/): sh scripts/build-pages.sh <site>
#   builds the landing page and the demo maps made from this repo into <site>, a checkout of the
#   gh-pages branch, replacing what was there. The builds in $keep are not made from this repo,
#   so they stay as deployed.
set -e
site=$(cd "$1" && pwd)
base=
keep="kafka kafka-control-plane understand-slop"
demos="fastapi:fastapi/full-stack-fastapi-template flask:pallets/flask ky:sindresorhus/ky mira:jbw9/understand-slop umami:umami-software/umami"

for d in $demos; do
  map=${d%%:*}
  repo=${d#*:}
  commit=$(node -p "require('../landing/demo/$map/map.json').RUN.commit")
  npx -y tsx@4.23.15 --tsconfig tsconfig.json scripts/export-static.mts "$map" --base-path "$base/$map" --source-url "https://github.com/$repo/blob/$commit"
done
(cd ../landing && NEXT_PUBLIC_BASE_PATH=$base npm run build)

find "$site" -mindepth 1 -maxdepth 1 ! -name .git $(for k in $keep; do printf ' ! -name %s' "$k"; done) -exec rm -rf {} +
cp -R ../landing/out/. "$site/"
for d in $demos; do
  map=${d%%:*}
  cp -R "out/$map" "$site/$map"
done
touch "$site/.nojekyll"
# The site is served at blpr.dev; Pages drops the custom domain when this file is gone.
echo blpr.dev > "$site/CNAME"
echo "built $site"
