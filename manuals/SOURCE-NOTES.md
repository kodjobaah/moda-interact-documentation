# Source review notes

The manuals were drafted from the uploaded Moda Interact workspace and architect-agent definition.

Current implementation facts reflected in the manuals include:

- Admin console: Google-authenticated protected platform admin; tenant directory; tenant status/recovery-delay mutation; recovery/customer drill-down; merchant-support ownership/replies/translations; SUPER_ADMIN billing mutations; Grafana navigation; read-only queue monitor.
- Merchant app: 20 locale catalogues; Shopify-embedded Home/Messages navigation; onboarding welcome; Shopify pricing redirect; current/past usage overview; pending recoveries; performance/recovery detail; detailed usage events; merchant support thread with translation/original toggle; billing state.
- Known implementation gap intentionally documented: `ShopSettings.onboardingCompleted` is read/displayed but the reviewed merchant-facing code does not contain the final self-service completion mutation.

This file is informational; the manuals themselves should remain the primary reusable artifacts.
