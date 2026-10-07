import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import {
  chromium,
  type Frame,
  type Locator,
  type Page,
} from 'playwright';
import {
  MERCHANT_VIDEO_SCENES,
  findMerchantVideoScene,
  type MerchantVideoDemoAction,
  type MerchantVideoScene,
  type MerchantVideoStep,
} from '../../config/merchant-video-scenes.js';
import type { DocumentationLocale } from '../locales.js';
import { ARTIFACTS_DIR, resolveRepositoryPath } from '../paths.js';

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
const READY_TIMEOUT_MS = 30_000;
const APP_FRAME_TIMEOUT_MS = 45_000;
const APP_LAUNCH_FALLBACK_TIMEOUT_MS = 12_000;
const MERCHANT_NAV_MARKER = 's-app-nav [href="/app"]';
const CURSOR_MOVE_MS = 500;
const CLICK_SETTLE_MS = 850;
const VIDEO_TRIM_PREROLL_MS = 350;
const VIDEO_TRIM_POSTROLL_MS = 250;
const execFileAsync = promisify(execFile);

export const MERCHANT_VIDEO_FIXTURE_REQUIREMENT =
  'ACTIVE merchant experience: shop ACTIVE, onboarding complete, subscription ACTIVE or TRIALING';

export const ACTIVE_MERCHANT_DEMO_NAVIGATION = [
  '/app/recoveries',
  '/app/billing/options',
  '/app/promotions',
  '/app/recovery-settings',
] as const;

export function missingActiveMerchantDemoNavigation(
  hrefs: readonly string[],
): string[] {
  const available = new Set(hrefs);
  return ACTIVE_MERCHANT_DEMO_NAVIGATION.filter(
    (href) => !available.has(href),
  );
}

export type MerchantVideoCaptureStatus =
  | 'captured'
  | 'skipped-existing'
  | 'skipped-deferred'
  | 'failed';

export type MerchantVideoCaptureResult = {
  sceneId: string;
  title: string;
  status: MerchantVideoCaptureStatus;
  outputPath?: string;
  reason?: string;
};

export type MerchantVideoCaptureRequest = {
  locale: DocumentationLocale;
  sceneId?: string;
  overwrite: boolean;
  headed: boolean;
};

export type MerchantContent = Page | Frame;

function browserLocale(locale: DocumentationLocale): string {
  return locale;
}

function sceneFilename(scene: MerchantVideoScene): string {
  return `${String(scene.order).padStart(2, '0')}-${scene.id}.webm`;
}

function videoRoot(locale: DocumentationLocale): string {
  return path.join(ARTIFACTS_DIR, 'videos', locale);
}

function sceneOutputPath(
  locale: DocumentationLocale,
  scene: MerchantVideoScene,
): string {
  return path.join(videoRoot(locale), 'scenes', sceneFilename(scene));
}

function sceneUsesDemoAction(
  scene: MerchantVideoScene,
  action: MerchantVideoDemoAction,
): boolean {
  return scene.steps.some(
    (step) => step.type === 'demoAction' && step.action === action,
  );
}

function requiredEnvironment(scene: MerchantVideoScene): string[] {
  const required: string[] = [];
  if (scene.entry === 'shopify-admin') {
    required.push(
      'SHOPIFY_STORE_ADMIN_URL',
      'SHOPIFY_MERCHANT_APP_URL',
      'SHOPIFY_APP_NAV_LABEL',
    );
  } else {
    required.push('SHOPIFY_MERCHANT_APP_URL');
  }
  if (
    sceneUsesDemoAction(scene, 'open-demo-recovery') ||
    sceneUsesDemoAction(scene, 'open-demo-usage-recovery')
  ) {
    required.push('SHOPIFY_DEMO_RECOVERY_CUSTOMER');
  }
  if (sceneUsesDemoAction(scene, 'return-from-shopify-plan-selector')) {
    required.push('SHOPIFY_APP_NAV_LABEL');
  }
  return [...new Set(required)];
}

export function buildMerchantVideoPlan(
  locale: DocumentationLocale,
  sceneId?: string,
): Array<{
  scene: MerchantVideoScene;
  outputPath: string;
  requiredEnvironment: string[];
  fixtureRequirement: string;
}> {
  const requested = sceneId
    ? [findMerchantVideoScene(sceneId)].filter(
        (scene): scene is MerchantVideoScene => Boolean(scene),
      )
    : [...MERCHANT_VIDEO_SCENES];

  if (sceneId && requested.length === 0) {
    throw new Error(`Unknown merchant video scene '${sceneId}'.`);
  }

  return requested.map((scene) => ({
    scene,
    outputPath: sceneOutputPath(locale, scene),
    requiredEnvironment: requiredEnvironment(scene),
    fixtureRequirement: MERCHANT_VIDEO_FIXTURE_REQUIREMENT,
  }));
}

export async function assertStorageState(): Promise<string> {
  const configured =
    process.env.SHOPIFY_STORAGE_STATE_PATH ?? 'playwright/.auth/shopify.json';
  const storagePath = resolveRepositoryPath(configured);
  await fs.access(storagePath).catch(() => {
    throw new Error(
      `Missing Shopify browser state: ${storagePath}. Run 'npm run video:merchant:auth' first.`,
    );
  });
  return storagePath;
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required for merchant demo video capture. See .env.example.`,
    );
  }
  return value;
}

export async function installDemoCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('moda-demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'moda-demo-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    Object.assign(cursor.style, {
      position: 'fixed',
      zIndex: '2147483647',
      left: '34px',
      top: '34px',
      width: '22px',
      height: '22px',
      borderRadius: '50%',
      border: '3px solid rgba(16, 90, 62, .95)',
      background: 'rgba(255, 255, 255, .92)',
      boxShadow: '0 2px 10px rgba(0, 0, 0, .28)',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%) scale(1)',
      transition: 'left 420ms ease, top 420ms ease, transform 140ms ease',
    });
    document.documentElement.append(cursor);
  });
}

async function moveDemoCursor(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) return;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(box.height / 2, 24));
  await page.evaluate(
    ({ x: nextX, y: nextY }) => {
      const cursor = document.getElementById('moda-demo-cursor');
      if (!(cursor instanceof HTMLElement)) return;
      cursor.style.left = `${nextX}px`;
      cursor.style.top = `${nextY}px`;
    },
    { x, y },
  );
  await page.waitForTimeout(CURSOR_MOVE_MS);
}

async function pulseDemoCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cursor = document.getElementById('moda-demo-cursor');
    if (!(cursor instanceof HTMLElement)) return;
    cursor.style.transform = 'translate(-50%, -50%) scale(.68)';
    window.setTimeout(() => {
      cursor.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 170);
  });
}

type DemoScrollOptions = {
  settleMs?: number;
  block?: ScrollLogicalPosition;
  onlyIfNeeded?: boolean;
};

async function locatorIsComfortablyVisible(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const margin = Math.min(96, Math.max(36, window.innerHeight * 0.08));
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= margin &&
        rect.bottom <= window.innerHeight - margin
      );
    })
    .catch(() => false);
}

/**
 * Scroll a demo target into view with browser-native smooth motion so the
 * movement is visible in the captured video. This works for both the top
 * Shopify page and merchant content hosted inside a frame because the scroll
 * is executed in the target element's own document.
 */
export async function demoScrollTo(
  page: Page,
  locator: Locator,
  options: DemoScrollOptions = {},
): Promise<void> {
  const {
    settleMs = 1050,
    block = 'center',
    onlyIfNeeded = false,
  } = options;

  if (onlyIfNeeded && (await locatorIsComfortablyVisible(locator))) return;

  await locator.evaluate(
    (element, requestedBlock) => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: requestedBlock,
        inline: 'nearest',
      });
    },
    block,
  );
  await page.waitForTimeout(settleMs);
}

export async function demoClick(page: Page, locator: Locator): Promise<void> {
  await demoScrollTo(page, locator, {
    settleMs: 700,
    onlyIfNeeded: true,
  });
  await moveDemoCursor(page, locator);
  await pulseDemoCursor(page);
  await locator.click();
  await page.waitForTimeout(CLICK_SETTLE_MS);
}

export function merchantAdminUrlForRoute(
  configuredAppUrl: string,
  route: string,
): string {
  const url = new URL(configuredAppUrl);
  const appPrefix = url.pathname.match(/^(.*\/apps\/[^/]+)/)?.[1];
  if (!appPrefix) {
    throw new Error(
      `SHOPIFY_MERCHANT_APP_URL must be a Shopify Admin installed-app URL containing '/apps/<handle>'. Received: ${configuredAppUrl}`,
    );
  }

  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  url.pathname = `${appPrefix}${normalizedRoute}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function locateMerchantContent(
  page: Page,
  timeoutMs = APP_FRAME_TIMEOUT_MS,
): Promise<MerchantContent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidates: MerchantContent[] = [page, ...page.frames()];
    for (const candidate of candidates) {
      // s-app-nav is an App Bridge declaration element. Shopify may not give
      // the element itself a visible box, even though its s-link children are
      // attached and the merchant app is fully loaded. Detect the declared
      // navigation contract rather than requiring the custom element to be
      // visually visible.
      const attached = await candidate
        .locator(MERCHANT_NAV_MARKER)
        .count()
        .then((count) => count > 0)
        .catch(() => false);
      if (attached) return candidate;
    }
    await page.waitForTimeout(250);
  }

  const frameUrls = page
    .frames()
    .map((frame) => frame.url())
    .filter(Boolean)
    .join(', ');
  throw new Error(
    'Could not locate the Moda Interact merchant application navigation contract. ' +
      `Current page: ${page.url()}. ` +
      `Frames: ${frameUrls || '(none)'}. ` +
      'Confirm SHOPIFY_MERCHANT_APP_URL opens the installed app and the authenticated Shopify state is current.',
  );
}

async function assertActiveDemoFixture(
  content: MerchantContent,
): Promise<void> {
  const hrefs = await content
    .locator('s-app-nav [href]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    );
  const missing = missingActiveMerchantDemoNavigation(hrefs);
  if (missing.length === 0) return;

  const current = hrefs.length ? hrefs.join(', ') : '(no merchant navigation links)';
  throw new Error(
    `Merchant demo capture requires ${MERCHANT_VIDEO_FIXTURE_REQUIREMENT}. ` +
      `Missing ACTIVE-only navigation routes: ${missing.join(', ')}. ` +
      `Current navigation: ${current}. Use a synthetic ACTIVE development shop before recording.`,
  );
}


export function disqualifyingActiveDemoWarnings(
  messages: readonly string[],
): string[] {
  return messages.filter((message) =>
    /subscription is scheduled to end|pending change to/i.test(message),
  );
}

async function assertCleanActiveDemoFixture(
  content: MerchantContent,
): Promise<void> {
  const messages = await content
    .locator('s-banner[tone="warning"]')
    .allTextContents()
    .catch(() => [] as string[]);
  const warnings = disqualifyingActiveDemoWarnings(messages);
  if (warnings.length === 0) return;

  throw new Error(
    'Merchant demo capture requires a clean ACTIVE fixture without a scheduled cancellation or pending plan change. ' +
      `Current warning: ${warnings.join(' | ')}. Record onboarding on a fresh synthetic store first, or clear the pending lifecycle change before recording the ACTIVE walkthrough.`,
  );
}

export function calculateTrimWindow(
  recordingStartedAtMs: number,
  visualStartedAtMs: number,
  visualEndedAtMs: number,
): { startSeconds: number; durationSeconds: number } {
  const startMs = Math.max(0, visualStartedAtMs - recordingStartedAtMs - VIDEO_TRIM_PREROLL_MS);
  const endMs = Math.max(startMs + 250, visualEndedAtMs - recordingStartedAtMs + VIDEO_TRIM_POSTROLL_MS);
  return {
    startSeconds: startMs / 1000,
    durationSeconds: (endMs - startMs) / 1000,
  };
}

export async function trimRecordedWebm(
  rawPath: string,
  outputPath: string,
  window: { startSeconds: number; durationSeconds: number },
): Promise<void> {
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', window.startSeconds.toFixed(3),
      '-i', rawPath,
      '-t', window.durationSeconds.toFixed(3),
      '-an',
      '-c:v', 'libvpx-vp9',
      '-crf', '32',
      '-b:v', '0',
      '-deadline', 'good',
      '-cpu-used', '4',
      outputPath,
    ]);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        "ffmpeg is required to trim merchant demo recordings. Install it with 'brew install ffmpeg' and rerun the scene.",
      );
    }
    throw error;
  }
}

async function applyPrivacySelectors(
  content: MerchantContent,
  selectors: readonly string[] | undefined,
): Promise<void> {
  if (!selectors?.length) return;
  for (const selector of selectors) {
    await content
      .locator(selector)
      .evaluateAll((elements) => {
        for (const element of elements) {
          if (!(element instanceof HTMLElement)) continue;
          element.style.filter = 'blur(9px)';
          element.style.userSelect = 'none';
        }
      })
      .catch(() => undefined);
  }
}

async function navigateMerchantRoute(
  page: Page,
  route: string,
): Promise<MerchantContent> {
  const appUrl = requiredEnv('SHOPIFY_MERCHANT_APP_URL');
  const targetUrl = merchantAdminUrlForRoute(appUrl, route);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await installDemoCursor(page);
  return locateMerchantContent(page);
}

function demoRecoveryCustomer(): string {
  return requiredEnv('SHOPIFY_DEMO_RECOVERY_CUSTOMER');
}

function demoFollowUpMinutes(): string {
  const configured = process.env.SHOPIFY_DEMO_FOLLOW_UP_MINUTES?.trim() || '120';
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 60 || value > 10_080) {
    throw new Error(
      `SHOPIFY_DEMO_FOLLOW_UP_MINUTES must be an integer from 60 to 10080. Received: ${configured}`,
    );
  }
  return configured;
}

function demoKnowledgePurpose(): string {
  return process.env.SHOPIFY_DEMO_KNOWLEDGE_PURPOSE?.trim() || 'Pricing';
}

async function visibleTextLocator(page: Page, text: string): Promise<Locator> {
  const matches = page.getByText(text, { exact: true });
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = matches.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error(`Could not find a visible '${text}' control in Shopify.`);
}

async function assertSyntheticRecoveryList(content: MerchantContent): Promise<void> {
  const rows = content.locator('.recovery-list__row');
  const count = await rows.count();
  if (count === 0) {
    throw new Error(
      'Merchant demo recovery scenes require synthetic recovery fixtures, but the recovery list is empty.',
    );
  }
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const emailLocator = row.locator('.recovery-list__customer p[dir="auto"]').first();
    if ((await emailLocator.count()) > 0) {
      const email = (await emailLocator.textContent())?.trim() ?? '';
      if (email && !email.endsWith('@example.invalid')) {
        throw new Error(
          `Refusing to record Recoveries because row ${index + 1} is not an @example.invalid synthetic fixture.`,
        );
      }
      continue;
    }
    const name = (
      await row.locator('.recovery-list__customer h3').first().textContent()
    )?.trim();
    if (name && name !== 'Guest') {
      throw new Error(
        `Refusing to record Recoveries because '${name}' has no synthetic @example.invalid fixture email.`,
      );
    }
  }
}

async function assertSyntheticRecoveryDetail(
  content: MerchantContent,
  customerName: string,
): Promise<void> {
  await content
    .locator('main.recovery-detail')
    .waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const heading = content.locator('.recovery-detail__header h1').first();
  await heading.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const actualName = (await heading.textContent())?.trim() ?? '';
  if (actualName !== customerName) {
    throw new Error(
      `Expected synthetic recovery '${customerName}' but opened '${actualName || '(unnamed)'}'.`,
    );
  }
  const email = (
    await content
      .locator('.recovery-detail__header p[dir="auto"]')
      .first()
      .textContent()
      .catch(() => '')
  )?.trim();
  if (!email?.endsWith('@example.invalid')) {
    throw new Error(
      `Refusing to record recovery detail for '${customerName}' because its customer email is not a synthetic @example.invalid fixture.`,
    );
  }
}

async function openDemoRecovery(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const customerName = demoRecoveryCustomer();
  const row = content
    .locator('.recovery-list__row')
    .filter({ hasText: customerName })
    .first();
  await row.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const email = (
    await row
      .locator('.recovery-list__customer p[dir="auto"]')
      .first()
      .textContent()
      .catch(() => '')
  )?.trim();
  if (!email?.endsWith('@example.invalid')) {
    throw new Error(
      `Refusing to open '${customerName}' because the selected recovery is not a synthetic @example.invalid fixture.`,
    );
  }
  const link = row
    .locator('.recovery-list__customer h3 a')
    .filter({ hasText: customerName })
    .first();
  await demoClick(page, link);
  const next = await locateMerchantContent(page);
  await assertSyntheticRecoveryDetail(next, customerName);
  return next;
}

async function openUsageHistory(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const link = content.locator('s-button[href*="/app/usage"]').first();
  await link.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoClick(page, link);
  const next = await locateMerchantContent(page);
  await next.locator('.usage-history').waitFor({
    state: 'visible',
    timeout: READY_TIMEOUT_MS,
  });
  return next;
}

async function openDemoUsageRecovery(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const customerName = demoRecoveryCustomer();
  const row = content
    .locator('.usage-history__table tbody tr')
    .filter({ hasText: customerName })
    .first();
  await row.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const displayedCustomer = (
    await row.locator('td:nth-child(3)').textContent().catch(() => '')
  )?.trim();
  if (displayedCustomer !== customerName) {
    throw new Error(
      `Could not deterministically identify usage for synthetic recovery '${customerName}'.`,
    );
  }
  const link = row.locator('td:nth-child(2) a[href*="/app/recoveries/"]').first();
  await demoClick(page, link);
  const next = await locateMerchantContent(page);
  await assertSyntheticRecoveryDetail(next, customerName);
  return next;
}

async function openPurchasedCreditHistory(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const link = content
    .locator(
      '.moda-purchase-management-card a[href="/app/billing/recovery-credit-purchases"]',
    )
    .first();
  await link.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoClick(page, link);
  const next = await locateMerchantContent(page);
  await next.locator('.moda-purchase-history').waitFor({
    state: 'visible',
    timeout: READY_TIMEOUT_MS,
  });
  return next;
}

async function showPlanChangePanel(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const button = content.locator('.moda-view-switch button').nth(1);
  await button.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const insideForm = await button.evaluate((element) => Boolean(element.closest('form')));
  if (insideForm) {
    throw new Error('Refusing to use the billing Change plan switch because it unexpectedly belongs to a form.');
  }
  await demoClick(page, button);
  await content.locator('.moda-billing-panel').waitFor({
    state: 'visible',
    timeout: READY_TIMEOUT_MS,
  });
  return content;
}

async function openShopifyPlanSelector(
  page: Page,
  content: MerchantContent,
): Promise<null> {
  const link = content
    .locator('.moda-plan-actions a[href="/app/billing/select"]')
    .first();
  await link.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoClick(page, link);
  await page
    .getByText('Select a plan', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await installDemoCursor(page);
  return null;
}

async function returnFromShopifyPlanSelector(page: Page): Promise<MerchantContent> {
  const appLabel = requiredEnv('SHOPIFY_APP_NAV_LABEL');
  const appLink = await visibleTextLocator(page, appLabel);
  await demoClick(page, appLink);
  const next = await locateMerchantContent(page);
  await assertActiveDemoFixture(next);
  await next
    .locator('section[aria-label="Recovery overview"]')
    .first()
    .waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await assertCleanActiveDemoFixture(next);
  return next;
}

async function selectRecoveryOffer(
  page: Page,
  content: MerchantContent,
  value: 'FIXED' | 'AI_BEST_APPLICABLE',
): Promise<void> {
  const input = content
    .locator(`input[name="recoveryOfferMode"][value="${value}"]`)
    .first();
  await input.waitFor({ state: 'attached', timeout: READY_TIMEOUT_MS });
  if (await input.isChecked()) return;
  const label = input.locator('xpath=ancestor::label[1]');
  await label.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoClick(page, label);
  if (!(await input.isChecked())) {
    throw new Error(`Recovery offer mode '${value}' did not become selected.`);
  }
}

async function showFixedDiscountExample(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  await selectRecoveryOffer(page, content, 'FIXED');
  const discounts = content.locator('.moda-recovery-discount-card:not(.is-disabled)');
  await discounts.first().waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const configured = process.env.SHOPIFY_DEMO_FIXED_DISCOUNT_LABEL?.trim();
  const card = configured
    ? discounts.filter({ hasText: configured }).first()
    : discounts.first();
  await card.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const radio = card.locator('input[type="radio"]');
  if (!(await radio.isChecked())) await demoClick(page, card);
  if (!(await radio.isChecked())) {
    throw new Error(
      `Could not select the configured synthetic Shopify discount${configured ? ` '${configured}'` : ''}.`,
    );
  }
  await demoScrollTo(page, card, { block: 'center' });
  return content;
}

async function showAiDiscountOption(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  await selectRecoveryOffer(page, content, 'AI_BEST_APPLICABLE');
  const input = content
    .locator('input[name="recoveryOfferMode"][value="AI_BEST_APPLICABLE"]')
    .first();
  const label = input.locator('xpath=ancestor::label[1]');
  await demoScrollTo(page, label, { block: 'center' });
  return content;
}

async function showFollowUpExample(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const checkbox = content.locator('input[name="followUpEnabled"]').first();
  await checkbox.waitFor({ state: 'attached', timeout: READY_TIMEOUT_MS });
  if (!(await checkbox.isChecked())) {
    const label = checkbox.locator('xpath=ancestor::label[1]');
    await label.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
    await demoClick(page, label);
  }
  if (!(await checkbox.isChecked())) {
    throw new Error('Could not enable the local no-response follow-up example.');
  }
  const delay = content.locator('#followUpDelayMinutes').first();
  await delay.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoScrollTo(page, delay, { onlyIfNeeded: true });
  await moveDemoCursor(page, delay);
  await delay.fill(demoFollowUpMinutes());
  await page.waitForTimeout(650);
  return content;
}

async function selectKnowledgePurpose(
  page: Page,
  select: Locator,
): Promise<void> {
  await select.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const requested = demoKnowledgePurpose();
  const options = await select.locator('option').allTextContents();
  const label = options.map((option) => option.trim()).find((option) => option === requested)
    ?? options.map((option) => option.trim()).find((option) => option === 'Product information')
    ?? options.map((option) => option.trim()).find(Boolean);
  if (!label) throw new Error('Merchant Knowledge purpose selector has no available options.');
  await demoScrollTo(page, select, { onlyIfNeeded: true });
  await moveDemoCursor(page, select);
  await select.selectOption({ label });
  await page.waitForTimeout(650);
}

async function showKnowledgeWebPricing(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const form = content.locator('.moda-merchant-knowledge-web-form').first();
  const select = form.locator('select[name="purposeKey"]').first();
  await selectKnowledgePurpose(page, select);
  return content;
}

async function showKnowledgeUploadPricing(
  page: Page,
  content: MerchantContent,
): Promise<MerchantContent> {
  const form = content.locator('.moda-merchant-knowledge-upload-form').first();
  const purpose = form.locator('select').first();
  await selectKnowledgePurpose(page, purpose);
  const dataFormat = form.locator('select').nth(1);
  if (await dataFormat.isVisible().catch(() => false)) {
    await demoScrollTo(page, dataFormat, { onlyIfNeeded: true });
    await moveDemoCursor(page, dataFormat);
    await page.waitForTimeout(450);
  }
  return content;
}

async function runDemoAction(
  page: Page,
  content: MerchantContent | null,
  action: MerchantVideoDemoAction,
): Promise<MerchantContent | null> {
  if (action === 'return-from-shopify-plan-selector') {
    return returnFromShopifyPlanSelector(page);
  }
  if (!content) {
    throw new Error(`Demo action '${action}' requires the merchant application to be visible.`);
  }
  switch (action) {
    case 'open-demo-recovery':
      return openDemoRecovery(page, content);
    case 'open-usage-history':
      return openUsageHistory(page, content);
    case 'open-demo-usage-recovery':
      return openDemoUsageRecovery(page, content);
    case 'open-purchased-credit-history':
      return openPurchasedCreditHistory(page, content);
    case 'show-plan-change-panel':
      return showPlanChangePanel(page, content);
    case 'open-shopify-plan-selector':
      return openShopifyPlanSelector(page, content);
    case 'show-fixed-discount-example':
      return showFixedDiscountExample(page, content);
    case 'show-ai-discount-option':
      return showAiDiscountOption(page, content);
    case 'show-follow-up-example':
      return showFollowUpExample(page, content);
    case 'show-knowledge-web-pricing':
      return showKnowledgeWebPricing(page, content);
    case 'show-knowledge-upload-pricing':
      return showKnowledgeUploadPricing(page, content);
  }
}

async function runStep(
  page: Page,
  content: MerchantContent | null,
  step: MerchantVideoStep,
): Promise<MerchantContent | null> {
  if (step.type === 'hold') {
    await page.waitForTimeout(step.durationMs);
    return content;
  }

  if (step.type === 'demoAction') {
    return runDemoAction(page, content, step.action);
  }

  if (!content) {
    throw new Error(
      `VIDEO-001 step '${step.type}' requires the embedded merchant application to be visible.`,
    );
  }

  const target = content.locator(step.locator).first();
  await target.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });

  if (step.type === 'openDisclosure') {
    const tagName = await target.evaluate((element) =>
      element.tagName.toLowerCase(),
    );
    if (tagName !== 'details') {
      throw new Error(
        `VIDEO-001 openDisclosure may target only a native <details> element. ` +
          `Locator '${step.locator}' resolved to <${tagName}>.`,
      );
    }

    const alreadyOpen = await target.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    );
    if (!alreadyOpen) {
      const summary = target.locator(':scope > summary').first();
      await summary.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
      await demoClick(page, summary);
      const opened = await target.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      );
      if (!opened) {
        throw new Error(
          `Disclosure '${step.locator}' did not open after selecting its summary.`,
        );
      }
    }
    return content;
  }

  await demoScrollTo(page, target);
  await moveDemoCursor(page, target);
  await page.waitForTimeout(450);
  return content;
}

async function prepareShopifyLaunch(
  page: Page,
  scene: MerchantVideoScene,
  markVisualStart: () => void,
): Promise<MerchantContent> {
  const storeAdminUrl = requiredEnv('SHOPIFY_STORE_ADMIN_URL');
  const appLabel = requiredEnv('SHOPIFY_APP_NAV_LABEL');
  await page.goto(storeAdminUrl, { waitUntil: 'domcontentloaded' });
  await installDemoCursor(page);

  const appLink = page.getByText(appLabel, { exact: true }).first();
  await appLink.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  markVisualStart();
  await page.waitForTimeout(900);
  await demoClick(page, appLink);

  let content: MerchantContent;
  try {
    content = await locateMerchantContent(page, APP_LAUNCH_FALLBACK_TIMEOUT_MS);
  } catch {
    // Shopify's host navigation can change without the merchant application
    // changing. Preserve the visible launch click, then use the configured
    // installed-app URL as a deterministic recovery path if the host did not
    // finish embedding the app quickly enough.
    const appUrl = requiredEnv('SHOPIFY_MERCHANT_APP_URL');
    const targetUrl = merchantAdminUrlForRoute(appUrl, '/app');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await installDemoCursor(page);
    content = await locateMerchantContent(page);
  }
  await assertActiveDemoFixture(content);
  await content
    .locator(scene.readyLocator)
    .first()
    .waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await assertCleanActiveDemoFixture(content);
  return content;
}

async function prepareMerchantScene(
  page: Page,
  scene: MerchantVideoScene,
): Promise<MerchantContent> {
  let content = await navigateMerchantRoute(page, scene.route);
  await assertActiveDemoFixture(content);
  await content
    .locator(scene.readyLocator)
    .first()
    .waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  if (scene.route === '/app/recoveries') await assertSyntheticRecoveryList(content);
  if (scene.route === '/app') await assertCleanActiveDemoFixture(content);
  return content;
}

async function captureScene(
  request: MerchantVideoCaptureRequest,
  scene: MerchantVideoScene,
  storageState: string,
): Promise<MerchantVideoCaptureResult> {
  if (scene.capture === 'deferred') {
    return {
      sceneId: scene.id,
      title: scene.title,
      status: 'skipped-deferred',
      ...(scene.deferredReason ? { reason: scene.deferredReason } : {}),
    };
  }

  const outputPath = sceneOutputPath(request.locale, scene);
  const exists = await fs
    .access(outputPath)
    .then(() => true)
    .catch(() => false);
  if (exists && !request.overwrite) {
    return {
      sceneId: scene.id,
      title: scene.title,
      status: 'skipped-existing',
      outputPath,
    };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (request.overwrite) await fs.rm(outputPath, { force: true });

  const tempDir = path.join(
    videoRoot(request.locale),
    '.raw',
    `${String(scene.order).padStart(2, '0')}-${scene.id}`,
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });

  const browser = await chromium.launch({
    headless: !request.headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=WebAuthentication,WebAuthenticationCustomUI',
    ],
  });
  const context = await browser.newContext({
    storageState,
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: browserLocale(request.locale),
    recordVideo: {
      dir: tempDir,
      size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    },
  });
  await context.grantPermissions([]);
  const recordingStartedAt = performance.now();
  const page = await context.newPage();
  const video = page.video();
  let visualStartedAt = recordingStartedAt;
  let visualEndedAt = recordingStartedAt;

  try {
    let content: MerchantContent | null;
    if (scene.entry === 'shopify-admin') {
      content = await prepareShopifyLaunch(page, scene, () => {
        visualStartedAt = performance.now();
      });
    } else {
      content = await prepareMerchantScene(page, scene);
      visualStartedAt = performance.now();
    }

    await applyPrivacySelectors(content, scene.privacySelectors);
    for (const step of scene.steps) {
      content = await runStep(page, content, step);
      if (content) await applyPrivacySelectors(content, scene.privacySelectors);
    }
    visualEndedAt = performance.now();
  } finally {
    await context.close();
    await browser.close();
  }

  if (!video) throw new Error(`Playwright did not create a video for '${scene.id}'.`);
  const rawPath = await video.path();
  const trimWindow = calculateTrimWindow(
    recordingStartedAt,
    visualStartedAt,
    visualEndedAt,
  );
  await trimRecordedWebm(rawPath, outputPath, trimWindow);
  await fs.rm(tempDir, { recursive: true, force: true });

  return {
    sceneId: scene.id,
    title: scene.title,
    status: 'captured',
    outputPath,
  };
}

export async function captureMerchantDemo(
  request: MerchantVideoCaptureRequest,
): Promise<MerchantVideoCaptureResult[]> {
  if (request.locale !== 'en') {
    throw new Error(
      `VIDEO-001 captures English only. Requested locale '${request.locale}' is not supported yet.`,
    );
  }

  const plan = buildMerchantVideoPlan(request.locale, request.sceneId);
  const requiresBrowser = plan.some(({ scene }) => scene.capture === 'enabled');
  const storageState = requiresBrowser ? await assertStorageState() : '';
  const results: MerchantVideoCaptureResult[] = [];

  for (const { scene } of plan) {
    try {
      const result = await captureScene(request, scene, storageState);
      results.push(result);
    } catch (error) {
      results.push({
        sceneId: scene.id,
        title: scene.title,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const reportDir = videoRoot(request.locale);
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'capture-report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        locale: request.locale,
        viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
        results,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return results;
}
