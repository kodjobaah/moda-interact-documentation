import type { Page } from 'playwright';

/**
 * Preferred capture path is a direct installed-app URL when one is known. This
 * avoids repeatedly traversing the Shopify developer dashboard for every image.
 *
 * When SHOPIFY_MERCHANT_APP_URL is not supplied, the helper starts at the
 * developer stores dashboard and performs a conservative best-effort navigation
 * using SHOPIFY_DEV_STORE_NAME / SHOPIFY_APP_NAME. If Shopify changes its UI,
 * update this helper rather than hard-coding dashboard mechanics into each target.
 */
export async function openMerchantTarget(page: Page, route = '/'): Promise<void> {
  const directAppUrl = process.env.SHOPIFY_MERCHANT_APP_URL;
  if (directAppUrl) {
    await page.goto(new URL(route, directAppUrl).toString(), {
      waitUntil: 'domcontentloaded',
    });
    return;
  }

  const dashboardUrl = process.env.SHOPIFY_DEV_DASHBOARD_URL;
  if (!dashboardUrl) throw new Error('SHOPIFY_DEV_DASHBOARD_URL is required.');

  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });

  const storeName = process.env.SHOPIFY_DEV_STORE_NAME;
  if (storeName) {
    const store = page.getByText(storeName, { exact: true }).first();
    if (await store.isVisible().catch(() => false)) {
      await store.click();
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }

  const appName = process.env.SHOPIFY_APP_NAME;
  if (appName) {
    const app = page.getByText(appName, { exact: true }).first();
    if (await app.isVisible().catch(() => false)) {
      await app.click();
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }

  if (page.url().includes('/dashboard/') && !process.env.SHOPIFY_MERCHANT_APP_URL) {
    throw new Error(
      'Could not deterministically open the embedded merchant app from the Shopify dashboard. ' +
        'Set SHOPIFY_MERCHANT_APP_URL to the installed development-app URL, or update ' +
        'automation/src/targets/merchant.ts after inspecting the current Shopify UI.',
    );
  }
}
