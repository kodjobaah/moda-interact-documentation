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
