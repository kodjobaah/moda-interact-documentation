Expected implementation modules:

- `cli.ts` — command parsing and expensive-operation gates
- `manifest.ts` — CSV loading and manifest/capture-target reconciliation
- `paths.ts` — repository-relative output paths
- `locales.ts` — locale selection and support checks
- `auth/shopify.ts` — Shopify login/storage-state bootstrap
- `auth/moda-admin.ts` — Google OAuth/storage-state bootstrap
- `capture/runner.ts` — deterministic capture lifecycle
- `capture/privacy.ts` — PII masking and safety checks
- `targets/admin.ts` — admin navigation/actions
- `targets/merchant.ts` — Shopify developer-store/app navigation/actions
