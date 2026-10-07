import {
  DEFAULT_CAPTURE_LOCALE,
  DOCUMENTATION_LOCALES,
  type DocumentationLocale,
} from '../config/locales.js';

export { DEFAULT_CAPTURE_LOCALE, DOCUMENTATION_LOCALES };
export type { DocumentationLocale };

export function parseLocale(value?: string): DocumentationLocale {
  const candidate = value ?? process.env.CAPTURE_DEFAULT_LOCALE ?? DEFAULT_CAPTURE_LOCALE;
  if (!DOCUMENTATION_LOCALES.includes(candidate as DocumentationLocale)) {
    throw new Error(
      `Unsupported locale '${candidate}'. Supported locales: ${DOCUMENTATION_LOCALES.join(', ')}`,
    );
  }
  return candidate as DocumentationLocale;
}
