# Proposed directory structure

```text
moda-interact-documentation/
├── .codex/
│   └── agents/
│       └── moda_documentation.toml
├── .env.example
├── .gitattributes
├── .gitignore
├── README.md
├── manuals/
│   ├── admin-training-guide.tex
│   ├── merchant-user-manual.tex
│   ├── moda-manual.sty
│   ├── screenshot-manifest.csv
│   ├── TRANSLATION-GUIDE.md
│   ├── SOURCE-NOTES.md
│   ├── content/
│   │   ├── en/
│   │   │   ├── admin-content.tex
│   │   │   ├── admin-metadata.tex
│   │   │   ├── merchant-content.tex
│   │   │   └── merchant-metadata.tex
│   │   └── <locale>/...
│   └── <screenshot-id>.<locale>.png
├── automation/
│   ├── README.md
│   ├── config/
│   │   ├── locales.ts
│   │   └── capture-targets.ts
│   ├── src/
│   │   ├── cli.ts
│   │   ├── manifest.ts
│   │   ├── paths.ts
│   │   ├── locales.ts
│   │   ├── auth/
│   │   │   ├── shopify.ts
│   │   │   └── moda-admin.ts
│   │   ├── capture/
│   │   │   ├── runner.ts
│   │   │   └── privacy.ts
│   │   └── targets/
│   │       ├── merchant.ts
│   │       └── admin.ts
│   └── tests/
│       ├── manifest.test.ts
│       ├── capture-targets.test.ts
│       └── paths.test.ts
├── playwright/
│   └── .auth/                 # local only; gitignored
├── artifacts/                 # local reports/traces; gitignored
├── scripts/
│   └── build-manuals.sh
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

The Playwright implementation files shown in the tree are target locations for the documentation agent; they are intentionally not pre-implemented in this starter because the agent is being defined to create them from the inspected UI/application state.
