import type { Page } from 'playwright';

export async function openAdminTarget(page: Page, route = '/'): Promise<void> {
  const baseUrl = process.env.MODA_ADMIN_BASE_URL;
  if (!baseUrl) throw new Error('MODA_ADMIN_BASE_URL is required.');
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
}
