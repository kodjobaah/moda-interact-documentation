import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANUALS_DIR, REPOSITORY_ROOT, resolveRepositoryPath } from '../src/paths.js';

describe('repository paths', () => {
  it('resolves paths from the documentation repository root', () => {
    expect(MANUALS_DIR).toBe(path.join(REPOSITORY_ROOT, 'manuals'));
    expect(resolveRepositoryPath('playwright/.auth/shopify.json')).toBe(
      path.join(REPOSITORY_ROOT, 'playwright/.auth/shopify.json'),
    );
  });
});
