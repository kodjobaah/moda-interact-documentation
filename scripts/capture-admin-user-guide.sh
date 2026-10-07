#!/usr/bin/env bash
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
MANIFEST="$REPO_ROOT/manuals/screenshot-manifest.csv"
LOCALE="en"
OVERWRITE=0
HEADED=1
SKIP_AUTH=0
ONLY_ID=""
FAILURES=""
OPTIONAL_MISSING=""
CAPTURED=0
SKIPPED=0

usage() {
  cat <<'USAGE'
Capture English screenshots for the Moda Interact Administrator User Guide.

Usage:
  ./scripts/capture-admin-user-guide.sh [options]

Options:
  --overwrite       Replace existing *.en.png screenshots.
  --headless        Run the capture browsers headlessly. Default is headed.
  --skip-auth       Do not bootstrap Admin authentication automatically.
  --id <id>         Capture one admin screenshot ID only.
  --help            Show this help.

The script is intentionally English-only. It never submits business forms or
clicks mutating support/billing/queue/platform controls.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --overwrite)
      OVERWRITE=1
      shift
      ;;
    --headless)
      HEADED=0
      shift
      ;;
    --skip-auth)
      SKIP_AUTH=1
      shift
      ;;
    --id)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --id requires a screenshot ID." >&2
        exit 2
      fi
      ONLY_ID=$2
      shift 2
      ;;
    --id=*)
      ONLY_ID=${1#--id=}
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option '$1'." >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$REPO_ROOT"

for required in \
  "manuals/admin-user-guide.tex" \
  "manuals/content/en/admin-user-guide-metadata.tex" \
  "manuals/content/en/admin-user-guide-content.tex" \
  "manuals/screenshot-manifest.csv"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: Administrator User Guide structure is incomplete: missing $required" >&2
    exit 1
  fi
done

mkdir -p "$REPO_ROOT/artifacts/manuals/$LOCALE"

if [ ! -x "$REPO_ROOT/node_modules/.bin/tsx" ]; then
  echo "Installing documentation automation dependencies with npm ci..."
  npm ci || exit 1
fi

# Idempotent: Playwright downloads Chromium only when the expected browser is absent.
echo "Ensuring the Playwright Chromium runtime is available..."
npm run playwright:install || exit 1

echo "Validating English Admin screenshot coverage..."
npm run capture:plan -- --locale="$LOCALE" --manual=admin || exit 1

needs_admin_auth=0
if [ -z "$ONLY_ID" ] || [ "$ONLY_ID" != "admin-login" ]; then
  needs_admin_auth=1
fi

if [ "$needs_admin_auth" -eq 1 ] && [ "$SKIP_AUTH" -eq 0 ]; then
  storage_path=$(node --input-type=module - <<'NODE'
import 'dotenv/config';
console.log(process.env.MODA_ADMIN_STORAGE_STATE_PATH ?? 'playwright/.auth/moda-admin.json');
NODE
)
  case "$storage_path" in
    /*) auth_file="$storage_path" ;;
    *)  auth_file="$REPO_ROOT/$storage_path" ;;
  esac

  if [ ! -f "$auth_file" ]; then
    echo "No saved Admin browser session found. Opening the headed authentication flow..."
    echo "The bootstrap waits for the rendered Continue with Google control and enters Google OAuth automatically."
    echo "Complete Google sign-in/MFA in the browser, then return to the terminal as instructed."
    npm run auth:admin || exit 1
  fi
fi

capture_one() {
  screenshot_id=$1
  filename_pattern=$2
  requirement=${3:-required}
  output_name=$(printf '%s' "$filename_pattern" | sed "s/<locale>/$LOCALE/g")
  output_path="$REPO_ROOT/manuals/$output_name"

  if [ -f "$output_path" ] && [ "$OVERWRITE" -eq 0 ]; then
    echo "skip-existing: $screenshot_id -> $output_path"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  set -- --locale="$LOCALE" --id="$screenshot_id"
  if [ "$OVERWRITE" -eq 1 ]; then
    set -- "$@" --overwrite
  fi
  if [ "$HEADED" -eq 1 ]; then
    set -- "$@" --headed
  fi

  echo
  echo "=== $screenshot_id ==="
  if npm run capture:admin -- "$@"; then
    CAPTURED=$((CAPTURED + 1))
  else
    if [ "$requirement" = "optional" ]; then
      if [ -z "$OPTIONAL_MISSING" ]; then
        OPTIONAL_MISSING=$screenshot_id
      else
        OPTIONAL_MISSING="$OPTIONAL_MISSING $screenshot_id"
      fi
      echo "capture-optional-unavailable: $screenshot_id" >&2
    else
      if [ -z "$FAILURES" ]; then
        FAILURES=$screenshot_id
      else
        FAILURES="$FAILURES $screenshot_id"
      fi
      echo "capture-failed: $screenshot_id" >&2
    fi
  fi
}

found_requested=0
# Bash 3.2 compatible: no mapfile/readarray.
while IFS=, read -r manual screenshot_id purpose filename_pattern requirement; do
  [ "$manual" = "admin" ] || continue
  [ "$screenshot_id" = "screenshot_id" ] && continue
  if [ -n "$ONLY_ID" ] && [ "$screenshot_id" != "$ONLY_ID" ]; then
    continue
  fi
  found_requested=1
  capture_one "$screenshot_id" "$filename_pattern" "${requirement:-required}"
done < "$MANIFEST"

if [ -n "$ONLY_ID" ] && [ "$found_requested" -eq 0 ]; then
  echo "ERROR: '$ONLY_ID' is not an Admin screenshot ID in $MANIFEST." >&2
  exit 1
fi

echo
echo "Capture summary: $CAPTURED captured, $SKIPPED already present."
if [ -n "$OPTIONAL_MISSING" ]; then
  echo "Optional state-dependent screenshots were not available:" >&2
  for id in $OPTIONAL_MISSING; do
    echo "  - $id" >&2
  done
  echo "This is valid operational state; the guide build does not require these screenshots." >&2
fi
if [ -n "$FAILURES" ]; then
  echo "The following required captures failed:" >&2
  for id in $FAILURES; do
    echo "  - $id" >&2
  done
  echo "Other screenshots were kept. Review the error above: missing read-only test state may require seeding; selector/configuration failures require a capture-target correction. Then rerun only the affected ID with --id <id>." >&2
  exit 1
fi

echo "English Administrator User Guide screenshots are ready under manuals/*.en.png."
