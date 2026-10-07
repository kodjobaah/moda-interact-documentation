import fs from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { MANIFEST_PATH } from './paths.js';

export type ManualKind = 'admin' | 'merchant';

export type ScreenshotManifestEntry = {
  manual: ManualKind;
  screenshotId: string;
  purpose: string;
  filenamePattern: string;
  requirement: 'required' | 'optional';
};

type RawRow = {
  manual: string;
  screenshot_id: string;
  purpose: string;
  filename_pattern: string;
  requirement?: string;
};

export async function loadScreenshotManifest(): Promise<ScreenshotManifestEntry[]> {
  const content = await fs.readFile(MANIFEST_PATH, 'utf8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawRow[];

  const seen = new Set<string>();

  return rows.map((row, index) => {
    if (row.manual !== 'admin' && row.manual !== 'merchant') {
      throw new Error(`Manifest row ${index + 2}: invalid manual '${row.manual}'.`);
    }
    if (!row.screenshot_id) {
      throw new Error(`Manifest row ${index + 2}: screenshot_id is required.`);
    }
    if (seen.has(row.screenshot_id)) {
      throw new Error(`Manifest row ${index + 2}: duplicate screenshot_id '${row.screenshot_id}'.`);
    }
    seen.add(row.screenshot_id);

    if (!row.filename_pattern.includes('<locale>')) {
      throw new Error(
        `Manifest row ${index + 2}: filename_pattern must contain '<locale>'.`,
      );
    }

    const requirement = row.requirement?.trim() || 'required';
    if (requirement !== 'required' && requirement !== 'optional') {
      throw new Error(
        `Manifest row ${index + 2}: invalid requirement '${requirement}'. Expected 'required' or 'optional'.`,
      );
    }

    return {
      manual: row.manual,
      screenshotId: row.screenshot_id,
      purpose: row.purpose,
      filenamePattern: row.filename_pattern,
      requirement,
    };
  });
}
