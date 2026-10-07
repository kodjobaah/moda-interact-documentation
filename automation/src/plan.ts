import fs from 'node:fs/promises';
import path from 'node:path';
import { CAPTURE_TARGETS } from '../config/capture-targets.js';
import type { DocumentationLocale } from './locales.js';
import type { ManualKind, ScreenshotManifestEntry } from './manifest.js';
import { MANUALS_DIR } from './paths.js';

export type PlanRow = ScreenshotManifestEntry & {
  configured: boolean;
  localeSupported: boolean;
  outputPath: string;
  outputExists: boolean;
};

export async function buildCapturePlan(
  manifest: ScreenshotManifestEntry[],
  locale: DocumentationLocale,
  filters: { manual?: ManualKind; screenshotId?: string } = {},
): Promise<PlanRow[]> {
  const rows = manifest.filter((entry) => {
    if (filters.manual && entry.manual !== filters.manual) return false;
    if (filters.screenshotId && entry.screenshotId !== filters.screenshotId) return false;
    return true;
  });

  return Promise.all(
    rows.map(async (entry) => {
      const target = CAPTURE_TARGETS[entry.screenshotId];
      const outputPath = path.join(
        MANUALS_DIR,
        entry.filenamePattern.replace('<locale>', locale),
      );
      const outputExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);

      return {
        ...entry,
        configured: Boolean(target),
        localeSupported: Boolean(
          target && (!target.supportedLocales || target.supportedLocales.includes(locale)),
        ),
        outputPath,
        outputExists,
      };
    }),
  );
}

export function assertCompleteCoverage(rows: PlanRow[]): void {
  const missing = rows.filter((row) => !row.configured);
  if (missing.length > 0) {
    throw new Error(
      `Capture configuration is incomplete. Missing target(s): ${missing
        .map((row) => row.screenshotId)
        .join(', ')}. Run npm run capture:plan for details.`,
    );
  }
}
