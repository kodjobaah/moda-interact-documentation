import fs from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright";
import {
  CAPTURE_TARGETS,
  type CaptureAction,
  type CaptureTarget,
} from "../../config/capture-targets.js";
import type { DocumentationLocale } from "../locales.js";
import type { ScreenshotManifestEntry } from "../manifest.js";
import { ARTIFACTS_DIR, MANUALS_DIR, resolveRepositoryPath } from "../paths.js";
import { openAdminTarget } from "../targets/admin.js";
import { openMerchantTarget } from "../targets/merchant.js";
import { buildMaskLocators } from "./privacy.js";

export type CaptureRequest = {
  entry: ScreenshotManifestEntry;
  locale: DocumentationLocale;
  overwrite: boolean;
  headed?: boolean;
};

export type CaptureResult = {
  screenshotId: string;
  locale: DocumentationLocale;
  status: "captured" | "skipped-unsupported-locale";
  outputPath?: string;
};

function browserLocale(locale: DocumentationLocale): string {
  return locale;
}

function locatorFor(
  page: Page,
  frame: FrameLocator | undefined,
  selector: string,
): Locator {
  return frame ? frame.locator(selector) : page.locator(selector);
}

async function runAction(
  page: Page,
  frame: FrameLocator | undefined,
  action: CaptureAction,
): Promise<void> {
  const baseLocator = locatorFor(page, frame, action.locator);
  const locator = action.first ? baseLocator.first() : baseLocator;
  switch (action.type) {
    case "click":
      await locator.click({ timeout: action.timeoutMs });
      return;
    case "waitFor":
      await locator.waitFor({ state: "visible", timeout: action.timeoutMs });
      return;
    case "scrollIntoView":
      await locator.scrollIntoViewIfNeeded({ timeout: action.timeoutMs });
      return;
    case "selectOption":
      await locator.selectOption(action.value, { timeout: action.timeoutMs });
      return;
  }
}

const TARGET_READY_TIMEOUT_MS = 30_000;
const ADMIN_AUTH_RETURN_TIMEOUT_MS = 120_000;

function normalizedPathname(url: URL): string {
  const normalized = url.pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function matchesExpectedAdminLocation(current: URL, expected: URL): boolean {
  if (current.origin !== expected.origin) return false;
  if (normalizedPathname(current) !== normalizedPathname(expected)) return false;

  // The target route may depend on query-string state (for example
  // /billing?view=overview). Require every query value from the configured
  // target while allowing the application to append unrelated parameters.
  for (const [key, value] of expected.searchParams.entries()) {
    if (current.searchParams.get(key) !== value) return false;
  }
  return true;
}

function isAdminLoginLocation(current: URL, expectedOrigin: string): boolean {
  return (
    current.origin === expectedOrigin && normalizedPathname(current) === "/login"
  );
}

async function waitForAdminTargetReady(
  page: Page,
  frame: FrameLocator | undefined,
  target: CaptureTarget,
): Promise<void> {
  const baseUrl = process.env.MODA_ADMIN_BASE_URL;
  if (!baseUrl) throw new Error("MODA_ADMIN_BASE_URL is required.");

  const expectedUrl = new URL(target.route ?? "/", baseUrl);
  const readyLocator = locatorFor(page, frame, target.readyLocator);

  const waitForReadyOrDeparture = async (): Promise<"ready" | "departed"> => {
    let current: URL;
    try {
      current = new URL(page.url());
    } catch {
      return "departed";
    }

    if (!matchesExpectedAdminLocation(current, expectedUrl)) return "departed";

    return new Promise<"ready" | "departed">((resolve, reject) => {
      let settled = false;

      const finish = (outcome: "ready" | "departed") => {
        if (settled) return;
        settled = true;
        page.off("framenavigated", onFrameNavigated);
        resolve(outcome);
      };

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        page.off("framenavigated", onFrameNavigated);
        reject(error);
      };

      const onFrameNavigated = () => {
        try {
          if (!matchesExpectedAdminLocation(new URL(page.url()), expectedUrl)) {
            finish("departed");
          }
        } catch {
          finish("departed");
        }
      };

      page.on("framenavigated", onFrameNavigated);
      readyLocator
        .waitFor({ state: "visible", timeout: TARGET_READY_TIMEOUT_MS })
        .then(() => finish("ready"), fail);
    });
  };

  const firstOutcome = await waitForReadyOrDeparture();
  if (firstOutcome === "ready") return;

  let currentUrl = new URL(page.url());
  if (isAdminLoginLocation(currentUrl, expectedUrl.origin)) {
    throw new Error(
      `Saved Moda Admin authentication is no longer valid; the browser was redirected to ${currentUrl.toString()}. ` +
        `Run 'npm run auth:admin' to refresh playwright/.auth/moda-admin.json, then retry this capture.`,
    );
  }

  if (currentUrl.origin !== expectedUrl.origin) {
    try {
      await page.waitForURL(
        (url) =>
          url.origin === expectedUrl.origin &&
          normalizedPathname(url) !== "/login",
        { timeout: ADMIN_AUTH_RETURN_TIMEOUT_MS },
      );
    } catch {
      throw new Error(
        `Moda Admin authentication left the Admin application at ${page.url()} and did not return within ` +
          `${ADMIN_AUTH_RETURN_TIMEOUT_MS / 1000} seconds. Run 'npm run auth:admin' interactively, then retry this capture.`,
      );
    }
  }

  // Auth.js redirects successful sign-in to '/', not back to the documentation
  // target that originally triggered authentication. Re-open the requested
  // route once after the OAuth round-trip. This is also bounded so an
  // authorization redirect (for example, a role restriction) cannot loop.
  await openAdminTarget(page, target.route);

  const secondOutcome = await waitForReadyOrDeparture();
  if (secondOutcome !== "ready") {
    currentUrl = new URL(page.url());
    if (isAdminLoginLocation(currentUrl, expectedUrl.origin)) {
      throw new Error(
        `Moda Admin authentication is still unavailable after recovery; the browser returned to ${currentUrl.toString()}. ` +
          `Run 'npm run auth:admin' and retry this capture.`,
      );
    }
    throw new Error(
      `Moda Admin redirected away from the requested capture route ${expectedUrl.toString()} to ${currentUrl.toString()} ` +
        `after one authentication recovery attempt. Check route/role access rather than retrying indefinitely.`,
    );
  }
}

async function prepareTarget(
  page: Page,
  target: CaptureTarget,
): Promise<FrameLocator | undefined> {
  if (target.manual === "admin") {
    await openAdminTarget(page, target.route);
  } else {
    await openMerchantTarget(page, target.route);
  }

  const frame = target.frameLocator
    ? page.frameLocator(target.frameLocator)
    : undefined;

  if (target.authProfile === "moda-admin") {
    await waitForAdminTargetReady(page, frame, target);
  } else {
    await locatorFor(page, frame, target.readyLocator).waitFor({
      state: "visible",
      timeout: TARGET_READY_TIMEOUT_MS,
    });
  }

  for (const action of target.actions ?? []) {
    try {
      await runAction(page, frame, action);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const description = action.description ?? `${action.type} ${action.locator}`;
      throw new Error(
        `Capture target '${target.screenshotId}' could not ${description}. ` +
          `The documentation environment may be missing the required seeded/read-only state. ` +
          `Original error: ${reason}`,
      );
    }
  }

  return frame;
}

export async function captureScreenshot(
  request: CaptureRequest,
): Promise<CaptureResult> {
  const target = CAPTURE_TARGETS[request.entry.screenshotId];
  if (!target) {
    throw new Error(
      `No capture target configured for '${request.entry.screenshotId}'.`,
    );
  }
  if (target.manual !== request.entry.manual) {
    throw new Error(
      `Capture target '${request.entry.screenshotId}' is configured for ${target.manual}, ` +
        `but the manifest declares ${request.entry.manual}.`,
    );
  }

  if (
    target.supportedLocales &&
    !target.supportedLocales.includes(request.locale)
  ) {
    return {
      screenshotId: request.entry.screenshotId,
      locale: request.locale,
      status: "skipped-unsupported-locale",
    };
  }

  const storagePath =
    target.authProfile === "none"
      ? undefined
      : resolveRepositoryPath(
          target.authProfile === "shopify"
            ? (process.env.SHOPIFY_STORAGE_STATE_PATH ??
                "playwright/.auth/shopify.json")
            : (process.env.MODA_ADMIN_STORAGE_STATE_PATH ??
                "playwright/.auth/moda-admin.json"),
        );

  if (storagePath) {
    await fs.access(storagePath).catch(() => {
      const command =
        target.authProfile === "shopify"
          ? "npm run auth:shopify"
          : "npm run auth:admin";
      throw new Error(
        `Missing authenticated browser state: ${storagePath}. Run '${command}' first.`,
      );
    });
  }

  const outputPath = path.join(
    MANUALS_DIR,
    request.entry.filenamePattern.replace("<locale>", request.locale),
  );

  if (!request.overwrite) {
    const exists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      throw new Error(
        `Screenshot already exists: ${outputPath}. Pass --overwrite to replace it.`,
      );
    }
  }

  const envHeadless =
    (process.env.CAPTURE_HEADLESS ?? "true").toLowerCase() !== "false";
  const browser = await chromium.launch({
    headless: request.headed ? false : envHeadless, // Must be false for interactive state saving
    args: [
          '--disable-blink-features=AutomationControlled', // 🛡️ CRITICAL: Removes the "navigator.webdriver" flag completely
    '--disable-features=WebAuthentication,WebAuthenticationCustomUI',
    ],
  });

  const context = await browser.newContext({
    ...(storagePath ? { storageState: storagePath } : {}),
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: browserLocale(request.locale),
  });
  await context.grantPermissions([]);

  const page = await context.newPage();

  try {
    const frame = await prepareTarget(page, target);

    // The guide capture wrapper launches one process/browser per screenshot.
    // Persist the current Admin session after every successful protected-page
    // readiness check so a renewed Auth.js cookie is available to the next one.
    if (target.authProfile === "moda-admin" && storagePath) {
      await context.storageState({ path: storagePath });
    }

    await page
      .addStyleTag({
        content:
          "*, *::before, *::after { animation: none !important; transition: none !important; }",
      })
      .catch(() => undefined);

    const masks = buildMaskLocators(page, frame, target.masks);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (target.captureMode === "locator") {
      if (!target.captureLocator) {
        throw new Error(
          `Capture target '${target.screenshotId}' uses locator mode but has no captureLocator.`,
        );
      }
      await locatorFor(page, frame, target.captureLocator).screenshot({
        path: outputPath,
        animations: "disabled",
        mask: masks,
      });
    } else {
      // Documentation page captures are intentionally viewport-bounded. A full-page
      // capture can produce images tens of thousands of pixels tall on data-heavy
      // Admin routes. Besides being unreadable when scaled into a manual, those
      // images can exceed XeTeX/graphicx image-dimension arithmetic and make the
      // PDF build fail. Keep page captures deterministic at the configured
      // 1440x1100 viewport; use locator mode for a specific drawer/panel.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: outputPath,
        fullPage: false,
        animations: "disabled",
        mask: masks,
      });
    }

    return {
      screenshotId: request.entry.screenshotId,
      locale: request.locale,
      status: "captured",
      outputPath,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function writeCaptureReport(
  results: CaptureResult[],
): Promise<string> {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(ARTIFACTS_DIR, `capture-${timestamp}.json`);
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), results },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return reportPath;
}
