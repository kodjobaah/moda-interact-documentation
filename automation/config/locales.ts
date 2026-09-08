export const DOCUMENTATION_LOCALES = [
  'zh-Hans', 'zh-Hant', 'cs', 'da', 'nl', 'en', 'fi', 'fr', 'de', 'it',
  'ja', 'ko', 'nb', 'pl', 'pt-BR', 'pt-PT', 'es', 'sv', 'th', 'tr',
] as const;

export type DocumentationLocale = (typeof DOCUMENTATION_LOCALES)[number];

// Current application reality should be represented rather than fabricated.
// Merchant capture may support more locales than Admin capture at a given point.
export const DEFAULT_CAPTURE_LOCALE: DocumentationLocale = 'en';
