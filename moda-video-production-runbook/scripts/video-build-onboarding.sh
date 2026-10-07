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

npm run video:merchant:onboarding:narrate -- "${args[@]}"
npm run video:merchant:onboarding:render -- "${args[@]}"

echo
printf 'Final onboarding video: artifacts/videos/%s/onboarding/01-onboarding-free-plan.%s.mp4\n' "$locale" "$locale"
printf 'Captions:               artifacts/videos/%s/onboarding/01-onboarding-free-plan.%s.srt\n' "$locale" "$locale"
