# Moda Interact Shopify Video Production Runbook

This runbook documents the complete process used to create the Moda Interact Shopify product videos: browser capture, deterministic scene choreography, AI narration with Kokoro, subtitles, FFmpeg editing, final MP4 rendering, review proxies, and public YouTube publication.

It is written so the workflow can be repeated without relying on a previous ChatGPT conversation.

## 1. What the workflow produces

There are two related videos:

1. **Onboarding / Free-plan video**
   - Starts with a fresh Shopify development store.
   - Shows Store Category and item-type selection.
   - Tours the onboarding page.
   - Opens Shopify-hosted plan selection.
   - Selects the Free plan in a development store.
   - Approves the test charge.
   - Returns to a healthy Moda Interact Recovery Overview.
   - This is a **one-shot, state-changing recording**.

2. **Main merchant product walkthrough**
   - Uses an already onboarded ACTIVE demo store.
   - Launches Moda Interact from Shopify Admin.
   - Shows Recovery Overview, Recoveries, Recovery Detail, Billing, Usage History, purchased credits, Shopify-hosted plan selection, Promotions, Recovery Settings, Conversation Features, Store Profile and Merchant Knowledge.
   - The normal walkthrough is intentionally **read-only**. It may alter unsaved local form state for demonstration, but it does not submit those changes.

The final main video is produced as:

```text
Playwright scene recordings
        ->
Kokoro narration per scene
        ->
SRT captions
        ->
FFmpeg internal cuts / still-frame holds
        ->
H.264 + AAC narrated scene MP4s
        ->
canonical scene concatenation
        ->
final MP4 + sidecar SRT
```

## 2. Golden rules

Follow these rules before doing anything else.

### 2.1 Use synthetic data only

The public demo store must contain synthetic/test customers and recoveries. The configured Recovery Detail fixture is expected to resolve to an `@example.invalid` customer before the recorder will use it.

Do not publish real customer names, email addresses, phone numbers, order data or message history.

### 2.2 Treat onboarding as one-shot

The onboarding recorder selects a Shopify-hosted plan and therefore changes durable shop/billing state.

Run it only against a fresh disposable development store.

If the run reaches Shopify plan selection or approval and later fails, do **not** blindly rerun the onboarding workflow on the same store. First inspect what state the store reached.

### 2.3 Keep the main walkthrough read-only

The main recorder may:

- navigate pages;
- open read-only details;
- expand `<details>` disclosures;
- scroll;
- open Shopify-hosted plan selection without selecting another plan;
- temporarily change Recovery Behaviour controls in local React/form state, provided **Save recovery behaviour is never pressed**.

The main recorder must not:

- buy top-ups;
- request refunds;
- change a Shopify plan;
- select a promotion;
- save Recovery Behaviour;
- upload/delete/reprocess/reorder Merchant Knowledge sources;
- toggle auto-saving Conversation Features merely for the recording.

Merchant Support remains deferred because opening that route can mark messages as read.

### 2.4 Prepare auto-saving features before recording

Conversation Feature switches auto-save. Prepare the demo store manually before recording.

Recommended public-demo state:

```text
AI Conversations      enabled / always enabled
Checkout Recovery     enabled / always enabled
Product Search        enabled
Merchant Knowledge    enabled
Order Support         optional
```

Wait for Merchant Knowledge sources to finish processing before filming that scene.

### 2.5 Narration must describe launch behavior

Before publication, make sure the wording in the UI and narration reflects the product that will be available when the Shopify listing goes live.

For example, the final narration describes the Moda AI discount option as available behavior; do not describe it as a future capability in the YouTube narration for a launch listing.

## 3. Important repository files

Work from:

```text
moda-interact-documentation/
```

Key files:

```text
package.json
.env
.env.example

automation/config/merchant-video-scenes.ts
    Canonical main-walkthrough scene registry and choreography.

automation/src/video/merchant-demo.ts
    Main Playwright recording implementation and safe demo actions.

automation/src/video/merchant-onboarding.ts
    One-shot fresh-store onboarding recorder.

automation/src/video/merchant-demo-voiceover.ts
    Main Kokoro narration, SRT and final render pipeline.

automation/src/video/merchant-onboarding-voiceover.ts
    Onboarding narration/render pipeline.

videos/merchant-demo/storyboard.en.json
    Human-readable main walkthrough storyboard.

videos/merchant-demo/voiceover.en.json
    Main narration text, cue starts and reviewed internal loading cuts.

videos/merchant-onboarding/storyboard.en.json
    Onboarding storyboard.

videos/merchant-onboarding/voiceover.en.json
    Onboarding narration text and cue starts.

scripts/setup-kokoro.sh
scripts/kokoro_tts.py
```

## 4. One-time workstation setup

### 4.1 Node

The documentation project requires Node 24.19.0 or newer in the Node 24 line used by the workspace.

From the workspace root:

```bash
node --version
```

Expected project baseline:

```text
v24.19.0
```

If Node is unavailable, use the workspace bootstrap rather than inventing another Node path:

```bash
source scripts/bootstrap-node.sh
```

Then:

```bash
cd moda-interact-documentation
npm ci
npm run playwright:install
```

### 4.2 FFmpeg

FFmpeg and ffprobe are required for trimming, review proxies, audio mixing and final video rendering.

```bash
brew install ffmpeg

which ffmpeg
which ffprobe
```

### 4.3 Python and eSpeak NG for Kokoro

On macOS, install a supported Python and the system eSpeak NG library/data pair:

```bash
brew install python@3.12 espeak-ng
```

Verify:

```bash
python3.12 --version
brew --prefix espeak-ng

ESPEAK_PREFIX="$(brew --prefix espeak-ng)"
ls -l "$ESPEAK_PREFIX"/lib/libespeak-ng*.dylib
ls -l "$ESPEAK_PREFIX/share/espeak-ng-data/phontab"
```

### 4.4 Run the production doctor

If you have copied the helper scripts from this runbook bundle into the documentation repository:

```bash
bash scripts/video-doctor.sh
```

Fix hard failures before recording.

## 5. Configure `.env`

Create local config if necessary:

```bash
cp .env.example .env
```

Do not commit account-specific values or credentials.

### 5.1 Required Shopify navigation settings

Example:

```bash
SHOPIFY_STORE_ADMIN_URL=https://admin.shopify.com/store/moda-demo-store
SHOPIFY_MERCHANT_APP_URL=https://admin.shopify.com/store/moda-demo-store/apps/moda-interact/app
SHOPIFY_APP_NAV_LABEL=moda-interact
```

These two URLs are deliberately different:

```text
SHOPIFY_STORE_ADMIN_URL
    Shopify store root

SHOPIFY_MERCHANT_APP_URL
    installed Moda Interact app URL containing /apps/<handle>
```

The safest way to get `SHOPIFY_MERCHANT_APP_URL` is to click Moda Interact inside Shopify Admin and copy the resulting browser URL.

### 5.2 Verify the effective value, not just the file

A shell-exported environment variable can override `.env`.

Check:

```bash
printf 'shell: %s\n' "$SHOPIFY_MERCHANT_APP_URL"
grep -n '^SHOPIFY_MERCHANT_APP_URL=' .env
```

If an old shell value exists:

```bash
unset SHOPIFY_MERCHANT_APP_URL
```

Then verify what the Node process actually sees:

```bash
npx tsx -e "import 'dotenv/config'; console.log(process.env.SHOPIFY_MERCHANT_APP_URL)"
```

It must contain `/apps/<handle>`.

### 5.3 Main walkthrough fixture config

Recommended:

```bash
SHOPIFY_DEMO_RECOVERY_CUSTOMER=Ada Lovelace
SHOPIFY_DEMO_FIXED_DISCOUNT_LABEL=Buy three, get 30 percent off
SHOPIFY_DEMO_FOLLOW_UP_MINUTES=120
SHOPIFY_DEMO_KNOWLEDGE_PURPOSE=Pricing
```

Use the exact visible discount label if you want deterministic footage. Leaving the discount label blank lets the recorder use the first safe selectable synthetic discount.

### 5.4 Onboarding config

For a fresh store:

```bash
SHOPIFY_ONBOARDING_FREE_PLAN_NAME=Free
SHOPIFY_ONBOARDING_STORE_CATEGORY=Apparel & Accessories
SHOPIFY_ONBOARDING_STORE_ITEM_TYPES=Clothing Accessories|Handbag & Wallet Accessories
SHOPIFY_ONBOARDING_CHOOSE_PLAN_LABEL=View plans in Shopify
SHOPIFY_ONBOARDING_PLAN_ACTION_LABEL=
SHOPIFY_ONBOARDING_CONFIRM_LABEL=
```

`SHOPIFY_ONBOARDING_STORE_ITEM_TYPES` uses `|` between exact visible labels.

Development stores commonly show `Test with this plan` and then `Approve`; the recorder detects these automatically.

### 5.5 Voiceover config

```bash
VOICEOVER_PROVIDER=kokoro
VOICEOVER_VOICE=bf_emma
VOICEOVER_LANGUAGE=en-gb
VOICEOVER_SPEED=1.08
```

No API key is required.

## 6. Authenticate Shopify once

Run:

```bash
npm run video:merchant:auth
```

Complete Shopify authentication in the headed browser when requested.

The reusable state defaults to:

```text
playwright/.auth/shopify.json
```

If the recorder later redirects through Shopify/Google instead of reaching the app, refresh authentication:

```bash
npm run video:merchant:auth
```

## 7. Create the onboarding / Free-plan video

Use a **fresh development store**.

### 7.1 Confirm the store is still onboarding

Open Moda Interact manually. You should see the onboarding page rather than Recovery Overview.

### 7.2 Inspect the onboarding plan without mutating anything

```bash
npm run video:merchant:onboarding:plan -- --language en
```

Confirm the configured category/item types and Free plan.

### 7.3 Record the one-shot flow

```bash
npm run video:merchant:onboarding:capture -- \
  --language en \
  --confirm-mutation \
  --headed
```

Expected story:

```text
fresh store
-> category + item types
-> smooth onboarding page tour
-> View plans in Shopify
-> Shopify Select a plan
-> Free / Test with this plan
-> Approve charge
-> return to Moda
-> healthy Recovery Overview
```

The run is not successful merely because Recovery Overview appears. The final Free-plan state must be safely mapped and show usable recovery capacity.

### 7.4 Source clip

Expected raw output:

```text
artifacts/videos/en/onboarding/01-onboarding-free-plan.webm
```

The narration pipeline chooses the source in this order when available:

```text
01-onboarding-free-plan.final.webm
01-onboarding-free-plan.edited.webm
01-onboarding-free-plan.webm
```

### 7.5 Optional manual internal cut

If Shopify introduces long internal loading gaps, make a copy first:

```bash
cp \
  artifacts/videos/en/onboarding/01-onboarding-free-plan.webm \
  artifacts/videos/en/onboarding/01-onboarding-free-plan.raw.webm
```

Example of retaining three ranges with short fades:

```bash
ffmpeg \
  -i artifacts/videos/en/onboarding/01-onboarding-free-plan.raw.webm \
  -filter_complex "
    [0:v]trim=start=0:end=22.4,setpts=PTS-STARTPTS[v0];
    [0:v]trim=start=29.3:end=44.4,setpts=PTS-STARTPTS[v1];
    [0:v]trim=start=55.35:end=58.04,setpts=PTS-STARTPTS[v2];
    [v0][v1]xfade=transition=fade:duration=0.25:offset=22.15[x1];
    [x1][v2]xfade=transition=fade:duration=0.25:offset=37.00[v]
  " \
  -map "[v]" \
  -c:v libvpx-vp9 \
  -crf 24 -b:v 0 -row-mt 1 -pix_fmt yuv420p \
  artifacts/videos/en/onboarding/01-onboarding-free-plan.edited.webm
```

The exact timestamps depend on the recording. Inspect rather than copying old timestamps blindly.

## 8. Set up Kokoro once

Run:

```bash
npm run video:voiceover:setup
```

This creates:

```text
artifacts/video-tools/kokoro/.venv/
artifacts/video-tools/kokoro/kokoro-v1.0.onnx
artifacts/video-tools/kokoro/voices-v1.0.bin
```

If you see an error mentioning a missing `espeak-ng-data/phontab`, install system eSpeak NG:

```bash
brew install espeak-ng
npm run video:voiceover:setup
```

The setup validates that the British English `bf_emma` voice exists.

## 9. Narrate and render onboarding

### 9.1 Edit narration when needed

File:

```text
videos/merchant-onboarding/voiceover.en.json
```

Each cue contains:

```json
{
  "id": "store-context",
  "startSeconds": 4.9,
  "text": "..."
}
```

`startSeconds` is where the sentence begins in the edited visual clip.

### 9.2 Generate narration and captions

```bash
npm run video:merchant:onboarding:narrate -- --language en --overwrite
```

Outputs include:

```text
artifacts/videos/en/onboarding/voiceover/*.wav
artifacts/videos/en/onboarding/01-onboarding-free-plan.en.narration.wav
artifacts/videos/en/onboarding/01-onboarding-free-plan.en.srt
```

If the command reports that one cue overlaps the next:

1. shorten the sentence first;
2. move the next cue if the visual timing allows it;
3. only then consider a small increase in `VOICEOVER_SPEED`.

Do not solve every timing problem by making the voice unnaturally fast.

### 9.3 Render onboarding

```bash
npm run video:merchant:onboarding:render -- --language en --overwrite
```

Expected final file:

```text
artifacts/videos/en/onboarding/01-onboarding-free-plan.en.mp4
```

## 10. Prepare the ACTIVE demo store for the main walkthrough

The main recorder expects the ACTIVE merchant experience.

Check:

- shop ACTIVE;
- onboarding complete;
- subscription ACTIVE or TRIALING;
- no unwanted scheduled cancellation/pending plan change in the public demo;
- synthetic recovery data exists;
- `SHOPIFY_DEMO_RECOVERY_CUSTOMER` resolves to an `@example.invalid` fixture;
- Product Search enabled if you plan to describe it as enabled;
- Merchant Knowledge enabled;
- Merchant Knowledge sources processed/usable;
- demo promotions/credits exist if you want those scenes to be meaningful.

## 11. Main walkthrough scene order

The current canonical registry is:

```text
01 shopify-launch              Launch Moda Interact from Shopify Admin
02 overview                    Recovery overview
03 recoveries                  Recovery history
04 recovery-detail             Recovery detail and AI conversation
05 billing                     Billing and recovery capacity
06 billing-usage-history       Usage history and linked recovery evidence
07 billing-purchased-credits   Purchased credit history/refund eligibility
08 billing-change-plan         Shopify-hosted plan selection
09 promotions                  Promotions and promotion history
10 recovery-settings           Recovery behaviour
11 features                    Conversation features
12 store-profile               Store profile / assistant context
13 merchant-knowledge          Merchant Knowledge sources
14 support                     DEFERRED because opening can write read receipts
15 closing                     Return to overview
```

## 12. Record the main walkthrough

### 12.1 Inspect plan

```bash
npm run video:merchant:plan -- --language en
```

### 12.2 Record every safe scene

```bash
npm run video:merchant:capture -- \
  --language en \
  --overwrite \
  --headed
```

Expected outputs:

```text
artifacts/videos/en/scenes/*.webm
artifacts/videos/en/capture-report.json
```

### 12.3 Re-record only one scene

Example:

```bash
npm run video:merchant:capture -- \
  --language en \
  --scene merchant-knowledge \
  --overwrite \
  --headed
```

Useful scene IDs are the names listed in section 11.

### 12.4 Important source-integrity rule

If you re-record a scene **after narration has already been generated**, regenerate narration before rendering. VIDEO-003 tracks source size/timestamps and can reject stale narration metadata.

## 13. Create lightweight video review proxies

Raw Playwright footage can be hundreds of megabytes. Do not copy or upload all raw sources just for review.

Use the helper script:

```bash
bash scripts/video-review-bundle.sh --locale en --height 540
```

It reads the canonical `capture-report.json`, so stale old WebMs are not accidentally included.

Output:

```text
artifacts/videos/en/merchant-walkthrough-review.zip
```

For an even smaller bundle:

```bash
bash scripts/video-review-bundle.sh --locale en --height 360
```

## 14. Edit main narration and internal cuts

File:

```text
videos/merchant-demo/voiceover.en.json
```

A scene can contain both narration cues and optional visual `keepSegments`.

Example:

```json
{
  "id": "billing-change-plan",
  "keepSegments": [
    { "startSeconds": 0, "endSeconds": 7.65 },
    { "startSeconds": 10.75, "endSeconds": 13.8 },
    { "startSeconds": 15.75, "endSeconds": null }
  ],
  "cues": [
    {
      "id": "change-plan",
      "startSeconds": 0.5,
      "text": "..."
    }
  ]
}
```

`keepSegments` remove reviewed internal loading gaps without modifying the raw source file.

### 14.1 How to find cut timestamps

Get duration:

```bash
ffprobe -v error \
  -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  artifacts/videos/en/scenes/08-billing-change-plan.webm
```

Inspect a frame at a candidate timestamp:

```bash
ffmpeg -y \
  -ss 10.75 \
  -i artifacts/videos/en/scenes/08-billing-change-plan.webm \
  -frames:v 1 /tmp/frame.jpg

open /tmp/frame.jpg
```

Choose boundaries around loading/skeleton footage, not around meaningful user actions.

## 15. Generate the main Kokoro narration

```bash
npm run video:merchant:narrate -- --language en --overwrite
```

Outputs:

```text
artifacts/videos/en/main-voiceover/voiceover-report.json
artifacts/videos/en/narration/*.wav
artifacts/videos/en/moda-interact-shopify-demo.en.srt
```

### 15.1 Make a lightweight audio review bundle

```bash
bash scripts/video-audio-review-bundle.sh --locale en
```

Output:

```text
artifacts/videos/en/merchant-walkthrough-audio-review.zip
```

This contains compressed MP3 review copies, the voiceover report and SRT. Keep the original WAVs locally for final rendering.

## 16. Render the final main video

The simplest helper command is:

```bash
bash scripts/video-build-main.sh --locale en --overwrite
```

Equivalent manual commands:

```bash
npm run video:merchant:narrate -- --language en --overwrite
npm run video:merchant:render -- --language en --overwrite
```

Expected final outputs:

```text
artifacts/videos/en/moda-interact-shopify-demo.en.mp4
artifacts/videos/en/moda-interact-shopify-demo.en.srt
artifacts/videos/en/main-render-report.json
artifacts/videos/en/narrated-scenes/*.mp4
```

The final MP4 uses:

```text
1920x1080
H.264 video
AAC audio
embedded English subtitle track
fast-start MP4
```

Keep the standalone SRT for YouTube even though an embedded subtitle stream also exists.

## 17. Make a lightweight final review copy

The full-quality MP4 can still be large. Create a 720p review copy:

```bash
ffmpeg -y \
  -i artifacts/videos/en/moda-interact-shopify-demo.en.mp4 \
  -vf "scale=-2:720" \
  -c:v libx264 \
  -preset veryfast \
  -crf 30 \
  -c:a aac \
  -b:a 96k \
  -movflags +faststart \
  artifacts/videos/en/moda-interact-shopify-demo.review.mp4
```

Review the complete video for:

- narration matches the screen;
- no long loading gaps;
- no real customer data;
- no secret/admin URLs or tokens;
- no stale product wording;
- smooth scrolling reaches expanded fields;
- no state-changing action occurs unexpectedly;
- subtitles align with narration;
- final Recovery Overview state looks healthy.

## 18. Package YouTube assets

If you copied the helper scripts from this bundle:

```bash
bash scripts/video-package-youtube.sh \
  --locale en \
  --thumbnail /path/to/your-thumbnail.png
```

This creates:

```text
artifacts/videos/en/youtube-package/
    moda-interact-shopify-demo.en.mp4
    moda-interact-shopify-demo.en.srt
    thumbnail.png
    youtube-metadata.txt
    technical-summary.txt
```

## 19. Publish the video publicly on YouTube

Use the **full-quality** final MP4, not a review proxy.

1. Open YouTube Studio and sign in to the Moda Interact channel.
2. Choose **Create -> Upload videos**.
3. Upload:
   ```text
   artifacts/videos/en/moda-interact-shopify-demo.en.mp4
   ```
4. Suggested title:
   ```text
   Moda Interact for Shopify – AI-Powered Abandoned Checkout Recovery
   ```
5. Use the description in `youtube-package/youtube-metadata.txt`.
6. Upload the thumbnail.
7. Set Audience to **No, it is not made for kids**.
8. Upload the English caption file:
   ```text
   moda-interact-shopify-demo.en.srt
   ```
9. Let YouTube complete its checks.
10. Set Visibility to **Public**.
11. Publish.
12. Wait until 1080p processing is complete.
13. Open the URL in an incognito/private browser and verify it is publicly viewable without signing in.
14. Use the public YouTube URL in the Shopify listing.

## 20. When the application changes

Do not automatically re-record everything.

### 20.1 Identify the affected scene

Run:

```bash
npm run video:merchant:plan -- --language en
```

Find the relevant scene ID.

### 20.2 If a selector or route changed

Update:

```text
automation/config/merchant-video-scenes.ts
```

Typical scene fields:

```text
id
order
title
route
readyLocator
steps
capture
```

Available choreography concepts include:

```text
hold
scrollTo
openDisclosure
demoAction
```

Keep the smallest selector that uniquely identifies the intended visible state.

### 20.3 If a new read-only interaction is required

Add a narrowly named safe demo action in:

```text
automation/src/video/merchant-demo.ts
```

Do not add a generic unrestricted click action. Each action should encode its safety boundary.

Examples of good action names:

```text
open-synthetic-recovery
open-purchased-credit-history
open-shopify-plan-selector
show-fixed-discount-example
```

### 20.4 Preserve state safety

Before automating any control, determine whether it:

- only changes local form state;
- performs navigation/read-only state;
- auto-saves immediately;
- submits a persistent mutation.

If it auto-saves or mutates durable state, configure the fixture beforehand rather than clicking it in the read-only walkthrough.

### 20.5 Update storyboard/narration if scene order changes

Files:

```text
videos/merchant-demo/storyboard.en.json
videos/merchant-demo/voiceover.en.json
```

The enabled narration scene order must match the canonical capture registry.

### 20.6 Validate

```bash
npm run typecheck
npm test
npm run video:merchant:plan -- --language en
```

Then capture only the affected scene and review it.

## 21. Troubleshooting

### Error: `SHOPIFY_MERCHANT_APP_URL must ... contain '/apps/<handle>'`

Your effective config is using the Shopify store root instead of the installed app URL.

Check:

```bash
printf '%s\n' "$SHOPIFY_MERCHANT_APP_URL"
grep -n '^SHOPIFY_MERCHANT_APP_URL=' .env
npx tsx -e "import 'dotenv/config'; console.log(process.env.SHOPIFY_MERCHANT_APP_URL)"
```

If the shell variable is stale:

```bash
unset SHOPIFY_MERCHANT_APP_URL
```

### Capture fails by redirecting to login

Refresh Shopify storage state:

```bash
npm run video:merchant:auth
```

### Recovery Detail refuses the selected customer

Use synthetic fixture data. Set:

```bash
SHOPIFY_DEMO_RECOVERY_CUSTOMER=Ada Lovelace
```

and ensure that recovery resolves to an `@example.invalid` customer.

### Support is skipped

This is deliberate. Loading the Support route can mark unread admin/system messages as read, so the automatic read-only walkthrough defers it.

### Merchant Knowledge says processing is paused

Enable the Merchant Knowledge Conversation Feature manually and wait for configured sources to process. Do not have the read-only recorder click the auto-saving feature toggle.

### Kokoro error mentions `phontab`

```bash
brew install espeak-ng
npm run video:voiceover:setup
```

### Narration cue overlap

Example:

```text
Narration cue 'intro' ends at 5.00s but 'store-context' starts at 4.90s
```

Preferred fix order:

1. shorten narration;
2. adjust cue start time if the visuals support it;
3. make a small speed change.

### Renderer says source scene changed after narration

A scene was re-recorded after narration metadata was generated.

Run:

```bash
npm run video:merchant:narrate -- --language en --overwrite
npm run video:merchant:render -- --language en --overwrite
```

### Raw clips are too large to share

```bash
bash scripts/video-review-bundle.sh --locale en --height 540
```

### WAVs are too large to share

```bash
bash scripts/video-audio-review-bundle.sh --locale en
```

### An old scene file remains after scene reordering

The final renderer follows the canonical scene registry, not a directory glob, so a stale WebM should not enter the final video. You may still remove stale files for cleanliness after confirming they are no longer referenced by `capture-report.json`.

## 22. Quick-reference command sheet

### One-time machine setup

```bash
brew install ffmpeg python@3.12 espeak-ng
npm ci
npm run playwright:install
npm run video:voiceover:setup
```

### Authenticate

```bash
npm run video:merchant:auth
```

### Fresh-store onboarding

```bash
npm run video:merchant:onboarding:plan -- --language en
npm run video:merchant:onboarding:capture -- --language en --confirm-mutation --headed
npm run video:merchant:onboarding:narrate -- --language en --overwrite
npm run video:merchant:onboarding:render -- --language en --overwrite
```

### ACTIVE-store main walkthrough

```bash
npm run video:merchant:plan -- --language en
npm run video:merchant:capture -- --language en --overwrite --headed
npm run video:merchant:narrate -- --language en --overwrite
npm run video:merchant:render -- --language en --overwrite
```

### Re-record one scene

```bash
npm run video:merchant:capture -- \
  --language en \
  --scene recovery-settings \
  --overwrite \
  --headed

npm run video:merchant:narrate -- --language en --overwrite
npm run video:merchant:render -- --language en --overwrite
```

### Create review bundles

```bash
bash scripts/video-review-bundle.sh --locale en --height 540
bash scripts/video-audio-review-bundle.sh --locale en
```

### Build and package final YouTube assets

```bash
bash scripts/video-build-main.sh --locale en --overwrite
bash scripts/video-package-youtube.sh --locale en --thumbnail /path/to/thumbnail.png
```

## 23. Recommended source-control policy

Commit:

- Playwright/voiceover implementation;
- scene registry;
- storyboards;
- narration JSON;
- helper scripts;
- documentation/runbooks.

Do **not** commit:

- Playwright auth storage state;
- OAuth tokens/client-secret files;
- Kokoro model/voice binaries;
- generated WAVs;
- generated raw WebMs;
- rendered MP4s;
- temporary review bundles;
- account-specific `.env` values.

Before publishing or sharing the repository, verify credential files are not tracked:

```bash
git ls-files youtube-access.json youtube-token.json .youtube
```

Ideally this prints nothing.

## 24. Final publication checklist

Before using the YouTube URL in the Shopify listing, verify all of the following:

```text
[ ] Only synthetic customer/store data is visible.
[ ] Recovery Detail shows the intended synthetic conversation.
[ ] Product Search / Merchant Knowledge visual state matches narration.
[ ] Merchant Knowledge sources are processed and usable.
[ ] No stale "future capability" launch wording contradicts the final narration.
[ ] No refund, top-up, plan change, promotion selection or settings save occurred during the read-only walkthrough.
[ ] Final video is 1920x1080 H.264 with audible AAC narration.
[ ] English SRT captions are uploaded.
[ ] Thumbnail is uploaded.
[ ] YouTube visibility is Public.
[ ] 1080p processing is complete.
[ ] Video opens in an incognito/private window without authentication.
[ ] Public YouTube URL has been copied into the Shopify listing.
```

That is the complete repeatable workflow used for the current Moda Interact product videos.
