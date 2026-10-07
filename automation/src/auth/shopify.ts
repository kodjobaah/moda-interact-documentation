import type { Page } from 'playwright';
import { maybeClick, maybeFillCredential, saveInteractiveAuthState } from './common.js';


async function assistShopifyLogin(page: Page): Promise<void> {
 // 🛡️ Remove the credential mocks that are breaking Shopify's internal JS state
  // We want the browser to act 100% natural.

console.log('Opening Shopify Login...');
  
  // 🎯 UPDATED SELECTOR: Automatically matches when you successfully reach
  // EITHER your store admin panel OR your partner developer dashboard layout
  await page.waitForURL(/(admin\.shopify\.com|dev\.shopify\.com)/, { timeout: 300000 }); 
  
  console.log('🎉 Dashboard detected! Handing control back to terminal.');
}


export async function authenticateShopify(): Promise<void> {
  const startUrl = process.env.SHOPIFY_DEV_DASHBOARD_URL;
  if (!startUrl) throw new Error('SHOPIFY_DEV_DASHBOARD_URL is required.');

  await saveInteractiveAuthState({
    name: 'Shopify',
    startUrl,
    storageStatePath:
      process.env.SHOPIFY_STORAGE_STATE_PATH ?? 'playwright/.auth/shopify.json',
    assist: assistShopifyLogin,
  });
}
