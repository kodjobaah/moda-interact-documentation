import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../src/paths.js';
import {
  MERCHANT_ONBOARDING_FIXTURE_REQUIREMENT,
  MERCHANT_ONBOARDING_SCROLL_TOUR,
  ONBOARDING_CONFIGURATION_UNAVAILABLE_PATTERN,
  SHOPIFY_DEVELOPMENT_PLAN_ACTION_LABEL,
  buildMerchantOnboardingPlan,
  configuredOnboardingStoreItemTypes,
  isHealthyFreePlanOverviewStatus,
  merchantOnboardingOutputPath,
} from '../src/video/merchant-onboarding.js';

const ORIGINAL_FREE_PLAN = process.env.SHOPIFY_ONBOARDING_FREE_PLAN_NAME;
const ORIGINAL_CATEGORY = process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY;
const ORIGINAL_ITEM_TYPES = process.env.SHOPIFY_ONBOARDING_STORE_ITEM_TYPES;

afterEach(() => {
  if (ORIGINAL_FREE_PLAN === undefined) delete process.env.SHOPIFY_ONBOARDING_FREE_PLAN_NAME;
  else process.env.SHOPIFY_ONBOARDING_FREE_PLAN_NAME = ORIGINAL_FREE_PLAN;
  if (ORIGINAL_CATEGORY === undefined) delete process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY;
  else process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY = ORIGINAL_CATEGORY;
  if (ORIGINAL_ITEM_TYPES === undefined) delete process.env.SHOPIFY_ONBOARDING_STORE_ITEM_TYPES;
  else process.env.SHOPIFY_ONBOARDING_STORE_ITEM_TYPES = ORIGINAL_ITEM_TYPES;
});

describe('merchant onboarding video contract', () => {
  it('is explicitly a fresh-store mutating flow', () => {
    expect(MERCHANT_ONBOARDING_FIXTURE_REQUIREMENT).toMatch(/fresh synthetic/i);
    expect(MERCHANT_ONBOARDING_FIXTURE_REQUIREMENT).toMatch(/onboarding incomplete/i);
    expect(buildMerchantOnboardingPlan('en').mutatesState).toBe(true);
  });

  it('defaults to the Free Shopify plan and supports an optional demo category and item types', () => {
    delete process.env.SHOPIFY_ONBOARDING_FREE_PLAN_NAME;
    process.env.SHOPIFY_ONBOARDING_STORE_CATEGORY = 'Apparel & Accessories';
    process.env.SHOPIFY_ONBOARDING_STORE_ITEM_TYPES =
      'Clothing Accessories| Handbag & Wallet Accessories |Clothing Accessories';
    const plan = buildMerchantOnboardingPlan('en');
    expect(plan.freePlanName).toBe('Free');
    expect(plan.storeCategory).toBe('Apparel & Accessories');
    expect(plan.storeItemTypes).toEqual([
      'Clothing Accessories',
      'Handbag & Wallet Accessories',
    ]);
  });

  it('parses exact item-type labels using a delimiter that does not conflict with normal labels', () => {
    expect(
      configuredOnboardingStoreItemTypes(
        'Clothing Accessories|Costumes & Accessories|Handbag & Wallet Accessories',
      ),
    ).toEqual([
      'Clothing Accessories',
      'Costumes & Accessories',
      'Handbag & Wallet Accessories',
    ]);
  });


  it('recognizes Shopify development-store plan and approval semantics without treating an unsafe overview as complete', () => {
    expect(SHOPIFY_DEVELOPMENT_PLAN_ACTION_LABEL).toBe('Test with this plan');
    expect(ONBOARDING_CONFIGURATION_UNAVAILABLE_PATTERN.test(
      'Your subscription could not be safely mapped. Contact Moda support before using paid features.',
    )).toBe(true);
    expect(isHealthyFreePlanOverviewStatus(
      'Capacity available',
      'Current recovery capacity\nCurrent plan: Free\nLifetime Free recoveries: 5 of 5 remaining',
    )).toBe(true);
    expect(isHealthyFreePlanOverviewStatus(
      'Your subscription could not be safely mapped. Contact Moda support before using paid features.',
      'Current recovery capacity\nCurrent plan: Free',
    )).toBe(false);
  });

  it('writes the one-shot onboarding clip outside the read-only scene directory', () => {
    expect(path.basename(merchantOnboardingOutputPath('en'))).toBe(
      '01-onboarding-free-plan.webm',
    );
    expect(merchantOnboardingOutputPath('en')).toContain(
      `${path.sep}onboarding${path.sep}`,
    );
  });

  it('keeps an English editorial storyboard for narration work', async () => {
    const raw = await fs.readFile(
      path.join(
        REPOSITORY_ROOT,
        'videos/merchant-onboarding/storyboard.en.json',
      ),
      'utf8',
    );
    const storyboard = JSON.parse(raw) as {
      locale: string;
      mutationWarning: string;
      chapters: Array<{ id: string }>;
    };
    expect(storyboard.locale).toBe('en');
    expect(storyboard.mutationWarning).toMatch(/one-shot/i);
    expect(storyboard.chapters.map((chapter) => chapter.id)).toEqual([
      'welcome',
      'store-category',
      'item-types',
      'pricing-preview',
      'shopify-free-plan',
      'activation',
    ]);
  });
  it('defines a paced top-to-bottom onboarding scroll tour', () => {
    expect(MERCHANT_ONBOARDING_SCROLL_TOUR).toEqual([
      { locator: '#mi-onboarding-hero-title', holdMs: 1900 },
      { locator: '#mi-benefits-title', holdMs: 1900 },
      { locator: '#mi-how-title', holdMs: 2100 },
      { locator: '#mi-pricing-title', holdMs: 2600 },
    ]);
  });

});
