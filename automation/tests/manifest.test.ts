import { describe, expect, it } from 'vitest';
import { loadScreenshotManifest } from '../src/manifest.js';

describe('screenshot manifest', () => {
  it('loads unique language-neutral screenshot ids', async () => {
    const rows = await loadScreenshotManifest();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.screenshotId)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.filenamePattern).toContain('<locale>');
      expect(row.screenshotId).not.toContain('.en.');
      expect(['required', 'optional']).toContain(row.requirement);
    }
  });

  it('marks queue job diagnostics optional because queues may legitimately be empty', async () => {
    const rows = await loadScreenshotManifest();
    expect(rows.find((row) => row.screenshotId === 'admin-queue-job-details')?.requirement).toBe(
      'optional',
    );
  });
});
