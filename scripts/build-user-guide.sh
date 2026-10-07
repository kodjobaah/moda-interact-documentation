#!/usr/bin/env bash
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
MANUALS_DIR="$REPO_ROOT/manuals"
ARTIFACTS_DIR="$REPO_ROOT/artifacts/manuals"
LANGUAGE="en"
FORMAT="pdf"
ALLOW_MISSING=0

usage() {
  cat <<'USAGE'
Build the localized Moda Interact Administrator User Guide.

Usage:
  ./scripts/build-user-guide.sh --language <locale> --format <pdf|docx|both> [options]

Options:
  --language, --lang <locale>     Documentation locale directory (default: en).
  --format <pdf|docx|both>       Output format (default: pdf).
  --allow-missing-screenshots    Build using LaTeX screenshot placeholders.
  --help                         Show this help.

Examples:
  ./scripts/build-user-guide.sh --language en --format pdf
  ./scripts/build-user-guide.sh --language en --format docx
  ./scripts/build-user-guide.sh --language fr --format both
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --language|--lang)
      [ "$#" -ge 2 ] || { echo "ERROR: $1 requires a locale." >&2; exit 2; }
      LANGUAGE=$2
      shift 2
      ;;
    --language=*|--lang=*)
      LANGUAGE=${1#*=}
      shift
      ;;
    --format)
      [ "$#" -ge 2 ] || { echo "ERROR: --format requires pdf, docx or both." >&2; exit 2; }
      FORMAT=$2
      shift 2
      ;;
    --format=*)
      FORMAT=${1#--format=}
      shift
      ;;
    --allow-missing-screenshots)
      ALLOW_MISSING=1
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

case "$FORMAT" in
  pdf|docx|both) ;;
  *) echo "ERROR: unsupported format '$FORMAT'. Expected pdf, docx or both." >&2; exit 2 ;;
esac

case "$LANGUAGE" in
  *[!A-Za-z0-9_-]*|'')
    echo "ERROR: invalid locale '$LANGUAGE'. Use a locale directory name such as en, fr, pt-BR or zh-Hans." >&2
    exit 2
    ;;
esac

WRAPPER="$MANUALS_DIR/admin-user-guide.tex"
CONTENT_DIR="$MANUALS_DIR/content/$LANGUAGE"
CONTENT="$CONTENT_DIR/admin-user-guide-content.tex"
METADATA="$CONTENT_DIR/admin-user-guide-metadata.tex"

for required in "$WRAPPER" "$CONTENT" "$METADATA" "$MANUALS_DIR/moda-manual.sty"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: missing localized guide source: $required" >&2
    echo "Create manuals/content/$LANGUAGE/admin-user-guide-content.tex and admin-user-guide-metadata.tex before building this locale." >&2
    exit 1
  fi
done

missing_screenshots=""
# Extract the language-neutral screenshot IDs used by this localized guide.
for id in $(sed -n 's/.*\\ModaScreenshot{\([^}]*\)}.*/\1/p' "$CONTENT"); do
  present=0
  for ext in png jpg jpeg pdf; do
    if [ -f "$MANUALS_DIR/$id.$LANGUAGE.$ext" ]; then
      present=1
      break
    fi
  done
  if [ "$present" -eq 0 ]; then
    if [ -z "$missing_screenshots" ]; then
      missing_screenshots=$id
    else
      missing_screenshots="$missing_screenshots $id"
    fi
  fi
done

if [ -n "$missing_screenshots" ]; then
  echo "Localized screenshots missing for '$LANGUAGE':" >&2
  for id in $missing_screenshots; do echo "  - $id.$LANGUAGE.png" >&2; done
  if [ "$ALLOW_MISSING" -ne 1 ]; then
    echo "ERROR: build stopped. Supply the localized screenshots or pass --allow-missing-screenshots for a draft with placeholders." >&2
    exit 1
  fi
  echo "Continuing with LaTeX screenshot placeholders because --allow-missing-screenshots was supplied." >&2
fi

mkdir -p "$ARTIFACTS_DIR/$LANGUAGE"
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/moda-admin-guide.XXXXXX")
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT HUP INT TERM

DRIVER="$BUILD_DIR/admin-user-guide-$LANGUAGE.tex"
cat > "$DRIVER" <<DRIVER_EOF
\\def\\ManualLocale{$LANGUAGE}
\\input{admin-user-guide.tex}
DRIVER_EOF

OUTPUT_STEM="$ARTIFACTS_DIR/$LANGUAGE/admin-user-guide.$LANGUAGE"

build_pdf() {
  command -v xelatex >/dev/null 2>&1 || {
    echo "ERROR: xelatex is required to build PDF output." >&2
    exit 1
  }

  echo "Building PDF for locale $LANGUAGE..."
  rm -f "$OUTPUT_STEM.xelatex.log"

  run_xelatex_pass() {
    pass=$1
    pass_output="$BUILD_DIR/xelatex-pass-$pass.out"
    if ! (
      cd "$MANUALS_DIR"
      xelatex -interaction=nonstopmode -halt-on-error -output-directory="$BUILD_DIR" "$DRIVER"
    ) >"$pass_output" 2>&1; then
      cp "$pass_output" "$OUTPUT_STEM.xelatex.log"
      if [ -f "$BUILD_DIR/admin-user-guide-$LANGUAGE.log" ]; then
        {
          echo
          echo "===== XeLaTeX transcript ====="
          cat "$BUILD_DIR/admin-user-guide-$LANGUAGE.log"
        } >> "$OUTPUT_STEM.xelatex.log"
      fi

      echo "ERROR: XeLaTeX failed while building locale '$LANGUAGE' (pass $pass)." >&2
      echo "Diagnostic log: $OUTPUT_STEM.xelatex.log" >&2
      echo >&2
      tail -n 80 "$pass_output" >&2 || true

      if grep -Eq 'Package graphics Error: Division by 0|Dimension too large' "$pass_output"; then
        echo >&2
        echo "The failure is consistent with an excessively tall screenshot." >&2
        echo "Re-capture the Admin guide with the viewport-bounded capture runner:" >&2
        echo "  npm run guide:admin:capture -- --overwrite" >&2
      fi
      exit 1
    fi
  }

  run_xelatex_pass 1
  run_xelatex_pass 2

  generated="$BUILD_DIR/admin-user-guide-$LANGUAGE.pdf"
  if [ ! -s "$generated" ]; then
    echo "ERROR: XeLaTeX did not produce the expected PDF: $generated" >&2
    exit 1
  fi
  cp "$generated" "$OUTPUT_STEM.pdf"
  echo "created: $OUTPUT_STEM.pdf"
}

build_docx() {
  command -v make4ht >/dev/null 2>&1 || {
    echo "ERROR: make4ht is required to convert the LaTeX guide to HTML for DOCX output." >&2
    exit 1
  }
  command -v pandoc >/dev/null 2>&1 || {
    echo "ERROR: pandoc is required to build DOCX output." >&2
    exit 1
  }

  MAKE4HT_BUILD_DIR="$BUILD_DIR/make4ht"
  mkdir -p "$MAKE4HT_BUILD_DIR"
  echo "Building DOCX for locale $LANGUAGE (LaTeX -> HTML -> DOCX)..."
  (
    cd "$MANUALS_DIR"
    make4ht -x -f html5 -B "$MAKE4HT_BUILD_DIR" "$DRIVER" >/dev/null
  )

  HTML_FILE="$MAKE4HT_BUILD_DIR/admin-user-guide-$LANGUAGE.html"
  if [ ! -s "$HTML_FILE" ]; then
    echo "ERROR: make4ht did not produce the expected HTML: $HTML_FILE" >&2
    exit 1
  fi

  pandoc "$HTML_FILE" \
    --from=html \
    --to=docx \
    --resource-path="$MAKE4HT_BUILD_DIR:$MANUALS_DIR" \
    --output="$OUTPUT_STEM.docx"

  if [ ! -s "$OUTPUT_STEM.docx" ]; then
    echo "ERROR: Pandoc did not produce the expected DOCX: $OUTPUT_STEM.docx" >&2
    exit 1
  fi
  echo "created: $OUTPUT_STEM.docx"
}

case "$FORMAT" in
  pdf) build_pdf ;;
  docx) build_docx ;;
  both) build_pdf; build_docx ;;
esac
