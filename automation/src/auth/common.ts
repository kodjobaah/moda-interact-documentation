import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolveRepositoryPath } from '../paths.js';

export async function firstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return undefined;
}

export async function maybeFillCredential(
  page: Page,
  selectors: string[],
  value?: string,
): Promise<boolean> {
  if (!value) return false;
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.fill(value);
  return true;
}

export async function maybeClick(page: Page, selectors: string[]): Promise<boolean> {
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.click();
  return true;
}

export async function saveInteractiveAuthState(options: {
  name: string;
  startUrl: string;
  storageStatePath: string;
  assist?: (page: Page) => Promise<void>;
  verify?: (page: Page) => Promise<void>;
}): Promise<void> {
  const statePath = resolveRepositoryPath(options.storageStatePath);
  await fs.mkdir(path.dirname(statePath), { recursive: true });

// common.ts inside saveInteractiveAuthState
const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=WebAuthentication,WebAuthenticationCustomUI',
  ]
});

// Update this initialization block:
const context: BrowserContext = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: 'reduce',
  // 🕵️ Spoofs a standard personal Mac user profile to get past Cloudflare / Shopify fingerprint telemetry
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
});

  await context.grantPermissions([]); 
  const page = await context.newPage();

  try {
    await page.goto(options.startUrl, { waitUntil: 'domcontentloaded' });
    await options.assist?.(page);

    output.write(`\n${options.name} authentication browser is open.\n`);
    output.write('Complete any legitimate MFA, CAPTCHA, passkey or consent challenge in the browser.\n');
    output.write('Do not copy cookies or tokens into the terminal.\n\n');

    const terminal = readline.createInterface({ input, output });
    await terminal.question('When the authenticated application/dashboard is visible, press ENTER to save the local browser state... ');
    terminal.close();

    await options.verify?.(page);
    await context.storageState({ path: statePath });
    output.write(`Saved authenticated state to ${path.relative(process.cwd(), statePath)}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}
