/**
 * Browser mechanics for screenshots declared in manuals/screenshot-manifest.csv.
 *
 * Keep this file language-neutral except for selectors that are unavoidable in the
 * current Admin implementation. Admin currently ships an English-only catalogue,
 * so Admin targets explicitly support only `en` until the application itself is
 * localised.
 */
import type { DocumentationLocale } from './locales.js';

export type CaptureMode = 'page' | 'locator';
export type AuthProfile = 'none' | 'shopify' | 'moda-admin';

export type CaptureAction =
  | {
      type: 'click' | 'waitFor' | 'scrollIntoView';
      locator: string;
      first?: boolean;
      timeoutMs?: number;
      description?: string;
    }
  | {
      type: 'selectOption';
      locator: string;
      value: string;
      first?: boolean;
      timeoutMs?: number;
      description?: string;
    };

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
  actions?: CaptureAction[];
  supportedLocales?: readonly DocumentationLocale[];
  notes?: string;
};

const ADMIN_LOCALES = ['en'] as const satisfies readonly DocumentationLocale[];

function click(
  locator: string,
  description: string,
  first = true,
): CaptureAction {
  return { type: 'click', locator, first, description };
}

function waitFor(locator: string, description: string, first = true): CaptureAction {
  return {
    type: 'waitFor',
    locator,
    first,
    timeoutMs: 15_000,
    description,
  };
}

const OPEN_FIRST_TENANT: CaptureAction[] = [
  click(
    'main table tbody tr:first-child td:first-child a',
    'open the first tenant in the directory',
  ),
  waitFor(
    'a[href*="tab=recovery"]',
    'wait for the selected tenant administration tabs',
  ),
];

const OPEN_RECOVERY_LOGS: CaptureAction[] = [
  ...OPEN_FIRST_TENANT,
  click('a[href*="tab=logs"]', 'open the tenant Recovery Logs tab'),
  waitFor('input[name="customerSearch"]', 'wait for the recovery customer list'),
];

const OPEN_FIRST_RECOVERY: CaptureAction[] = [
  ...OPEN_RECOVERY_LOGS,
  click('a[href*="customerId="]', 'open the first customer with recovery history'),
  waitFor('a[href*="recoveryId="]', 'wait for the customer recovery list'),
  click('a[href*="recoveryId="]', 'open the first recovery'),
  waitFor(
    'aside:has(a[href*="drawerTab=cart"])',
    'wait for the recovery detail drawer',
  ),
];

const OPEN_FIRST_SUPPORT_THREAD: CaptureAction[] = [
  click('a[href*="thread="]', 'open the first merchant support thread'),
  waitFor(
    'section[aria-labelledby="support-thread-heading"]',
    'wait for the merchant support thread',
  ),
];

const OPEN_FIRST_QUEUE: CaptureAction[] = [
  waitFor(
    'section[aria-labelledby="queue-monitor-title"] tbody button',
    'wait for at least one queue in the operational snapshot',
  ),
  click(
    'section[aria-labelledby="queue-monitor-title"] tbody button',
    'open the first queue',
  ),
  waitFor(
    'aside[data-testid="queue-details-drawer"]',
    'wait for the queue details drawer',
  ),
];

export const CAPTURE_TARGETS: Record<string, CaptureTarget> = {
  'admin-login': {
    screenshotId: 'admin-login',
    manual: 'admin',
    authProfile: 'none',
    captureMode: 'locator',
    route: '/login',
    readyLocator: 'main section',
    captureLocator: 'main section',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Unauthenticated capture. If development auth bypass is enabled the route will redirect and this target should fail rather than fabricate a login screen.',
  },
  'admin-tenant-directory': {
    screenshotId: 'admin-tenant-directory',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'h1',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-tenant-search': {
    screenshotId: 'admin-tenant-search',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/',
    readyLocator: 'input[name="q"]',
    captureLocator: 'main',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Documents the directory search control without entering tenant-specific search text.',
  },
  'admin-tenant-administration': {
    screenshotId: 'admin-tenant-administration',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'h1',
    actions: OPEN_FIRST_TENANT,
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires at least one seeded/test tenant. Capture is read-only and never submits the lifecycle form.',
  },
  'admin-tenant-recovery-settings': {
    screenshotId: 'admin-tenant-recovery-settings',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'h1',
    actions: [
      ...OPEN_FIRST_TENANT,
      click('a[href*="tab=recovery"]', 'open the Recovery Settings tab'),
      waitFor('h2', 'wait for recovery policy content'),
    ],
    supportedLocales: ADMIN_LOCALES,
    notes: 'Does not request a discount catalogue sync or save an override.',
  },
  'admin-tenant-billing': {
    screenshotId: 'admin-tenant-billing',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'h1',
    actions: [
      ...OPEN_FIRST_TENANT,
      click('a[href*="tab=billing"]', 'open the tenant Billing tab'),
      waitFor('nav', 'wait for tenant billing navigation'),
    ],
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-recovery-logs-customers': {
    screenshotId: 'admin-recovery-logs-customers',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/',
    readyLocator: 'h1',
    actions: OPEN_RECOVERY_LOGS,
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires at least one seeded/test tenant. Use synthetic customer data in the documentation environment.',
  },
  'admin-recovery-detail-conversation': {
    screenshotId: 'admin-recovery-detail-conversation',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/',
    readyLocator: 'h1',
    actions: OPEN_FIRST_RECOVERY,
    captureLocator: 'aside:has(a[href*="drawerTab=cart"])',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires a seeded customer with at least one recovery. Use synthetic customer/message data.',
  },
  'admin-recovery-detail-cart': {
    screenshotId: 'admin-recovery-detail-cart',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/',
    readyLocator: 'h1',
    actions: [
      ...OPEN_FIRST_RECOVERY,
      click('a[href*="drawerTab=cart"]', 'open Cart Details'),
      waitFor('aside:has(a[href*="drawerTab=lifecycle"])', 'wait for Cart Details'),
    ],
    captureLocator: 'aside:has(a[href*="drawerTab=cart"])',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-recovery-detail-lifecycle': {
    screenshotId: 'admin-recovery-detail-lifecycle',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/',
    readyLocator: 'h1',
    actions: [
      ...OPEN_FIRST_RECOVERY,
      click('a[href*="drawerTab=lifecycle"]', 'open Lifecycle'),
      waitFor('aside:has(a[href*="drawerTab=conversation"])', 'wait for Lifecycle'),
    ],
    captureLocator: 'aside:has(a[href*="drawerTab=lifecycle"])',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-merchant-messages': {
    screenshotId: 'admin-merchant-messages',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/merchant-support',
    readyLocator: 'section[aria-labelledby="pending-support-heading"]',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-support-thread': {
    screenshotId: 'admin-support-thread',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/merchant-support',
    readyLocator: 'section[aria-labelledby="pending-support-heading"]',
    actions: OPEN_FIRST_SUPPORT_THREAD,
    captureLocator: 'section[aria-labelledby="support-thread-heading"]',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Never clicks Take, Release, Reassign or Send message.',
  },
  'admin-support-translation': {
    screenshotId: 'admin-support-translation',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/merchant-support',
    readyLocator: 'section[aria-labelledby="pending-support-heading"]',
    actions: OPEN_FIRST_SUPPORT_THREAD,
    captureLocator: 'section[aria-labelledby="support-thread-heading"]',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Captures existing translation controls only; never requests/retries a translation.',
  },
  'admin-billing-overview': {
    screenshotId: 'admin-billing-overview',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=overview',
    readyLocator: 'section[aria-label="Billing overview"]',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Waits for the overview metrics themselves rather than a generic navigation landmark.',
  },
  'admin-billing-plans': {
    screenshotId: 'admin-billing-plans',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=plans&section=pricing',
    readyLocator: 'nav[aria-label="Billing plan administration"]',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-billing-features': {
    screenshotId: 'admin-billing-features',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=plans&section=features',
    readyLocator: 'nav[aria-label="Billing plan administration"]',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-billing-recovery-packs': {
    screenshotId: 'admin-billing-recovery-packs',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=packs',
    readyLocator: 'main',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-billing-refunds': {
    screenshotId: 'admin-billing-refunds',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=refunds',
    readyLocator: 'main',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-billing-events': {
    screenshotId: 'admin-billing-events',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=events',
    readyLocator: 'main',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-billing-unmapped': {
    screenshotId: 'admin-billing-unmapped',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/billing?view=unmapped',
    readyLocator: 'main',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-promotions': {
    screenshotId: 'admin-promotions',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/promotions',
    readyLocator: 'h1',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires a SUPER_ADMIN session because the route redirects other roles.',
  },
  'admin-promotion-create': {
    screenshotId: 'admin-promotion-create',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/promotions?drawer=create',
    readyLocator: 'aside:has(h2)',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Opens the creation drawer by URL but does not submit the form. Requires SUPER_ADMIN.',
  },
  'admin-platform-policy': {
    screenshotId: 'admin-platform-policy',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/system-controls/platform-policy',
    readyLocator: 'h1',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Read-only capture; never submits platform billing policy changes.',
  },
  'admin-background-runtime': {
    screenshotId: 'admin-background-runtime',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/system-controls/background-runtime',
    readyLocator: 'h1',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Read-only capture; never submits runtime control changes.',
  },
  'admin-observability': {
    screenshotId: 'admin-observability',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/observability',
    readyLocator: 'h1',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-shopify-queues': {
    screenshotId: 'admin-shopify-queues',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'page',
    route: '/observability/queues',
    readyLocator: 'section[aria-labelledby="queue-monitor-title"]',
    supportedLocales: ADMIN_LOCALES,
  },
  'admin-queue-details': {
    screenshotId: 'admin-queue-details',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/observability/queues',
    readyLocator: 'section[aria-labelledby="queue-monitor-title"]',
    actions: OPEN_FIRST_QUEUE,
    captureLocator: 'aside[data-testid="queue-details-drawer"]',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires a successful queue snapshot containing at least one queue.',
  },
  'admin-queue-job-details': {
    screenshotId: 'admin-queue-job-details',
    manual: 'admin',
    authProfile: 'moda-admin',
    captureMode: 'locator',
    route: '/observability/queues',
    readyLocator: 'section[aria-labelledby="queue-monitor-title"]',
    actions: [
      ...OPEN_FIRST_QUEUE,
      waitFor(
        'aside[data-testid="queue-details-drawer"] tbody button',
        'wait for at least one job in the selected queue/status',
      ),
      click(
        'aside[data-testid="queue-details-drawer"] tbody button',
        'open the first available job',
      ),
      waitFor(
        'aside[data-testid="queue-details-drawer"]',
        'wait for the selected job diagnostic view',
      ),
    ],
    captureLocator: 'aside[data-testid="queue-details-drawer"]',
    supportedLocales: ADMIN_LOCALES,
    notes: 'Requires an existing job in the default queue job status. The capture flow never retries, deletes, promotes, pauses or drains jobs.',
  },
};
