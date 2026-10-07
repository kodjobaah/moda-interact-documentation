import { defineConfig } from 'playwright/test';
import * as path from 'node:path';

/**
 * The screenshot CLI uses the Playwright library directly. This file keeps the
 * repository ready for focused Playwright tests and documents the deterministic
 * browser defaults used by the capture tooling.
 */
export default defineConfig({
  timeout: 60_000,
  use: {
    // 🎯 THE BULLETPROOF ANCHOR: Uses the configuration file's own root position
    // to map an un-breakable absolute path directly to your shopify.json file.
    storageState: path.resolve(import.meta.dirname, 'playwright/.auth/shopify.json'),
    
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
});
