import type { Page } from 'playwright';
import { maybeClick, maybeFillCredential, saveInteractiveAuthState } from './common.js';

const ADMIN_LOGIN_ENTRY_TIMEOUT_MS = 15_000;

function isModaAdminLoginUrl(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') === '/login';
  } catch {
    return false;
  }
}

async function enterGoogleOAuth(page: Page): Promise<void> {
  if (!isModaAdminLoginUrl(page.url())) return;

  const googleEntry = page
    .getByRole('button', { name: /continue with google|sign in with google/i })
    .or(page.getByRole('link', { name: /continue with google|sign in with google/i }))
    .first();

  try {
    await googleEntry.waitFor({
      state: 'visible',
      timeout: ADMIN_LOGIN_ENTRY_TIMEOUT_MS,
    });
  } catch {
    throw new Error(
      `Moda Admin remained on ${page.url()}, but the Google sign-in control did not become visible ` +
        `within ${ADMIN_LOGIN_ENTRY_TIMEOUT_MS / 1000} seconds. Do not save this browser state; ` +
        'check that the hosted Admin login page rendered successfully and retry.',
    );
  }

  await googleEntry.click();
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

async function verifyAdminAuthenticated(page: Page, startUrl: string): Promise<void> {
  const expectedOrigin = new URL(startUrl).origin;
  const currentUrl = page.url();

  let current: URL;
  try {
    current = new URL(currentUrl);
  } catch {
    throw new Error(`Cannot verify the Moda Admin authentication result from URL '${currentUrl}'.`);
  }

  if (current.origin !== expectedOrigin || isModaAdminLoginUrl(currentUrl)) {
    throw new Error(
      `Moda Admin authentication is not complete. The browser is still at ${currentUrl}. ` +
        'Finish Google sign-in until the protected Admin application is visible, then press ENTER again on a new auth run.',
    );
  }
}

async function assistGoogleAdminLogin(page: Page): Promise<void> {
  // The Next.js login UI may hydrate after DOMContentLoaded, so wait for the
  // actual rendered Google entry control rather than performing a one-shot
  // visibility check immediately after navigation.
  await enterGoogleOAuth(page);

  const username = process.env.MODA_ADMIN_GOOGLE_USERNAME;
  const password = process.env.MODA_ADMIN_GOOGLE_PASSWORD;

  const filledUsername = await maybeFillCredential(
    page,
    ['input[type="email"]', 'input[name="identifier"]', 'input[autocomplete="username"]'],
    username,
  );
  if (filledUsername) {
    await maybeClick(page, [
      '#identifierNext button',
      'button:has-text("Next")',
      'button[type="submit"]',
    ]);
    await page.waitForTimeout(750);
  }

  const filledPassword = await maybeFillCredential(
    page,
    ['input[type="password"]', 'input[name="Passwd"]', 'input[autocomplete="current-password"]'],
    password,
  );
  if (filledPassword) {
    await maybeClick(page, [
      '#passwordNext button',
      'button:has-text("Next")',
      'button[type="submit"]',
    ]);
  }
}

export async function authenticateAdmin(): Promise<void> {
  const startUrl = process.env.MODA_ADMIN_BASE_URL;
  if (!startUrl) throw new Error('MODA_ADMIN_BASE_URL is required.');

  await saveInteractiveAuthState({
    name: 'Moda Admin',
    startUrl,
    storageStatePath:
      process.env.MODA_ADMIN_STORAGE_STATE_PATH ?? 'playwright/.auth/moda-admin.json',
    assist: assistGoogleAdminLogin,
    verify: (page) => verifyAdminAuthenticated(page, startUrl),
  });
}
