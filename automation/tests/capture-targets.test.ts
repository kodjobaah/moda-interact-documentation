import { describe, expect, it } from 'vitest';
import { CAPTURE_TARGETS } from '../config/capture-targets.js';
import { loadScreenshotManifest } from '../src/manifest.js';

describe('admin capture targets', () => {
  it('covers every Admin screenshot declared by the manifest', async () => {
    const manifest = await loadScreenshotManifest();
    const adminRows = manifest.filter((row) => row.manual === 'admin');
    const missing = adminRows.filter((row) => !CAPTURE_TARGETS[row.screenshotId]);
    expect(missing.map((row) => row.screenshotId)).toEqual([]);
  });

  it('captures Admin UI only in English until the Admin application is localised', async () => {
    const manifest = await loadScreenshotManifest();
    for (const row of manifest.filter((entry) => entry.manual === 'admin')) {
      expect(CAPTURE_TARGETS[row.screenshotId]?.supportedLocales).toEqual(['en']);
    }
  });

  it('uses an unauthenticated browser context only for the login screenshot', () => {
    expect(CAPTURE_TARGETS['admin-login']?.authProfile).toBe('none');
    for (const [id, target] of Object.entries(CAPTURE_TARGETS)) {
      if (target.manual === 'admin' && id !== 'admin-login') {
        expect(target.authProfile).toBe('moda-admin');
      }
    }
  });
});
