#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

locale="en"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --locale) locale="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

narration_dir="artifacts/videos/$locale/narration"
review_dir="artifacts/videos/$locale/audio-review"
report="artifacts/videos/$locale/main-voiceover/voiceover-report.json"
srt="artifacts/videos/$locale/moda-interact-shopify-demo.$locale.srt"
zip_path="artifacts/videos/$locale/merchant-walkthrough-audio-review.zip"

[[ -d "$narration_dir" ]] || { echo "Missing $narration_dir" >&2; exit 1; }
[[ -f "$report" ]] || { echo "Missing $report" >&2; exit 1; }
[[ -f "$srt" ]] || { echo "Missing $srt" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo 'ffmpeg is required' >&2; exit 1; }
command -v zip >/dev/null || { echo 'zip is required' >&2; exit 1; }

rm -rf "$review_dir"
mkdir -p "$review_dir"

shopt -s nullglob
wavs=("$narration_dir"/*.wav)
(( ${#wavs[@]} > 0 )) || { echo "No WAV files under $narration_dir" >&2; exit 1; }

for src in "${wavs[@]}"; do
  name="$(basename "$src" .wav)"
  echo "audio proxy: $name"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$src" -ac 1 -ar 24000 -c:a libmp3lame -b:a 96k \
    "$review_dir/$name.mp3"
done

cp "$report" "$review_dir/voiceover-report.json"
cp "$srt" "$review_dir/"
rm -f "$zip_path"
(
  cd "$review_dir"
  zip -9 -q "$ROOT_DIR/$zip_path" ./*.mp3 voiceover-report.json "$(basename "$srt")"
)

echo "created: $zip_path"
ls -lh "$zip_path"
