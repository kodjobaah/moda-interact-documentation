# Screenshot capture automation contract

The Playwright implementation belongs here.

## Canonical inputs

1. `../manuals/screenshot-manifest.csv` — what the manuals require.
2. `config/capture-targets.ts` — how a screenshot ID is reached and captured.
3. `config/locales.ts` — supported documentation locales and UI capture support.

## Required execution modes

- `capture:plan`: no browser. Validate manifest coverage and print what would be captured.
- `auth:shopify`: headed authentication/bootstrap for Shopify and save gitignored storage state.
- `auth:admin`: headed Google OAuth bootstrap for Moda Admin and save gitignored storage state.
  The bootstrap waits for the hydrated `Continue with Google` control before clicking it, and verifies that the browser has returned to the protected Admin origin before saving state.
- `capture:merchant`: capture selected merchant targets, default one locale.
- `capture:admin`: capture selected admin targets, default one locale.
- `capture:locale`: capture all supported targets for one requested locale.
- `capture:all-locales`: explicit expensive operation; never the default.

## Capture rules

- Fixed desktop viewport and device scale.
- Prefer `locator.screenshot()` for a documented element/card/panel and `page.screenshot()` only for a screen overview.
- Disable animations/reduced-motion variance where possible.
- Wait on a target-specific ready locator rather than fixed sleeps.
- Support Shopify embedded-app frames via frame locators when required.
- Mask or avoid customer PII and secrets.
- Write directly to `../manuals/<screenshot-id>.<locale>.png`.
- Refuse to overwrite an existing screenshot unless `--overwrite` is supplied.
- Emit a capture report under `../artifacts/`.

## Read-only browser policy

Allowed examples: navigate, select a tab, expand a detail view, paginate, filter, scroll, choose a display-only item.

Disallowed examples: send a message, change billing, assign a support thread, retry a queue job, pause/resume a queue, modify merchant/store settings, delete data, approve/reject provider configuration.

## Merchant video capture contract (VIDEO-001)

The video runner reuses the Shopify browser state but is separate from screenshot capture.

Canonical inputs:

1. `../videos/merchant-demo/storyboard.en.json` — English editorial order and draft narration.
2. `config/merchant-video-scenes.ts` — deterministic, read-only visual choreography.
3. `.env` — local Shopify Admin/app URLs and app navigation label.

Commands:

- `video:merchant:auth` — reuse the existing interactive Shopify auth bootstrap.
- `video:merchant:plan` — print scene order, capture/deferred state, output paths, and required local configuration.
- `video:merchant:capture` — record all safe English scenes or one `--scene` at 1920×1080 and trim loading lead-in/lead-out with FFmpeg.
- `video:merchant:onboarding:plan` — describe the one-shot fresh-store onboarding/Free-plan recording.
- `video:merchant:onboarding:capture` — record onboarding only when `--confirm-mutation` is supplied.

VIDEO-001 safety invariants:

- Use a synthetic development store only.
- Do not expose a generic click or form-submit primitive in the scene manifest.
- Navigating to a merchant surface, scrolling, holding the view, and opening a native `<details>` disclosure are allowed. Video scrolling uses browser-native smooth motion with an intentional settle/hold so section changes are visible to the viewer rather than teleporting. `openDisclosure` is deliberately constrained to `<details>` and is not a generic click primitive.
- Capture requires the synthetic shop to resolve to the `ACTIVE` merchant experience (shop ACTIVE, onboarding complete, subscription ACTIVE or TRIALING); the runner verifies the ACTIVE-only navigation before recording.
- Never purchase a plan/top-up, select a promotion, save settings/features/store profile, upload/delete knowledge, or send a support message during capture.
- Blur configured customer/message selectors before recording sensitive list content, including rendered Merchant Knowledge source names and source URLs/file names.
- A route with an implicit write is deferred rather than recorded. Merchant Support is currently deferred because loading it can mark unread administrative messages as read.
- Browser/video output remains under `artifacts/` and is therefore gitignored.
- `ffmpeg` is used only to trim raw Playwright scene boundaries in VIDEO-001; final composition remains a later task.

The normal merchant walkthrough remains strictly read-only. The onboarding recorder is a separate, explicitly mutating exception for a **fresh disposable development store**. It persists the Store Category/item types and selects the configured Shopify-hosted Free plan, requires `--confirm-mutation`, refuses stores already beyond fresh onboarding, and records Shopify's hosted plan-selection and approval surfaces before returning to Moda. Development stores may show `Test with this plan` and zero-valued test pricing; this must be described as test billing in narration. The recorder waits for a **healthy** Free-plan Recovery overview before declaring success: a visible overview that still says the subscription could not be safely mapped is treated as incomplete billing reconciliation, not success. The onboarding capture deliberately scrolls through the hero, benefits, how-it-works and pricing sections before returning to the plan CTA so the long-form onboarding page is visible in the recording.

Voice generation, subtitles, final FFmpeg composition, and YouTube publication belong to later video tasks and are intentionally absent from VIDEO-001.


For the one-shot onboarding video, `SHOPIFY_ONBOARDING_STORE_ITEM_TYPES` may contain exact visible item-type checkbox labels separated by `|`. The recorder shows these checkboxes and makes the configured selection before leaving onboarding.

## Local voice-over contract (VIDEO-002)

VIDEO-002 uses Kokoro locally; it does not send narration text to an external TTS API and has no API-key requirement.

Canonical inputs:

1. `../videos/merchant-onboarding/voiceover.en.json` — narration text and visual cue start times.
2. the edited onboarding WebM under `../artifacts/videos/en/onboarding/`;
3. local Kokoro model/voice files created by `npm run video:voiceover:setup`.

Commands:

- `video:voiceover:setup` — create the isolated Python environment and download Kokoro v1.0 model/voice files;
- `video:merchant:onboarding:narrate` — synthesize one WAV per cue, validate cue timing, mix the final narration WAV, and generate SRT captions;
- `video:merchant:onboarding:render` — mux the edited video, narration and English subtitle track into an H.264/AAC MP4 while retaining the sidecar SRT for YouTube.

Narration generation is deterministic with respect to checked-in text/start times plus `VOICEOVER_VOICE`, `VOICEOVER_LANGUAGE` and `VOICEOVER_SPEED`. It refuses overlapping narration cues and refuses narration that extends beyond the source video. Model files, generated WAVs, captions, reports and MP4 output remain under gitignored `artifacts/`.

## Main walkthrough narration/render contract (VIDEO-003)

VIDEO-003 composes the enabled VIDEO-001 merchant scenes into the Shopify listing walkthrough. It uses the same local Kokoro installation as VIDEO-002 and intentionally excludes the deferred Support scene.

Inputs:

1. canonical scene clips under `../artifacts/videos/<locale>/scenes/`;
2. `../videos/merchant-demo/voiceover.en.json` for scene-local narration cues and reviewed internal visual edits;
3. the local Kokoro model/voice environment created by `npm run video:voiceover:setup`;
4. FFmpeg/ffprobe.

Commands:

- `video:merchant:narrate` — synthesize Kokoro narration per scene, validate cue overlap, calculate any required end-frame hold, generate the global SRT, and write a source-integrity report;
- `video:merchant:render` — apply reviewed internal loading cuts, render each narrated scene at 1920×1080/H.264/AAC, concatenate scenes in registry order, and mux the English subtitle track into the final MP4.

The renderer never discovers scenes with a wildcard. It follows the enabled scene registry exactly and therefore ignores stale duplicate clips. Scene source size/mtime are recorded during narration and checked again before rendering; recaptured footage requires narration regeneration.

The Recovery Settings narration is written for the production Shopify listing: it describes Moda AI discount selection as a normal available mode and must not introduce "future capability" language.
