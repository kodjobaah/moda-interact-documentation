#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL_DIR="$ROOT_DIR/artifacts/video-tools/kokoro"
VENV_DIR="$TOOL_DIR/.venv"
MODEL_PATH="$TOOL_DIR/kokoro-v1.0.onnx"
VOICES_PATH="$TOOL_DIR/voices-v1.0.bin"
MODEL_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx"
VOICES_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"

choose_python() {
  local candidate
  if [[ -n "${KOKORO_PYTHON:-}" ]]; then
    printf '%s\n' "$KOKORO_PYTHON"
    return
  fi

  for candidate in python3.12 python3.11 python3.13 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)
PY
      then
        printf '%s\n' "$candidate"
        return
      fi
    fi
  done

  return 1
}

PYTHON_BIN="$(choose_python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  cat >&2 <<'MSG'
ERROR: Kokoro requires Python 3.10-3.13. No compatible Python was found.
On macOS, install Python 3.12 and rerun:
  brew install python@3.12
  npm run video:voiceover:setup
MSG
  exit 1
fi

mkdir -p "$TOOL_DIR"

if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ -z "${KOKORO_ESPEAK_LIB:-}" && -z "${KOKORO_ESPEAK_DATA:-}" ]]; then
    if ! command -v brew >/dev/null 2>&1 || ! brew --prefix espeak-ng >/dev/null 2>&1; then
      cat >&2 <<'MSG'
ERROR: Kokoro on macOS requires the system eSpeak NG library/data pair.
Install it with:
  brew install espeak-ng
Then rerun:
  npm run video:voiceover:setup
MSG
      exit 1
    fi
  fi
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Creating isolated Kokoro environment with $PYTHON_BIN ..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip >/dev/null
"$VENV_DIR/bin/python" -m pip install \
  'kokoro-onnx==0.6.1' \
  'soundfile>=0.13,<0.14'

if [[ ! -s "$MODEL_PATH" ]]; then
  echo "Downloading Kokoro v1.0 model (~326 MB) ..."
  curl --fail --location --retry 3 --output "$MODEL_PATH.tmp" "$MODEL_URL"
  mv "$MODEL_PATH.tmp" "$MODEL_PATH"
fi

if [[ ! -s "$VOICES_PATH" ]]; then
  echo "Downloading Kokoro v1.0 voice pack (~28 MB) ..."
  curl --fail --location --retry 3 --output "$VOICES_PATH.tmp" "$VOICES_URL"
  mv "$VOICES_PATH.tmp" "$VOICES_PATH"
fi

echo "Validating Kokoro installation ..."
ONNX_PROVIDER=CPUExecutionProvider "$VENV_DIR/bin/python" \
  "$ROOT_DIR/scripts/kokoro_tts.py" \
  --model "$MODEL_PATH" \
  --voices "$VOICES_PATH" \
  --list-voices > "$TOOL_DIR/voices.txt"

if ! grep -qx 'bf_emma' "$TOOL_DIR/voices.txt"; then
  echo "ERROR: Expected Kokoro voice 'bf_emma' is not available." >&2
  exit 1
fi

echo "Kokoro is ready."
echo "Environment: $VENV_DIR"
echo "Model:       $MODEL_PATH"
echo "Voices:      $VOICES_PATH"
echo "Default voice: bf_emma"
