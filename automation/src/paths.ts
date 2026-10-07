import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const REPOSITORY_ROOT = path.resolve(currentDir, '../..');
export const MANUALS_DIR = path.join(REPOSITORY_ROOT, 'manuals');
export const MANIFEST_PATH = path.join(MANUALS_DIR, 'screenshot-manifest.csv');
export const ARTIFACTS_DIR = path.join(REPOSITORY_ROOT, 'artifacts');

export function resolveRepositoryPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(REPOSITORY_ROOT, value);
}
