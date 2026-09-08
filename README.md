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
