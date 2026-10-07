#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

errors=0
warnings=0

ok()   { printf 'OK   %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*"; warnings=$((warnings+1)); }
fail() { printf 'FAIL %s\n' "$*"; errors=$((errors+1)); }

printf 'Moda Interact video production doctor\n'
printf 'Repository: %s\n\n' "$ROOT_DIR"

if [[ -f package.json ]] && grep -q 'moda-interact-documentation' package.json; then
  ok 'documentation repository detected'
else
  fail 'run this script from scripts/ inside moda-interact-documentation'
fi

for cmd in node npm npx ffmpeg ffprobe zip; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd: $(command -v "$cmd")"
  else
    fail "$cmd is not installed or not on PATH"
  fi
done

if command -v node >/dev/null 2>&1; then
  node_version="$(node -p 'process.versions.node')"
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>24 || (a===24 && b>=19) ? 0 : 1)' >/dev/null 2>&1; then
    ok "Node $node_version satisfies >=24.19"
  else
    fail "Node $node_version is too old; project requires >=24.19.0"
  fi
fi

if [[ -d node_modules ]]; then
  ok 'node_modules exists'
else
  warn 'node_modules is missing; run npm ci'
fi

if [[ -f .env ]]; then
  ok '.env exists'
else
  fail '.env is missing; copy .env.example to .env and configure it'
fi

if [[ -d node_modules ]] && [[ -f .env ]]; then
  effective_env="$(npx --yes tsx -e "import 'dotenv/config'; console.log(JSON.stringify({store:process.env.SHOPIFY_STORE_ADMIN_URL||'',app:process.env.SHOPIFY_MERCHANT_APP_URL||'',nav:process.env.SHOPIFY_APP_NAV_LABEL||'',demoRecovery:process.env.SHOPIFY_DEMO_RECOVERY_CUSTOMER||''}))" 2>/dev/null || true)"
  if [[ -n "$effective_env" ]]; then
    printf 'INFO effective non-secret video config: %s\n' "$effective_env"
    effective_app="$(npx --yes tsx -e "import 'dotenv/config'; process.stdout.write(process.env.SHOPIFY_MERCHANT_APP_URL||'')" 2>/dev/null || true)"
    if [[ "$effective_app" == *'/apps/'* ]]; then
      ok 'SHOPIFY_MERCHANT_APP_URL looks like an installed-app URL'
    else
      fail "SHOPIFY_MERCHANT_APP_URL must contain /apps/<handle>; effective value: ${effective_app:-<empty>}"
    fi
  else
    warn 'could not evaluate effective .env values through dotenv/tsx'
  fi
fi

SHOPIFY_STATE="${SHOPIFY_STORAGE_STATE_PATH:-playwright/.auth/shopify.json}"
if [[ -s "$SHOPIFY_STATE" ]]; then
  ok "Shopify Playwright storage state exists: $SHOPIFY_STATE"
else
  warn "Shopify auth state missing: $SHOPIFY_STATE (run npm run video:merchant:auth)"
fi

if command -v brew >/dev/null 2>&1 && brew --prefix espeak-ng >/dev/null 2>&1; then
  prefix="$(brew --prefix espeak-ng)"
  if compgen -G "$prefix/lib/libespeak-ng*.dylib" >/dev/null && [[ -f "$prefix/share/espeak-ng-data/phontab" ]]; then
    ok "eSpeak NG library/data available under $prefix"
  else
    warn "eSpeak NG is installed but expected dylib/phontab could not be found under $prefix"
  fi
else
  warn 'Homebrew eSpeak NG not detected; required for Kokoro on macOS'
fi

compatible_python=''
for p in python3.12 python3.11 python3.13 python3.10 python3; do
  if command -v "$p" >/dev/null 2>&1 && "$p" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)
PY
  then
    compatible_python="$p"
    break
  fi
done
if [[ -n "$compatible_python" ]]; then
  ok "compatible Python: $($compatible_python --version 2>&1)"
else
  warn 'Python 3.10-3.13 not found; Kokoro setup will need one'
fi

KOKORO_DIR="$ROOT_DIR/artifacts/video-tools/kokoro"
if [[ -x "$KOKORO_DIR/.venv/bin/python" && -s "$KOKORO_DIR/kokoro-v1.0.onnx" && -s "$KOKORO_DIR/voices-v1.0.bin" ]]; then
  ok 'Kokoro local model and virtualenv are ready'
else
  warn 'Kokoro not fully set up; run npm run video:voiceover:setup before narration'
fi

if [[ -f artifacts/videos/en/capture-report.json ]]; then
  ok 'main capture report exists'
  python3 - <<'PY' || true
import json, pathlib
p=pathlib.Path('artifacts/videos/en/capture-report.json')
data=json.loads(p.read_text())
for r in data.get('results',[]):
    print(f"INFO scene {r['sceneId']}: {r['status']}")
PY
else
  warn 'main capture report not present yet'
fi

printf '\nSummary: %d error(s), %d warning(s)\n' "$errors" "$warnings"
if (( errors > 0 )); then
  exit 1
fi
