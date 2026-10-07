# Source review notes

The manuals were drafted from the uploaded Moda Interact workspace and architect-agent definition.

Current implementation facts reflected in the Administrator User Guide include:

- Google-authenticated protected platform administration.
- Tenant Directory with Overview, Recovery Settings, Recovery Logs and tenant Billing tabs.
- Merchant Messages with thread ownership, replies and translation controls.
- Platform Billing views for Overview, Plans/Pricing, Features, Recovery Packs, Refund Requests, App Events and Unmapped subscriptions.
- SUPER_ADMIN-only Promotions catalogue and campaign drawer.
- System Controls for Platform Policy and Background Runtime.
- Observability navigation plus the read-only Shopify Queue monitor, queue details and job diagnostics.
- The reviewed Admin application currently ships an English UI catalogue, even though the documentation repository is designed for multilingual prose and localized screenshots.

The screenshot capture contract is intentionally read-only. It may navigate, open tabs/drawers and inspect existing data, but it must not submit support, billing, promotion, runtime, tenant or queue mutations.

This file is informational; the manuals themselves remain the primary reusable artifacts.
