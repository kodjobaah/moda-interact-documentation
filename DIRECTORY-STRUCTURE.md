# Documentation repository structure

```text
moda-interact-documentation/
├── .env.example
├── README.md
├── manuals/
│   ├── admin-user-guide.tex
│   ├── admin-training-guide.tex          # retained legacy/training source
│   ├── merchant-user-manual.tex
│   ├── moda-manual.sty
│   ├── screenshot-manifest.csv
│   ├── TRANSLATION-GUIDE.md
│   ├── SOURCE-NOTES.md
│   ├── content/
│   │   ├── en/
│   │   │   ├── admin-user-guide-content.tex
│   │   │   ├── admin-user-guide-metadata.tex
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
│   │   ├── capture-targets.ts
│   │   └── merchant-video-scenes.ts
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
│   │   ├── video/
│   │   │   └── merchant-demo.ts
│   │   └── targets/
│   │       ├── merchant.ts
│   │       └── admin.ts
│   └── tests/
│       ├── manifest.test.ts
│       ├── capture-targets.test.ts
│       ├── plan.test.ts
│       ├── paths.test.ts
│       └── merchant-video-scenes.test.ts
├── videos/
│   └── merchant-demo/
│       └── storyboard.en.json
├── playwright/
│   └── .auth/                             # local only; gitignored
├── artifacts/                             # generated manuals/reports/video; gitignored
├── scripts/
│   ├── capture-admin-user-guide.sh
│   └── build-user-guide.sh
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

`manuals/screenshot-manifest.csv` remains the canonical screenshot inventory. The
English Administrator User Guide capture command uses the Admin rows from that manifest and
`automation/config/capture-targets.ts`; the build command consumes localized LaTeX content and
localized screenshots without changing the application repositories.

VIDEO-001 keeps the English merchant-video storyboard under `videos/merchant-demo/` while generated scene clips remain under `artifacts/videos/<locale>/scenes/`. Video capture reuses Shopify authentication but does not change the manual screenshot manifest.
