#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

locale="en"
thumbnail=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --locale) locale="$2"; shift 2 ;;
    --thumbnail) thumbnail="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

video="artifacts/videos/$locale/moda-interact-shopify-demo.$locale.mp4"
srt="artifacts/videos/$locale/moda-interact-shopify-demo.$locale.srt"
out="artifacts/videos/$locale/youtube-package"

[[ -f "$video" ]] || { echo "Missing $video" >&2; exit 1; }
[[ -f "$srt" ]] || { echo "Missing $srt" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo 'ffprobe is required' >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out"
cp "$video" "$out/"
cp "$srt" "$out/"
if [[ -n "$thumbnail" ]]; then
  [[ -f "$thumbnail" ]] || { echo "Thumbnail not found: $thumbnail" >&2; exit 1; }
  cp "$thumbnail" "$out/thumbnail.${thumbnail##*.}"
fi

cat > "$out/youtube-metadata.txt" <<'TXT'
TITLE
Moda Interact for Shopify – AI-Powered Abandoned Checkout Recovery

DESCRIPTION
See how Moda Interact helps Shopify merchants recover abandoned checkouts using AI-assisted WhatsApp conversations.

This walkthrough covers:
• Recovery overview and recovery history
• AI/customer recovery conversations
• Billing and recovery capacity
• Usage history and purchased credits
• Shopify-managed plan changes
• Promotions
• Recovery behaviour and follow-ups
• Conversation features
• Store profile
• Merchant Knowledge

Learn more about Moda Interact:
https://www.modainteract.com/

YOUTUBE SETTINGS
Audience: No, it is not made for kids
Visibility: Public
Captions: upload the .srt file in this package as English captions
Wait for 1080p processing before using the URL in the Shopify listing.
TXT

{
  echo 'VIDEO TECHNICAL SUMMARY'
  ffprobe -v error \
    -show_entries format=duration,size:stream=index,codec_name,codec_type,width,height \
    -of default=noprint_wrappers=1 "$video"
} > "$out/technical-summary.txt"

echo "created: $out"
find "$out" -maxdepth 1 -type f -print
