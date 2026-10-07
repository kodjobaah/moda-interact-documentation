import { describe, expect, it } from 'vitest';
import { loadScreenshotManifest } from '../src/manifest.js';
import { buildCapturePlan } from '../src/plan.js';

describe('capture plan', () => {
  it('has complete English coverage for the Administrator User Guide', async () => {
    const manifest = await loadScreenshotManifest();
    const rows = await buildCapturePlan(manifest, 'en', { manual: 'admin' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.configured)).toBe(true);
    expect(rows.every((row) => row.localeSupported)).toBe(true);
  });

  it('still reports merchant targets independently while that manual is being wired', async () => {
    const manifest = await loadScreenshotManifest();
    const rows = await buildCapturePlan(manifest, 'en', { manual: 'merchant' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => !row.configured)).toBe(true);
  });
});
