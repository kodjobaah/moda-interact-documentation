/**
 * Deterministic visual choreography for the merchant-facing YouTube demo.
 *
 * VIDEO-001 remains read-only. The scene manifest exposes route navigation,
 * scrolling, timed holds, native <details> disclosure opening and a bounded set
 * of reviewed demo actions. `demoAction` is intentionally an enum rather than a
 * generic click/submit primitive so each action can enforce its own safety
 * invariant in the runner.
 */
export type MerchantVideoSceneId =
  | 'shopify-launch'
  | 'overview'
  | 'recoveries'
  | 'recovery-detail'
  | 'billing'
  | 'billing-usage-history'
  | 'billing-purchased-credits'
  | 'billing-change-plan'
  | 'promotions'
  | 'recovery-settings'
  | 'features'
  | 'store-profile'
  | 'merchant-knowledge'
  | 'support'
  | 'closing';

export type MerchantVideoEntry = 'shopify-admin' | 'merchant-app';

export type MerchantVideoDemoAction =
  | 'open-demo-recovery'
  | 'open-usage-history'
  | 'open-demo-usage-recovery'
  | 'open-purchased-credit-history'
  | 'show-plan-change-panel'
  | 'open-shopify-plan-selector'
  | 'return-from-shopify-plan-selector'
  | 'show-fixed-discount-example'
  | 'show-ai-discount-option'
  | 'show-follow-up-example'
  | 'show-knowledge-web-pricing'
  | 'show-knowledge-upload-pricing';

export type MerchantVideoStep =
  | {
      type: 'hold';
      durationMs: number;
      description: string;
    }
  | {
      type: 'scrollTo';
      locator: string;
      description: string;
    }
  | {
      type: 'openDisclosure';
      locator: string;
      description: string;
    }
  | {
      type: 'demoAction';
      action: MerchantVideoDemoAction;
      description: string;
    };

export type MerchantVideoScene = {
  id: MerchantVideoSceneId;
  order: number;
  title: string;
  entry: MerchantVideoEntry;
  /**
   * Merchant route selected through the embedded Shopify app. `/app` means the
   * landing/overview route.
   */
  route: string;
  readyLocator: string;
  steps: readonly MerchantVideoStep[];
  privacySelectors?: readonly string[];
  capture: 'enabled' | 'deferred';
  deferredReason?: string;
};

const hold = (durationMs: number, description: string): MerchantVideoStep => ({
  type: 'hold',
  durationMs,
  description,
});

const scrollTo = (locator: string, description: string): MerchantVideoStep => ({
  type: 'scrollTo',
  locator,
  description,
});

const openDisclosure = (
  locator: string,
  description: string,
): MerchantVideoStep => ({
  type: 'openDisclosure',
  locator,
  description,
});

const demoAction = (
  action: MerchantVideoDemoAction,
  description: string,
): MerchantVideoStep => ({
  type: 'demoAction',
  action,
  description,
});

const STORE_PROFILE_DISCLOSURE =
  '.moda-recovery-context-list > details:nth-of-type(1)';
const MERCHANT_KNOWLEDGE_DISCLOSURE =
  '.moda-recovery-context-list > details:nth-of-type(2)';
const MERCHANT_KNOWLEDGE_WEB_DISCLOSURE =
  'section[aria-label="Merchant Knowledge"] .moda-merchant-knowledge-add-grid > details:nth-of-type(1)';
const MERCHANT_KNOWLEDGE_UPLOAD_DISCLOSURE =
  'section[aria-label="Merchant Knowledge"] .moda-merchant-knowledge-add-grid > details:nth-of-type(2)';

export const MERCHANT_VIDEO_SCENES: readonly MerchantVideoScene[] = [
  {
    id: 'shopify-launch',
    order: 1,
    title: 'Launch Moda Interact from Shopify Admin',
    entry: 'shopify-admin',
    route: '/app',
    readyLocator: 'section[aria-label="Recovery overview"]',
    steps: [hold(2200, 'hold on the embedded overview after launch')],
    capture: 'enabled',
  },
  {
    id: 'overview',
    order: 2,
    title: 'Recovery overview',
    entry: 'merchant-app',
    route: '/app',
    readyLocator: 'section[aria-label="Recovery overview"]',
    steps: [
      hold(1700, 'show recovery performance and recent recoveries'),
      scrollTo('#overview-capacity', 'show current recovery capacity'),
      hold(1800, 'hold on current plan, included allowance and purchased credits'),
      scrollTo('section[aria-label="Pending recoveries"]', 'show pending recoveries'),
      hold(1700, 'hold on pending recoveries'),
    ],
    capture: 'enabled',
  },
  {
    id: 'recoveries',
    order: 3,
    title: 'Recovery history',
    entry: 'merchant-app',
    route: '/app/recoveries',
    readyLocator: 'main[aria-labelledby="recoveries-title"]',
    steps: [
      hold(1600, 'show date, customer and status filters'),
      scrollTo('#recoveries-results', 'show recovery results'),
      hold(2300, 'show synthetic recovery statuses, values and start times'),
    ],
    capture: 'enabled',
  },
  {
    id: 'recovery-detail',
    order: 4,
    title: 'Recovery detail and AI conversation',
    entry: 'merchant-app',
    route: '/app/recoveries',
    readyLocator: 'main[aria-labelledby="recoveries-title"]',
    steps: [
      demoAction('open-demo-recovery', 'open the configured synthetic recovery'),
      hold(1700, 'show recovery summary and checkout context'),
      scrollTo('#transcript-heading', 'show the read-only customer and AI conversation'),
      hold(3200, 'hold on conversation, delivery state and milestones'),
      scrollTo('.recovery-detail__context', 'show milestones and related recoveries'),
      hold(2200, 'hold on recovery milestones and related recoveries'),
    ],
    capture: 'enabled',
  },
  {
    id: 'billing',
    order: 5,
    title: 'Billing and recovery capacity',
    entry: 'merchant-app',
    route: '/app/billing/options',
    readyLocator: '.moda-billing-hero',
    steps: [
      hold(1800, 'show current plan and recovery capacity'),
      scrollTo('.moda-purchase-management-card', 'show purchased credit management'),
      hold(1500, 'hold on purchased credit management'),
      scrollTo('.moda-billing-panel, .moda-top-up-panel', 'show available one-time top-ups'),
      hold(2200, 'show top-up packs without purchasing one'),
    ],
    capture: 'enabled',
  },
  {
    id: 'billing-usage-history',
    order: 6,
    title: 'Usage history and linked recovery evidence',
    entry: 'merchant-app',
    route: '/app/billing/options',
    readyLocator: '.moda-billing-hero',
    privacySelectors: ['.usage-history__table tbody td:nth-child(3)'],
    steps: [
      demoAction('open-usage-history', 'open the read-only usage history'),
      hold(1500, 'show current and past usage tabs'),
      openDisclosure('.usage-history__periods', 'open billing periods'),
      scrollTo('.usage-history__table', 'show recorded recovery usage'),
      hold(2400, 'hold on current usage rows'),
      demoAction('open-demo-usage-recovery', 'trace the configured synthetic usage row back to its recovery'),
      scrollTo('#transcript-heading', 'show the linked recovery conversation'),
      hold(2600, 'show the audit trail from usage to recovery conversation'),
    ],
    capture: 'enabled',
  },
  {
    id: 'billing-purchased-credits',
    order: 7,
    title: 'Purchased credit history and refund eligibility',
    entry: 'merchant-app',
    route: '/app/billing/options',
    readyLocator: '.moda-billing-hero',
    steps: [
      scrollTo('.moda-purchase-management-card', 'show the purchased credit management card'),
      demoAction('open-purchased-credit-history', 'open purchased credit history without selecting a refund'),
      hold(1700, 'show refund-status filters'),
      scrollTo('.moda-purchase-list', 'show active purchased credit lots'),
      hold(3000, 'show original, reserved and available credit amounts without requesting a refund'),
    ],
    capture: 'enabled',
  },
  {
    id: 'billing-change-plan',
    order: 8,
    title: 'Change plan through Shopify hosted billing',
    entry: 'merchant-app',
    route: '/app/billing/options',
    readyLocator: '.moda-billing-hero',
    steps: [
      demoAction('show-plan-change-panel', 'switch locally from top-ups to the current plan panel'),
      scrollTo('.moda-billing-panel', 'show the current Moda plan'),
      hold(1800, 'hold on the current plan and Shopify approval explanation'),
      demoAction('open-shopify-plan-selector', 'open Shopify hosted plan selection without choosing another plan'),
      hold(3000, 'show Free as current plus the available paid plans'),
      demoAction('return-from-shopify-plan-selector', 'return to Moda Interact through Shopify navigation'),
      hold(1800, 'hold on Recovery overview after returning to the app'),
    ],
    capture: 'enabled',
  },
  {
    id: 'promotions',
    order: 9,
    title: 'Promotions and promotion history',
    entry: 'merchant-app',
    route: '/app/promotions',
    readyLocator: '#promotion-offers',
    steps: [
      hold(1700, 'show the selected promotion and available offers without selecting one'),
      scrollTo('#promotion-offers', 'move through available promotion offers'),
      hold(1800, 'hold on available promotional recovery credits'),
      scrollTo('#promotion-history', 'show the collapsed promotion history'),
      openDisclosure('#promotion-history', 'open promotion history without changing promotion state'),
      scrollTo('.moda-promotion-history-list', 'show historical promotion states'),
      hold(2400, 'show granted, used and remaining promotional credits'),
      scrollTo('.moda-promotion-history-list article:last-child', 'scroll through the rest of promotion history'),
      hold(2000, 'hold on older promotion history'),
    ],
    capture: 'enabled',
  },
  {
    id: 'recovery-settings',
    order: 10,
    title: 'Recovery behaviour',
    entry: 'merchant-app',
    route: '/app/recovery-settings',
    readyLocator: '.moda-recovery-hero',
    steps: [
      hold(1600, 'show effective recovery behaviour'),
      scrollTo('#recovery-offer-heading', 'show recovery offer modes'),
      demoAction('show-fixed-discount-example', 'show a specific Shopify discount and its details without saving'),
      hold(2200, 'hold on the configured Shopify discount example'),
      demoAction('show-ai-discount-option', 'show the Moda AI discount mode without saving'),
      hold(1500, 'hold on the AI-managed discount option'),
      scrollTo('#recovery-start-heading', 'show checkout inactivity delay'),
      hold(1900, 'show the configured recovery start delay'),
      scrollTo('#recovery-follow-up-heading', 'show no-response follow-up controls'),
      demoAction('show-follow-up-example', 'enable a local follow-up example and enter a delay without saving'),
      hold(2600, 'show follow-up timing and recovery-credit explanation'),
    ],
    capture: 'enabled',
  },
  {
    id: 'features',
    order: 11,
    title: 'Conversation features',
    entry: 'merchant-app',
    route: '/app/recovery-settings',
    readyLocator: '#conversation-features',
    steps: [
      scrollTo('#conversation-features', 'show Conversation Features inside Recovery Settings'),
      hold(3200, 'show core Checkout Recovery and AI Conversations plus optional Product Search, Merchant Knowledge and Order Support without toggling them'),
    ],
    capture: 'enabled',
  },
  {
    id: 'store-profile',
    order: 12,
    title: 'Store profile and assistant context',
    entry: 'merchant-app',
    route: '/app/recovery-settings',
    readyLocator: '#store-assistant-context-heading',
    steps: [
      scrollTo(STORE_PROFILE_DISCLOSURE, 'show the Store Profile disclosure'),
      openDisclosure(STORE_PROFILE_DISCLOSURE, 'open Store Profile inside Store & assistant context'),
      openDisclosure('.moda-store-profile-disclosure', 'open category and item-type details without changing them'),
      scrollTo('section[aria-label="Store profile"]', 'show active category and selected item types'),
      hold(3200, 'show how store classification provides business context without saving a change'),
    ],
    capture: 'enabled',
  },
  {
    id: 'merchant-knowledge',
    order: 13,
    title: 'Merchant Knowledge sources',
    entry: 'merchant-app',
    route: '/app/recovery-settings',
    readyLocator: '#store-assistant-context-heading',
    privacySelectors: [
      '.moda-merchant-knowledge-source-copy > h3',
      '.moda-merchant-knowledge-source-copy > p:nth-of-type(2)',
    ],
    steps: [
      scrollTo(MERCHANT_KNOWLEDGE_DISCLOSURE, 'show the Merchant Knowledge disclosure'),
      openDisclosure(MERCHANT_KNOWLEDGE_DISCLOSURE, 'open Merchant Knowledge without changing sources'),
      scrollTo('section[aria-label="Merchant Knowledge"]', 'show plan source allowance and configured source status'),
      hold(2200, 'show source limits and configured knowledge'),
      openDisclosure(MERCHANT_KNOWLEDGE_WEB_DISCLOSURE, 'open the Add web page form'),
      scrollTo('.moda-merchant-knowledge-web-form', 'show website source fields after expansion'),
      demoAction('show-knowledge-web-pricing', 'demonstrate a website purpose selection locally without submitting'),
      hold(2400, 'show website name, purpose, URL and language fields'),
      openDisclosure(MERCHANT_KNOWLEDGE_UPLOAD_DISCLOSURE, 'open the Upload file form'),
      scrollTo('.moda-merchant-knowledge-upload-form', 'show upload fields after expansion'),
      demoAction('show-knowledge-upload-pricing', 'show Product information/Pricing and CSV/XLSX choices locally without uploading'),
      hold(2800, 'show structured knowledge upload fields without choosing or uploading a file'),
    ],
    capture: 'enabled',
  },
  {
    id: 'support',
    order: 14,
    title: 'Merchant support',
    entry: 'merchant-app',
    route: '/app/merchant-support',
    readyLocator: '.merchant-support-compose',
    privacySelectors: ['.merchant-support-message p[dir="auto"]'],
    steps: [hold(2600, 'show merchant support without sending a message')],
    capture: 'deferred',
    deferredReason:
      'The current support route can POST read receipts for unread administrative messages during page load. VIDEO-001 preserves a strict read-only capture contract, so this scene remains in the storyboard but is not recorded automatically yet.',
  },
  {
    id: 'closing',
    order: 15,
    title: 'Return to overview',
    entry: 'merchant-app',
    route: '/app',
    readyLocator: 'section[aria-label="Recovery overview"]',
    steps: [hold(2800, 'hold on the overview for the closing narration')],
    capture: 'enabled',
  },
] as const;

export function findMerchantVideoScene(
  sceneId: string | undefined,
): MerchantVideoScene | undefined {
  if (!sceneId) return undefined;
  return MERCHANT_VIDEO_SCENES.find((scene) => scene.id === sceneId);
}
