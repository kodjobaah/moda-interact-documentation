import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MERCHANT_VIDEO_SCENES } from '../config/merchant-video-scenes.js';
import { REPOSITORY_ROOT } from '../src/paths.js';
import {
  ACTIVE_MERCHANT_DEMO_NAVIGATION,
  MERCHANT_VIDEO_FIXTURE_REQUIREMENT,
  buildMerchantVideoPlan,
  calculateTrimWindow,
  disqualifyingActiveDemoWarnings,
  merchantAdminUrlForRoute,
  missingActiveMerchantDemoNavigation,
} from '../src/video/merchant-demo.js';

type Storyboard = {
  locale: string;
  fixture: string;
  scenes: Array<{
    id: string;
    capture: 'enabled' | 'deferred';
    deferredReason?: string;
  }>;
};

async function readStoryboard(): Promise<Storyboard> {
  const value = await fs.readFile(
    path.join(REPOSITORY_ROOT, 'videos/merchant-demo/storyboard.en.json'),
    'utf8',
  );
  return JSON.parse(value) as Storyboard;
}

describe('merchant video scene contract', () => {
  it('has stable unique ordering and IDs', () => {
    expect(MERCHANT_VIDEO_SCENES.map((scene) => scene.order)).toEqual(
      MERCHANT_VIDEO_SCENES.map((_, index) => index + 1),
    );
    expect(new Set(MERCHANT_VIDEO_SCENES.map((scene) => scene.id)).size).toBe(
      MERCHANT_VIDEO_SCENES.length,
    );
  });

  it('exposes only reviewed choreography primitives and never a generic click/submit', () => {
    for (const scene of MERCHANT_VIDEO_SCENES) {
      for (const step of scene.steps) {
        expect(['hold', 'scrollTo', 'openDisclosure', 'demoAction']).toContain(
          step.type,
        );
        expect(step.type).not.toBe('click');
        expect(step.type).not.toBe('submit');
      }
    }
  });

  it('adds dedicated Recovery Detail and billing evidence scenes', () => {
    expect(MERCHANT_VIDEO_SCENES.map((scene) => scene.id)).toEqual(
      expect.arrayContaining([
        'recovery-detail',
        'billing-usage-history',
        'billing-purchased-credits',
        'billing-change-plan',
      ]),
    );
    const detail = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'recovery-detail',
    );
    expect(
      detail?.steps.some(
        (step) =>
          step.type === 'demoAction' && step.action === 'open-demo-recovery',
      ),
    ).toBe(true);
  });

  it('requires the configured synthetic recovery before recording recovery evidence', () => {
    for (const sceneId of ['recovery-detail', 'billing-usage-history']) {
      const plan = buildMerchantVideoPlan('en', sceneId);
      expect(plan[0]?.requiredEnvironment).toContain(
        'SHOPIFY_DEMO_RECOVERY_CUSTOMER',
      );
    }
  });

  it('keeps billing refund and plan-change demonstrations read-only', () => {
    const purchases = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'billing-purchased-credits',
    );
    expect(
      purchases?.steps.some(
        (step) =>
          step.type === 'demoAction' &&
          step.action === 'open-purchased-credit-history',
      ),
    ).toBe(true);
    expect(
      purchases?.steps.some(
        (step) =>
          step.type === 'demoAction' && /refund/i.test(step.action),
      ),
    ).toBe(false);

    const changePlan = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'billing-change-plan',
    );
    expect(
      changePlan?.steps.map((step) =>
        step.type === 'demoAction' ? step.action : step.type,
      ),
    ).toEqual(
      expect.arrayContaining([
        'show-plan-change-panel',
        'open-shopify-plan-selector',
        'return-from-shopify-plan-selector',
      ]),
    );
  });

  it('routes Conversation Features through the consolidated Recovery Settings surface', () => {
    const features = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'features',
    );
    expect(features?.route).toBe('/app/recovery-settings');
    expect(features?.readyLocator).toBe('#conversation-features');
    expect(
      features?.steps.some(
        (step) =>
          step.type === 'scrollTo' && step.locator === '#conversation-features',
      ),
    ).toBe(true);
    expect(
      MERCHANT_VIDEO_SCENES.some((scene) => scene.route === '/app/features'),
    ).toBe(false);
  });

  it('demonstrates Recovery Behaviour only with unsaved local form state', () => {
    const settings = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'recovery-settings',
    );
    expect(
      settings?.steps
        .filter((step) => step.type === 'demoAction')
        .map((step) => step.action),
    ).toEqual(
      expect.arrayContaining([
        'show-fixed-discount-example',
        'show-ai-discount-option',
        'show-follow-up-example',
      ]),
    );
    expect(JSON.stringify(settings?.steps)).not.toMatch(/save recovery behaviour/i);
  });

  it('opens current collapsed read-only disclosures before recording their content', () => {
    const promotions = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'promotions',
    );
    const storeProfile = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'store-profile',
    );
    const knowledge = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'merchant-knowledge',
    );

    expect(
      promotions?.steps.some(
        (step) =>
          step.type === 'openDisclosure' && step.locator === '#promotion-history',
      ),
    ).toBe(true);
    expect(
      promotions?.steps.some(
        (step) =>
          step.type === 'scrollTo' &&
          step.locator === '.moda-promotion-history-list article:last-child',
      ),
    ).toBe(true);
    expect(storeProfile?.readyLocator).toBe('#store-assistant-context-heading');
    expect(
      storeProfile?.steps.filter((step) => step.type === 'openDisclosure'),
    ).toHaveLength(2);
    expect(knowledge?.readyLocator).toBe('#store-assistant-context-heading');
    expect(
      knowledge?.steps.filter((step) => step.type === 'openDisclosure').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('scrolls into both expanded Merchant Knowledge input surfaces', () => {
    const knowledge = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'merchant-knowledge',
    );
    expect(
      knowledge?.steps.some(
        (step) =>
          step.type === 'scrollTo' &&
          step.locator === '.moda-merchant-knowledge-web-form',
      ),
    ).toBe(true);
    expect(
      knowledge?.steps.some(
        (step) =>
          step.type === 'scrollTo' &&
          step.locator === '.moda-merchant-knowledge-upload-form',
      ),
    ).toBe(true);
    expect(
      knowledge?.steps
        .filter((step) => step.type === 'demoAction')
        .map((step) => step.action),
    ).toEqual(
      expect.arrayContaining([
        'show-knowledge-web-pricing',
        'show-knowledge-upload-pricing',
      ]),
    );
  });

  it('masks configured Merchant Knowledge source names and source locations', () => {
    const knowledge = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'merchant-knowledge',
    );
    expect(knowledge?.privacySelectors).toEqual([
      '.moda-merchant-knowledge-source-copy > h3',
      '.moda-merchant-knowledge-source-copy > p:nth-of-type(2)',
    ]);
  });

  it('masks customer names in usage history until the synthetic recovery detail guard has run', () => {
    const usage = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'billing-usage-history',
    );
    expect(usage?.privacySelectors).toContain(
      '.usage-history__table tbody td:nth-child(3)',
    );
  });

  it('uses a visible merchant surface rather than the hidden App Bridge nav element for launch readiness', () => {
    const launch = MERCHANT_VIDEO_SCENES.find(
      (scene) => scene.id === 'shopify-launch',
    );
    expect(launch?.readyLocator).toBe(
      'section[aria-label="Recovery overview"]',
    );
  });

  it('builds deterministic Shopify Admin embedded-app URLs for merchant routes', () => {
    const base = 'https://admin.shopify.com/store/example/apps/moda-interact';
    expect(merchantAdminUrlForRoute(base, '/app')).toBe(
      'https://admin.shopify.com/store/example/apps/moda-interact/app',
    );
    expect(
      merchantAdminUrlForRoute(
        `${base}/app/recoveries?foo=bar`,
        '/app/recovery-settings',
      ),
    ).toBe(
      'https://admin.shopify.com/store/example/apps/moda-interact/app/recovery-settings',
    );
    expect(() =>
      merchantAdminUrlForRoute(
        'https://admin.shopify.com/store/example',
        '/app',
      ),
    ).toThrow(/apps\/<handle>/);
  });

  it('trims raw Playwright loading footage around the intentional visual window', () => {
    expect(calculateTrimWindow(1_000, 6_000, 14_000)).toEqual({
      startSeconds: 4.65,
      durationSeconds: 8.6,
    });
  });

  it('rejects lifecycle warnings that make a public ACTIVE demo misleading', () => {
    expect(
      disqualifyingActiveDemoWarnings([
        'Your subscription is scheduled to end on Oct 19, 2026.',
        'Pending change to Growth, effective Oct 20, 2026',
        'Another operational warning',
      ]),
    ).toEqual([
      'Your subscription is scheduled to end on Oct 19, 2026.',
      'Pending change to Growth, effective Oct 20, 2026',
    ]);
  });

  it('requires the ACTIVE merchant navigation shape used by the demo', () => {
    expect(
      missingActiveMerchantDemoNavigation([...ACTIVE_MERCHANT_DEMO_NAVIGATION]),
    ).toEqual([]);
    expect(
      missingActiveMerchantDemoNavigation(
        ACTIVE_MERCHANT_DEMO_NAVIGATION.filter(
          (href) => href !== '/app/promotions',
        ),
      ),
    ).toEqual(['/app/promotions']);
    expect(MERCHANT_VIDEO_FIXTURE_REQUIREMENT).toMatch(/ACTIVE/);
    expect(MERCHANT_VIDEO_FIXTURE_REQUIREMENT).toMatch(/ACTIVE or TRIALING/);
  });

  it('keeps support capture deferred while the route can write read receipts', () => {
    const support = MERCHANT_VIDEO_SCENES.find((scene) => scene.id === 'support');
    expect(support?.capture).toBe('deferred');
    expect(support?.deferredReason).toMatch(/read receipt/i);
  });

  it('keeps the English storyboard aligned with the capture scene registry and fixture', async () => {
    const storyboard = await readStoryboard();
    expect(storyboard.locale).toBe('en');
    expect(storyboard.fixture).toMatch(/ACTIVE/);
    expect(storyboard.scenes.map((scene) => scene.id)).toEqual(
      MERCHANT_VIDEO_SCENES.map((scene) => scene.id),
    );
    expect(storyboard.scenes.map((scene) => scene.capture)).toEqual(
      MERCHANT_VIDEO_SCENES.map((scene) => scene.capture),
    );
  });

  it('plans deterministic output names and exposes the fixture requirement', () => {
    const plan = buildMerchantVideoPlan('en');
    expect(path.basename(plan[0]!.outputPath)).toBe('01-shopify-launch.webm');
    expect(path.basename(plan.at(-1)!.outputPath)).toBe('15-closing.webm');
    expect(
      plan.every(
        (row) => row.fixtureRequirement === MERCHANT_VIDEO_FIXTURE_REQUIREMENT,
      ),
    ).toBe(true);
  });
});
