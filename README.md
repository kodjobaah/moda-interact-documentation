# Moda Interact Documentation

Dedicated repository for Moda Interact documentation source, translations, localized screenshots, and the Playwright tooling used to capture documentation images.

## Ownership

This repository owns documentation artifacts only. It does not own implementation in `moda-interact`, `moda-interact-admin`, `moda-interact-background`, or other application repositories.

## Key design rules

- `manuals/screenshot-manifest.csv` is the canonical list of screenshots required by the manuals.
- `automation/config/capture-targets.ts` describes how each screenshot ID is reached and captured.
- Screenshot filenames remain `<screenshot-id>.<locale>.png` beside the LaTeX wrappers under `manuals/`.
- Browser capture is local/on-demand. The documentation agent should normally author and validate the Playwright tooling without running all remote captures.
- Authentication state and credentials are never committed.
- Screenshot automation is read-only: navigation and visual state changes are allowed; business/data mutations are not.

## Suggested local commands after the Playwright implementation exists

```text
npm run capture:plan
npm run auth:shopify
npm run auth:admin
npm run capture:merchant -- --locale=en --id=merchant-usage-overview
npm run capture:admin -- --locale=en --id=admin-tenant-directory
npm run capture:locale -- --locale=fr
npm run capture:all-locales   # explicit expensive operation only
```

## Git initialization

```bash
git init
git lfs install
git add .
git commit -m "Initialize Moda Interact documentation repository"
```

The agent must not commit or push unless explicitly authorised for that task.

## Administrator User Guide workflow

The administrator guide now has one English capture command and one language/format build command.

```bash
# 1. Capture the current English Admin UI. The default is headed so each page is visible.
npm run guide:admin:capture

# Re-capture existing images, or repair one data-dependent image only.
npm run guide:admin:capture -- --overwrite
npm run guide:admin:capture -- --id admin-billing-overview --overwrite

# 2. Build from the same localized LaTeX source.
npm run guide:build -- --language en --format pdf
npm run guide:build -- --language en --format docx
```

Generated manuals are written under `artifacts/manuals/<locale>/`.

Queue job diagnostics are optional capture state because a queue may legitimately be empty. The capture workflow reports that condition without failing and never creates, retries or mutates a queue job just to obtain documentation.

For another language, add `manuals/content/<locale>/admin-user-guide-metadata.tex` and
`admin-user-guide-content.tex`, plus screenshots named `<screenshot-id>.<locale>.png` when the Admin
UI genuinely supports that locale. The build command accepts `--allow-missing-screenshots` when a
translator needs a draft containing the existing LaTeX screenshot placeholders.

PDF output uses XeLaTeX. DOCX output deliberately uses `make4ht` (XeLaTeX backend) followed by
Pandoc instead of direct LaTeX-to-DOCX conversion; this preserves the guide's callouts, tables and
embedded screenshots more reliably.

## Merchant YouTube demo — VIDEO-001 capture foundation

VIDEO-001 records deterministic **English, read-only** merchant demo scenes at 1920×1080. Raw Playwright recordings are trimmed with FFmpeg to remove page-loading lead-in/lead-out. VIDEO-002 supplies local Kokoro narration for onboarding, and VIDEO-003 supplies narration, subtitles and final multi-scene composition for the main merchant walkthrough. VIDEO-001 uses browser-native smooth scrolling between relevant page sections so the recording shows the merchant moving through the interface instead of jumping instantly between targets.

Local prerequisites:

- a current Shopify Playwright auth state (`npm run video:merchant:auth`);
- `ffmpeg` on `PATH` for deterministic scene trimming (`brew install ffmpeg` on macOS);
- `SHOPIFY_STORE_ADMIN_URL` for the opening Shopify Admin scene;
- `SHOPIFY_MERCHANT_APP_URL` for the installed embedded app;
- `SHOPIFY_APP_NAV_LABEL` matching the app label visible in Shopify Admin;
- a synthetic merchant fixture in the **ACTIVE** experience: shop `ACTIVE`, onboarding complete, and subscription `ACTIVE` or `TRIALING`. The recorder checks the ACTIVE-only navigation before recording and fails fast if the fixture is in onboarding, post-contract, frozen, support-only, or another restricted state.

Plan the capture without opening a browser:

```bash
npm run video:merchant:plan -- --language en
```

Record all currently safe scenes:

```bash
npm run video:merchant:capture -- --language en --headed
```

Re-record one scene only:

```bash
npm run video:merchant:capture -- \
  --language en \
  --scene merchant-knowledge \
  --overwrite \
  --headed
```

Scene clips are written to `artifacts/videos/en/scenes/` with stable names such as
`01-shopify-launch.webm` and `09-merchant-knowledge.webm`. Loading footage before the first intentional
visual beat is trimmed automatically. The English editorial storyboard lives at
`videos/merchant-demo/storyboard.en.json`. The ACTIVE walkthrough also refuses fixtures that visibly
show a scheduled cancellation or pending plan change, so a public demo does not open on a misleading
billing lifecycle warning.

The capture configuration exposes only holds, scrolling and a narrowly constrained `openDisclosure`
operation for native `<details>` elements after route navigation; it has no generic click, form-submit or
mutation action. Conversation Features, Store Profile and Merchant Knowledge are captured from the
current consolidated Recovery Settings surface, and the Promotions scene expands the read-only history
disclosure. Merchant Knowledge source names and source locations are blurred in the recording.

The support scene is intentionally **deferred** in VIDEO-001 because
the current merchant-support route can mark unread administrative messages as read during page load.
That implicit POST would violate the read-only recording contract.


### Fresh-store onboarding video

Onboarding is intentionally a **separate one-shot capture flow** because it changes durable state. A fresh
store starts in the `ONBOARDING` merchant experience, while the main walkthrough requires `ACTIVE`. The
onboarding recording therefore becomes the natural setup step for a new demo store: it records the welcome
surface, confirms the Store Category and item types, opens Shopify-hosted App Pricing, selects the configured Free plan, pauses on Shopify's approval screen, waits for Moda billing reconciliation/onboarding completion, and finishes only on a healthy Free-plan Recovery overview. Before leaving onboarding, the capture performs a paced top-to-bottom scroll through the product introduction, benefits, how-it-works flow and pricing catalogue, then smoothly returns to the plan action.

On Shopify **development stores**, the hosted pricing page commonly labels plan actions `Test with this plan` and may display test prices such as `$0`. The public narration explicitly identifies this as development-store billing; live stores see Shopify's real pricing for paid plans. After approval, the recorder does **not** accept the first visible Overview as success: it requires the Free plan to expose its lifetime recovery allowance and rejects `Your subscription could not be safely mapped` as an incomplete/unsafe billing state.

Plan the flow first:

```bash
npm run video:merchant:onboarding:plan -- --language en
```

Then, **only on a fresh disposable development store**, run:

```bash
npm run video:merchant:onboarding:capture -- \
  --language en \
  --confirm-mutation \
  --headed
```

The explicit `--confirm-mutation` flag is required because this flow persists the Store Category, its selected
item types, and the Shopify plan. Do not rerun it against the same store after the Free plan has been selected. The
result is written to `artifacts/videos/en/onboarding/01-onboarding-free-plan.webm`.

By default the Shopify plan display name is `Free`. Override `SHOPIFY_ONBOARDING_FREE_PLAN_NAME` if your
Partner Dashboard uses another display name. `SHOPIFY_ONBOARDING_STORE_CATEGORY` can optionally pin the
visible Store Category used by the demo. The onboarding screen can also refine that broad category using the
item-type checkboxes shown underneath it. Set `SHOPIFY_ONBOARDING_STORE_ITEM_TYPES` to the exact visible labels
you want selected, separated by `|`, for example `Clothing Accessories|Handbag & Wallet Accessories`. When
this value is omitted, the recorder pauses on the checkboxes but preserves the application's suggested/default
selection. If Shopify changes the text on the hosted pricing action or a confirmation control, set the exact
visible label with `SHOPIFY_ONBOARDING_PLAN_ACTION_LABEL` or
`SHOPIFY_ONBOARDING_CONFIRM_LABEL` rather than broadening the automation to an unsafe generic click.

## Merchant YouTube demo — VIDEO-002 local AI narration and subtitles

VIDEO-002 adds **local Kokoro narration** to the validated onboarding clip. No cloud account or API key is required. The default voice is the British English Kokoro voice `bf_emma`; narration and subtitles are generated from the same checked-in cue timeline so they cannot silently drift apart.

Set up Kokoro once:

```bash
npm run video:voiceover:setup
```

The setup creates an isolated Python environment under `artifacts/video-tools/kokoro/`, installs `kokoro-onnx`, and downloads the Kokoro v1.0 model/voice pack. The model files are roughly 355 MB in total and remain gitignored under `artifacts/`.

Generate the onboarding narration and `.srt` captions:

```bash
npm run video:merchant:onboarding:narrate -- --language en
```

VIDEO-002 chooses the source clip in this order: `01-onboarding-free-plan.final.webm`, then `01-onboarding-free-plan.edited.webm`, then the normal capture. Override that with `VIDEO_ONBOARDING_SOURCE` when required. The English narration timeline is `videos/merchant-onboarding/voiceover.en.json`.

Render the YouTube-ready MP4 with the narration and an embedded English subtitle track:

```bash
npm run video:merchant:onboarding:render -- --language en
```

Outputs live beside the onboarding capture:

```text
artifacts/videos/en/onboarding/
├── 01-onboarding-free-plan.en.narration.wav
├── 01-onboarding-free-plan.en.srt
└── 01-onboarding-free-plan.en.mp4
```

Upload the `.srt` separately to YouTube even though the MP4 also contains a subtitle track; YouTube caption management is clearer when the sidecar caption file remains explicit. Override the local voice with `VOICEOVER_VOICE`, `VOICEOVER_LANGUAGE`, or `VOICEOVER_SPEED`. If a generated cue would overlap the next cue or run beyond the source video, generation stops and asks for a timeline/speed correction rather than silently compressing or truncating speech.

## Merchant YouTube demo — VIDEO-003 main walkthrough narration and final render

VIDEO-003 turns the validated ACTIVE-store scene captures into the final merchant walkthrough. It reuses the local Kokoro setup from VIDEO-002, generates scene-specific narration and YouTube captions, removes the reviewed internal Shopify loading gaps from the launch and hosted-plan scenes, extends a scene with a still-frame hold when narration needs more time, and assembles the enabled scenes into one 1920×1080 H.264/AAC MP4.

The checked-in English narration timeline is:

```text
videos/merchant-demo/voiceover.en.json
```

The narration is production-facing. In particular, the Recovery Settings narration describes **Let Moda AI choose the best applicable discount** as an available mode and does not call it a future capability.

Generate narration for the complete walkthrough after all enabled scene clips have been captured:

```bash
npm run video:merchant:narrate -- --language en
```

Regenerate after text, voice, or source-video changes with:

```bash
npm run video:merchant:narrate -- --language en --overwrite
```

Then build the final YouTube-ready video:

```bash
npm run video:merchant:render -- --language en
```

Use `--overwrite` when intentionally replacing an existing final render.

The main outputs are:

```text
artifacts/videos/en/
├── moda-interact-shopify-demo.en.mp4
├── moda-interact-shopify-demo.en.srt
├── main-render-report.json
├── narration/
│   └── <scene>.wav
├── narrated-scenes/
│   └── <scene>.mp4
└── main-voiceover/
    └── voiceover-report.json
```

The final MP4 contains H.264 video, AAC narration and an embedded English subtitle track. Keep the sidecar `.srt` for explicit YouTube caption upload. The renderer consumes scene files by the canonical VIDEO-001 scene registry rather than globbing the directory, so stale clips such as an older pre-reorder `04-billing.webm` cannot enter the final video accidentally.

If a captured source scene changes after narration is generated, the renderer stops and requires narration regeneration. This prevents subtitle/audio timing from silently drifting after a recapture.
