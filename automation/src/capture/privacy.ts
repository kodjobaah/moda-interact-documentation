import type { FrameLocator, Locator, Page } from 'playwright';

export function buildMaskLocators(
  page: Page,
  frame: FrameLocator | undefined,
  selectors: readonly string[] | undefined,
): Locator[] {
  if (!selectors) return [];
  return selectors.map((selector) =>
    frame ? frame.locator(selector) : page.locator(selector),
  );
}
