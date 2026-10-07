#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

locale="en"
height="540"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --locale) locale="$2"; shift 2 ;;
    --height) height="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

report="artifacts/videos/$locale/capture-report.json"
scenes_dir="artifacts/videos/$locale/scenes"
review_dir="artifacts/videos/$locale/review"
zip_path="artifacts/videos/$locale/merchant-walkthrough-review.zip"

[[ -f "$report" ]] || { echo "Missing $report" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo 'ffmpeg is required' >&2; exit 1; }
command -v zip >/dev/null || { echo 'zip is required' >&2; exit 1; }

rm -rf "$review_dir"
mkdir -p "$review_dir"

mapfile -t basenames < <(python3 - "$report" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1])
data=json.loads(p.read_text())
for r in data.get('results',[]):
    if r.get('status')=='captured' and r.get('outputPath'):
        print(pathlib.Path(r['outputPath']).name)
PY
)

for name in "${basenames[@]}"; do
  src="$scenes_dir/$name"
  [[ -f "$src" ]] || { echo "Missing captured scene: $src" >&2; exit 1; }
  out="$review_dir/${name%.webm}.mp4"
  echo "proxy: $name"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$src" \
    -vf "scale=-2:${height},fps=15" \
    -an \
    -c:v libx264 -preset veryfast -crf 32 \
    -movflags +faststart \
    "$out"
done

cp "$report" "$review_dir/"
rm -f "$zip_path"
(
  cd "$review_dir"
  zip -9 -q "$ROOT_DIR/$zip_path" ./*.mp4 capture-report.json
)

echo "created: $zip_path"
ls -lh "$zip_path"
