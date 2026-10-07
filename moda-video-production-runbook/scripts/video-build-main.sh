#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

locale="en"
overwrite=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --locale) locale="$2"; shift 2 ;;
    --overwrite) overwrite=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

args=(--language "$locale")
$overwrite && args+=(--overwrite)

npm run video:merchant:narrate -- "${args[@]}"
npm run video:merchant:render -- "${args[@]}"

echo
printf 'Final video: artifacts/videos/%s/moda-interact-shopify-demo.%s.mp4\n' "$locale" "$locale"
printf 'Captions:    artifacts/videos/%s/moda-interact-shopify-demo.%s.srt\n' "$locale" "$locale"
printf 'Report:      artifacts/videos/%s/main-render-report.json\n' "$locale"
