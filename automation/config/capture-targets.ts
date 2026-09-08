/**
 * Implemented by moda_documentation.
 *
 * Keep this file keyed by screenshot_id from manuals/screenshot-manifest.csv.
 * Do not duplicate documentation prose here; this file describes browser mechanics.
 */
export type CaptureMode = 'page' | 'locator';
export type AuthProfile = 'shopify' | 'moda-admin';

export type CaptureTarget = {
  screenshotId: string;
  manual: 'admin' | 'merchant';
  authProfile: AuthProfile;
  captureMode: CaptureMode;
  route?: string;
  readyLocator: string;
  captureLocator?: string;
  frameLocator?: string;
  masks?: string[];
  notes?: string;
};

export const CAPTURE_TARGETS: Record<string, CaptureTarget> = {
  // Example only. The agent must inspect the live/test UI and current code before
  // finalising robust selectors and navigation steps.
  'admin-tenant-directory': {
    screenshotId: 'admin-tenant-directory',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'main',
    notes: 'Replace generic ready locator with a stable semantic locator after inspection.',
  },
};
