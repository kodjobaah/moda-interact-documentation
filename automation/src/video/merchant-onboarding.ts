import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium, type Locator, type Page } from 'playwright';
import type { DocumentationLocale } from '../locales.js';
import { ARTIFACTS_DIR } from '../paths.js';
import {
  ACTIVE_MERCHANT_DEMO_NAVIGATION,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  assertStorageState,
  calculateTrimWindow,
  demoClick,
  demoScrollTo,
  installDemoCursor,
  locateMerchantContent,
  merchantAdminUrlForRoute,
  requiredEnv,
  trimRecordedWebm,
  type MerchantContent,
} from './merchant-demo.js';

const READY_TIMEOUT_MS = 45_000;
const PRICING_TIMEOUT_MS = 60_000;
const ACTIVATION_TIMEOUT_MS = 120_000;
const SHOPIFY_PLAN_PAGE_HOLD_MS = 3_200;
const SHOPIFY_APPROVAL_PAGE_HOLD_MS = 2_600;
const ACTIVATION_RELOAD_INTERVAL_MS = 4_000;

export const SHOPIFY_DEVELOPMENT_PLAN_ACTION_LABEL = 'Test with this plan';
export const ONBOARDING_CONFIGURATION_UNAVAILABLE_PATTERN =
  /subscription could not be safely mapped|configuration unavailable/i;
export const ONBOARDING_FREE_ALLOWANCE_PATTERN = /Lifetime Free recoveries:/i;
export const ONBOARDING_AVAILABLE_CAPACITY_PATTERN = /Capacity available/i;

export const MERCHANT_ONBOARDING_FIXTURE_REQUIREMENT =
  'fresh synthetic development shop: shop ACTIVE, onboarding incomplete, and no existing Shopify plan selection evidence';

export const MERCHANT_ONBOARDING_SCROLL_TOUR = [
  { locator: '#mi-onboarding-hero-title', holdMs: 1900 },
  { locator: '#mi-benefits-title', holdMs: 1900 },
  { locator: '#mi-how-title', holdMs: 2100 },
  { locator: '#mi-pricing-title', holdMs: 2600 },
] as const;

export type MerchantOnboardingCaptureRequest = {
  locale: DocumentationLocale;
  overwrite: boolean;
  headed: boolean;
  confirmMutation: boolean;
};

export type MerchantOnboardingPlan = {
  outputPath: string;
  fixtureRequirement: string;
  freePlanName: string;
  storeCategory?: string;
  storeItemTypes?: string[];
  mutatesState: true;
};

function onboardingRoot(locale: DocumentationLocale): string {
  return path.join(ARTIFACTS_DIR, 'videos', locale, 'onboarding');
}

export function merchantOnboardingOutputPath(
  locale: DocumentationLocale,
): string {
  return path.join(onboardingRoot(locale), '01-onboarding-free-plan.webm');
}

export function configuredOnboardingStoreItemTypes(
  raw = process.env.SHOPIFY_ONBOARDING_STORE_ITEM_TYPES,
): string[] {
  const values = (raw ?? '')
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export function buildMerchantOnboardingPlan(
  locale: DocumentationLocale,
): MerchantOnboardingPlan {
  const storeItemTypes = configuredOnboardingStoreItemTypes();
  return {
    outputPath: merchantOnboardingOutputPath(locale),
    fixtureRequirement: MERCHANT_ONBOARDING_FIXTURE_REQUIREMENT,
    freePlanName: process.env.SHOPIFY_ONBOARDING_FREE_PLAN_NAME?.trim() || 'Free',
    ...(process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY?.trim()
      ? { storeCategory: process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY.trim() }
      : {}),
    ...(storeItemTypes.length ? { storeItemTypes } : {}),
    mutatesState: true,
  };
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function assertFreshOnboardingFixture(
  content: MerchantContent,
): Promise<void> {
  const billingSetup = content.locator('#mi-billing-setup-title').first();
  if (await isVisible(billingSetup)) {
    throw new Error(
      'The selected shop already has Shopify plan-selection evidence and is showing billing setup. ' +
        'Use a genuinely fresh synthetic store before recording the onboarding video.',
    );
  }

  const hero = content.locator('#mi-onboarding-hero-title').first();
  await hero.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });

  const hrefs = await content
    .locator('s-app-nav [href]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('href'))
        .filter((href): href is string => Boolean(href)),
    );
  const activeOnly = ACTIVE_MERCHANT_DEMO_NAVIGATION.filter((href) =>
    hrefs.includes(href),
  );
  if (activeOnly.length > 0) {
    throw new Error(
      `The selected shop is already beyond onboarding. ACTIVE-only routes are present: ${activeOnly.join(', ')}. ` +
        'Create a new synthetic development store for this one-shot onboarding recording.',
    );
  }
}

async function selectConfiguredStoreCategory(
  page: Page,
  content: MerchantContent,
): Promise<void> {
  const select = content.locator('#onboarding-store-category').first();
  await select.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  const configured = process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY?.trim();
  if (!configured) {
    await page.waitForTimeout(1500);
    return;
  }

  const options = await select.locator('option').allTextContents();
  if (!options.some((option) => option.trim() === configured)) {
    throw new Error(
      `SHOPIFY_ONBOARDING_STORE_CATEGORY='${configured}' is not available. ` +
        `Visible categories: ${options.map((option) => option.trim()).filter(Boolean).join(', ') || '(none)'}`,
    );
  }

  await select.selectOption({ label: configured });
  await page.waitForTimeout(1400);
}

async function configureStoreItemTypes(
  page: Page,
  content: MerchantContent,
): Promise<void> {
  const desired = configuredOnboardingStoreItemTypes();
  const group = content.locator('.moda-store-mapping-selector--onboarding').first();
  const visible = await isVisible(group);

  if (!visible) {
    if (desired.length) {
      throw new Error(
        `SHOPIFY_ONBOARDING_STORE_ITEM_TYPES requests ${desired.join(', ')}, but the selected Store Category exposes no item-type checkboxes.`,
      );
    }
    return;
  }

  await demoScrollTo(page, group, { settleMs: 900, block: 'center' });
  const labels = (await group.locator('label.moda-store-mapping-option').allTextContents())
    .map((label) => label.trim())
    .filter(Boolean);

  if (!desired.length) {
    // Even when the demo relies on the application's suggested/default mapping
    // selection, pause on the checkboxes so viewers can see that the broad
    // Store Category can be refined by the types of items the shop sells.
    await page.waitForTimeout(1900);
    return;
  }

  const unavailable = desired.filter((label) => !labels.includes(label));
  if (unavailable.length) {
    throw new Error(
      `SHOPIFY_ONBOARDING_STORE_ITEM_TYPES contains item types that are not available for the selected Store Category: ${unavailable.join(', ')}. ` +
        `Visible item types: ${labels.join(', ') || '(none)'}`,
    );
  }

  // Treat configured item types as the exact demo selection. The checkbox
  // state is still local React state here; it is persisted only when the
  // subsequent View plans in Shopify action submits the onboarding selection.
  for (const label of labels) {
    const checkbox = group.getByRole('checkbox', { name: label, exact: true }).first();
    const shouldBeChecked = desired.includes(label);
    const checked = await checkbox.isChecked();
    if (checked === shouldBeChecked) continue;
    await demoClick(page, checkbox);
    await page.waitForTimeout(450);
  }

  await page.waitForTimeout(1900);
}

async function choosePlansInShopify(
  page: Page,
  content: MerchantContent,
): Promise<void> {
  const label =
    process.env.SHOPIFY_ONBOARDING_CHOOSE_PLAN_LABEL?.trim() ||
    'View plans in Shopify';
  const button = content
    .locator('s-button')
    .filter({ hasText: label })
    .first();
  await button.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
  await demoClick(page, button);
  await page.waitForURL(/\/charges\/[^/]+\/pricing_plans(?:[/?#]|$)/, {
    timeout: PRICING_TIMEOUT_MS,
  });
  await installDemoCursor(page);
  // Shopify-hosted pricing is part of the public walkthrough, not merely a
  // transit page. Development stores label actions 'Test with this plan' and
  // may show $0 test pricing, so hold long enough for the later narration to
  // explain that live-store pricing is shown by Shopify in production.
  await page.waitForTimeout(SHOPIFY_PLAN_PAGE_HOLD_MS);
}

async function findFreePlanAction(
  page: Page,
  planName: string,
): Promise<Locator> {
  const planLabel = page.getByText(planName, { exact: true }).first();
  await planLabel.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });

  const card = planLabel.locator(
    'xpath=ancestor::*[self::article or self::section or self::div][.//button or .//a][1]',
  );
  if ((await card.count()) === 0) {
    throw new Error(
      `Could not identify the Shopify pricing card containing plan '${planName}'.`,
    );
  }

  const configuredAction =
    process.env.SHOPIFY_ONBOARDING_PLAN_ACTION_LABEL?.trim();
  if (configuredAction) {
    const button = card.getByRole('button', { name: configuredAction, exact: true }).first();
    if (await isVisible(button)) return button;
    const link = card.getByRole('link', { name: configuredAction, exact: true }).first();
    if (await isVisible(link)) return link;
    throw new Error(
      `SHOPIFY_ONBOARDING_PLAN_ACTION_LABEL='${configuredAction}' was not visible in the '${planName}' plan card.`,
    );
  }

  const candidates = card.locator('button, a');
  const visible: Array<{ locator: Locator; text: string }> = [];
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!(await isVisible(candidate))) continue;
    visible.push({
      locator: candidate,
      text: (await candidate.innerText().catch(() => '')).trim(),
    });
  }

  const preferred = visible.find(({ text }) =>
    /test with this plan|select|choose|start|subscribe|free/i.test(text),
  );
  if (preferred) return preferred.locator;
  if (visible.length === 1) return visible[0]!.locator;

  throw new Error(
    `Could not safely identify the action for Shopify plan '${planName}'. ` +
      `Visible plan-card actions: ${visible.map(({ text }) => text || '(unlabelled)').join(', ') || '(none)'}. ` +
      'Set SHOPIFY_ONBOARDING_PLAN_ACTION_LABEL to the exact visible action label and rerun on a fresh store.',
  );
}

async function approveIfShopifyRequestsConfirmation(page: Page): Promise<boolean> {
  const configured = process.env.SHOPIFY_ONBOARDING_CONFIRM_LABEL?.trim();
  const button = configured
    ? page.getByRole('button', { name: configured, exact: true }).first()
    : page.getByRole('button', { name: /^(approve|confirm)$/i }).first();
  const visible = await button
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    if (configured) {
      throw new Error(
        `SHOPIFY_ONBOARDING_CONFIRM_LABEL='${configured}' was not visible after selecting the Shopify plan.`,
      );
    }
    return false;
  }

  await installDemoCursor(page);
  // The approval surface is an important trust boundary: Shopify, not Moda,
  // confirms the subscription/test charge. Keep it visible before approving.
  await page.waitForTimeout(SHOPIFY_APPROVAL_PAGE_HOLD_MS);
  await demoClick(page, button);
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isHealthyFreePlanOverviewStatus(
  statusText: string,
  capacityText: string,
  planName = 'Free',
): boolean {
  const planPattern = new RegExp(
    `Current plan:\\s*${escapeRegExp(planName)}`,
    'i',
  );
  return (
    !ONBOARDING_CONFIGURATION_UNAVAILABLE_PATTERN.test(statusText) &&
    ONBOARDING_AVAILABLE_CAPACITY_PATTERN.test(statusText) &&
    planPattern.test(capacityText) &&
    ONBOARDING_FREE_ALLOWANCE_PATTERN.test(capacityText)
  );
}

async function waitForActivatedOverview(page: Page, planName: string): Promise<void> {
  const deadline = Date.now() + ACTIVATION_TIMEOUT_MS;
  let showedBillingSetup = false;
  let sawUnsafeMappedOverview = false;

  while (Date.now() < deadline) {
    let content: MerchantContent;
    try {
      content = await locateMerchantContent(page, 2_000);
    } catch {
      await page.waitForTimeout(750);
      continue;
    }

    const setup = content.locator('#mi-billing-setup-title').first();
    if (await isVisible(setup)) {
      if (!showedBillingSetup) {
        showedBillingSetup = true;
        await installDemoCursor(page);
        await page.waitForTimeout(2400);
      }
      await page.waitForTimeout(1000);
      continue;
    }

    const overview = content.locator('section[aria-label="Recovery overview"]').first();
    if (!(await isVisible(overview))) {
      await page.waitForTimeout(900);
      continue;
    }

    const capacity = content
      .locator('section[aria-labelledby="overview-capacity"]')
      .first();
    const status = capacity.locator('[role="status"]').first();
    const capacityText = await capacity.innerText().catch(() => '');
    const statusText = await status.innerText().catch(() => '');

    if (isHealthyFreePlanOverviewStatus(statusText, capacityText, planName)) {
      await installDemoCursor(page);
      await page.waitForTimeout(2400);
      return;
    }

    if (ONBOARDING_CONFIGURATION_UNAVAILABLE_PATTERN.test(statusText)) {
      sawUnsafeMappedOverview = true;
    }

    // Shopify approval and Moda's durable billing reconciliation are separate
    // steps. The overview can appear before the local plan mapping/capacity is
    // safe. Re-read the projection periodically rather than treating the first
    // visible overview as successful onboarding.
    await page.waitForTimeout(ACTIVATION_RELOAD_INTERVAL_MS);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await installDemoCursor(page);
  }

  throw new Error(
    sawUnsafeMappedOverview
      ? 'The Free plan was approved in Shopify and the Recovery overview opened, but Moda Interact still reports that the subscription could not be safely mapped. The one-shot plan selection has already happened: do not create another charge or rerun onboarding on this store. Resolve billing reconciliation/mapping, then record the completed ACTIVE overview separately.'
      : 'Shopify plan selection completed, but Moda Interact did not reach a healthy Free-plan Recovery overview within two minutes. The one-shot plan selection may already have happened: inspect billing reconciliation before attempting another onboarding run.',
  );
}

export async function captureMerchantOnboarding(
  request: MerchantOnboardingCaptureRequest,
): Promise<{ outputPath: string; reportPath: string }> {
  if (request.locale !== 'en') {
    throw new Error(
      `The onboarding video currently supports English only. Requested '${request.locale}'.`,
    );
  }
  if (!request.confirmMutation) {
    throw new Error(
      'The onboarding recording intentionally persists Store Category selection and selects a Shopify plan. ' +
        'Run it only on a fresh disposable development store and pass --confirm-mutation to acknowledge the one-shot state change.',
    );
  }

  const plan = buildMerchantOnboardingPlan(request.locale);
  const outputPath = plan.outputPath;
  const exists = await fs.access(outputPath).then(() => true).catch(() => false);
  if (exists && !request.overwrite) {
    throw new Error(
      `Onboarding clip already exists: ${outputPath}. Use --overwrite only when recording against a NEW fresh store.`,
    );
  }

  const storageState = await assertStorageState();
  const appUrl = requiredEnv('SHOPIFY_MERCHANT_APP_URL');
  const tempDir = path.join(onboardingRoot(request.locale), '.raw');
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (request.overwrite) await fs.rm(outputPath, { force: true });

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
    locale: request.locale,
    recordVideo: {
      dir: tempDir,
      size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    },
  });
  const recordingStartedAt = performance.now();
  const page = await context.newPage();
  const video = page.video();
  let visualStartedAt = recordingStartedAt;
  let visualEndedAt = recordingStartedAt;

  try {
    await page.goto(merchantAdminUrlForRoute(appUrl, '/app'), {
      waitUntil: 'domcontentloaded',
    });
    await installDemoCursor(page);
    let content = await locateMerchantContent(page);
    await assertFreshOnboardingFixture(content);
    visualStartedAt = performance.now();
    await page.waitForTimeout(1600);

    await selectConfiguredStoreCategory(page, content);
    await configureStoreItemTypes(page, content);

    // The onboarding page is intentionally a long-form product introduction.
    // Record a paced top-to-bottom tour rather than teleporting directly to
    // pricing so the finished video shows the page as a merchant experiences it.
    for (const stop of MERCHANT_ONBOARDING_SCROLL_TOUR) {
      const target = content.locator(stop.locator).first();
      await target.waitFor({ state: 'visible', timeout: READY_TIMEOUT_MS });
      await demoScrollTo(page, target, { settleMs: 1200 });
      await page.waitForTimeout(stop.holdMs);
    }

    // choosePlansInShopify uses demoClick, which now scrolls smoothly back to
    // the visible onboarding CTA when needed before selecting it.
    await choosePlansInShopify(page, content);
    const freePlanAction = await findFreePlanAction(page, plan.freePlanName);
    await demoScrollTo(page, freePlanAction, { settleMs: 900, block: 'center' });
    await page.waitForTimeout(1800);
    await demoClick(page, freePlanAction);
    await approveIfShopifyRequestsConfirmation(page);
    await waitForActivatedOverview(page, plan.freePlanName);
    visualEndedAt = performance.now();
  } finally {
    await context.close();
    await browser.close();
  }

  if (!video) throw new Error('Playwright did not create the onboarding video.');
  const rawPath = await video.path();
  const trimWindow = calculateTrimWindow(
    recordingStartedAt,
    visualStartedAt,
    visualEndedAt,
  );
  await trimRecordedWebm(rawPath, outputPath, trimWindow);
  await fs.rm(tempDir, { recursive: true, force: true });

  const reportPath = path.join(onboardingRoot(request.locale), 'capture-report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        locale: request.locale,
        fixtureRequirement: plan.fixtureRequirement,
        freePlanName: plan.freePlanName,
        storeCategory: plan.storeCategory ?? null,
        storeItemTypes: plan.storeItemTypes ?? null,
        mutatesState: true,
        outputPath,
        trimWindow,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return { outputPath, reportPath };
}
