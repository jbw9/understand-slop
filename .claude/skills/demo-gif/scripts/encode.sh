#!/usr/bin/env bash
set -euo pipefail

frames=${1:?usage: encode.sh <frames-dir> <out.gif> [fps-in]}
out=${2:?usage: encode.sh <frames-dir> <out.gif> [fps-in]}
fps_in=${3:-30}

count=$(ls "$frames"/*.png 2>/dev/null | wc -l)
[ "$count" -gt 0 ] || { echo "no frames in $frames" >&2; exit 1; }

ffmpeg -y -loglevel error -framerate "$fps_in" -i "$frames/%05d.png" \
  -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 "$out"

secs=$(awk "BEGIN { printf \"%.1f\", $count / $fps_in }")
size=$(wc -c < "$out")
echo "gif: $out  ${secs}s  $((size / 1024)) KB"
[ "$size" -le $((5 * 1024 * 1024)) ] || echo "warning: over 5 MB, shorten the scenario" >&2

base=${out%.gif}
for spot in start:0 middle:$((count / 2)) end:$((count - 1)); do
  name=${spot%%:*}
  i=${spot##*:}
  src=$(printf "%s/%05d.png" "$frames" "$i")
  cp "$src" "$base-check-$name.png"
  echo "check: $base-check-$name.png"
done
