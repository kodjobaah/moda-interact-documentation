#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { authenticateAdmin } from './auth/moda-admin.js';
import { authenticateShopify } from './auth/shopify.js';
import { booleanOption, parseCliArgs, stringOption } from './args.js';
import { captureScreenshot, writeCaptureReport, type CaptureResult } from './capture/runner.js';
import { DOCUMENTATION_LOCALES, parseLocale } from './locales.js';
import { loadScreenshotManifest, type ManualKind } from './manifest.js';
import { assertCompleteCoverage, buildCapturePlan } from './plan.js';
import {
  buildMerchantVideoPlan,
  captureMerchantDemo,
} from './video/merchant-demo.js';
import {
  buildMerchantOnboardingPlan,
  captureMerchantOnboarding,
} from './video/merchant-onboarding.js';
import {
  buildMerchantOnboardingVoiceoverPlan,
  generateMerchantOnboardingVoiceover,
  renderMerchantOnboardingNarratedVideo,
} from './video/merchant-onboarding-voiceover.js';
import {
  generateMerchantDemoVoiceover,
  renderMerchantDemoNarratedVideo,
} from './video/merchant-demo-voiceover.js';

function printUsage(): void {
  console.log(`Moda Interact documentation capture CLI\n\nCommands:\n  plan [--locale=en] [--manual=admin|merchant] [--id=<screenshot-id>]\n  auth-shopify\n  auth-admin\n  capture-merchant [--locale=en] [--id=<screenshot-id>] [--overwrite] [--headed]\n  capture-admin [--locale=en] [--id=<screenshot-id>] [--overwrite] [--headed]\n  capture-locale --locale=<locale> [--overwrite] [--headed]\n  capture-all-locales [--overwrite] [--headed]\n  video-merchant-plan [--language=en] [--scene=<scene-id>]\n  video-merchant-capture [--language=en] [--scene=<scene-id>] [--overwrite] [--headed]\n  video-merchant-narrate [--language=en] [--overwrite]\n  video-merchant-render [--language=en] [--overwrite]\n  video-merchant-onboarding-plan [--language=en]\n  video-merchant-onboarding-capture [--language=en] --confirm-mutation [--overwrite] [--headed]\n  video-merchant-onboarding-narrate [--language=en] [--overwrite]\n  video-merchant-onboarding-render [--language=en] [--overwrite]\n`);
}

function parseManual(value?: string): ManualKind | undefined {
  if (!value) return undefined;
  if (value !== 'admin' && value !== 'merchant') {
    throw new Error(`Invalid manual '${value}'. Expected admin or merchant.`);
  }
  return value;
}

async function printPlan(options: Record<string, string | boolean>): Promise<void> {
  const manifest = await loadScreenshotManifest();
  const locale = parseLocale(stringOption(options, 'locale'));
  const manual = parseManual(stringOption(options, 'manual'));
  const screenshotId = stringOption(options, 'id');
  const filters: { manual?: ManualKind; screenshotId?: string } = {};
  if (manual) filters.manual = manual;
  if (screenshotId) filters.screenshotId = screenshotId;
  const rows = await buildCapturePlan(manifest, locale, filters);

  if (rows.length === 0) {
    throw new Error('No manifest entries matched the requested filters.');
  }

  console.table(
    rows.map((row) => ({
      manual: row.manual,
      screenshotId: row.screenshotId,
      configured: row.configured ? 'yes' : 'NO',
      requirement: row.requirement,
      locale: row.localeSupported ? locale : 'unsupported',
      existing: row.outputExists ? 'yes' : 'no',
      file: path.basename(row.outputPath),
    })),
  );

  const missing = rows.filter((row) => !row.configured);
  const unsupported = rows.filter((row) => row.configured && !row.localeSupported);
  console.log(`Manifest rows: ${rows.length}`);
  console.log(`Configured: ${rows.length - missing.length}`);
  console.log(`Missing capture targets: ${missing.length}`);
  console.log(`Configured but unsupported for ${locale}: ${unsupported.length}`);

  if (missing.length > 0) {
    console.log('\nMissing target IDs:');
    for (const row of missing) console.log(`  - ${row.screenshotId}`);
  }
}


function requestedVideoLocale(options: Record<string, string | boolean>) {
  return parseLocale(
    stringOption(options, 'language') ?? stringOption(options, 'locale'),
  );
}

async function printMerchantVideoPlan(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  if (locale !== 'en') {
    throw new Error(
      `VIDEO-001 plans English only. Requested locale '${locale}' is not supported yet.`,
    );
  }
  const sceneId = stringOption(options, 'scene');
  const rows = buildMerchantVideoPlan(locale, sceneId);
  const display = await Promise.all(
    rows.map(async ({ scene, outputPath, requiredEnvironment }) => ({
      order: scene.order,
      scene: scene.id,
      title: scene.title,
      capture: scene.capture,
      existing: await fs
        .access(outputPath)
        .then(() => 'yes')
        .catch(() => 'no'),
      requires: requiredEnvironment.join(', '),
      file: path.relative(process.cwd(), outputPath),
    })),
  );
  console.table(display);
  if (rows[0]) {
    console.log(`\nMerchant fixture requirement: ${rows[0].fixtureRequirement}`);
  }

  const deferred = rows.filter(({ scene }) => scene.capture === 'deferred');
  if (deferred.length) {
    console.log('\nDeferred by the VIDEO-001 read-only policy:');
    for (const { scene } of deferred) {
      console.log(`  - ${scene.id}: ${scene.deferredReason ?? 'deferred'}`);
    }
  }
}

async function printMerchantOnboardingPlan(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  if (locale !== 'en') {
    throw new Error(
      `The onboarding video currently supports English only. Requested locale '${locale}'.`,
    );
  }
  const plan = buildMerchantOnboardingPlan(locale);
  console.table([{
    video: 'onboarding-free-plan',
    locale,
    freePlan: plan.freePlanName,
    storeCategory: plan.storeCategory ?? '(current suggested/default category)',
    storeItemTypes: plan.storeItemTypes?.join(' | ') ?? '(current suggested/default item types)',
    mutatesState: 'YES - one-shot fresh store only',
    file: path.relative(process.cwd(), plan.outputPath),
  }]);
  console.log(`\nFixture requirement: ${plan.fixtureRequirement}`);
  console.log(
    'This flow persists Store Category and item-type selections and selects the Shopify-hosted plan. ' +
      'Capture requires an explicit --confirm-mutation flag.',
  );
}

async function captureMerchantOnboardingVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const result = await captureMerchantOnboarding({
    locale,
    overwrite: booleanOption(options, 'overwrite'),
    headed: booleanOption(options, 'headed'),
    confirmMutation: booleanOption(options, 'confirm-mutation'),
  });
  console.log(`captured: onboarding-free-plan -> ${result.outputPath}`);
  console.log(`Capture report: ${result.reportPath}`);
}


async function narrateMerchantOnboardingVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const plan = await buildMerchantOnboardingVoiceoverPlan(locale);
  console.log(`Kokoro voice: ${plan.voice} (${plan.language}, speed ${plan.speed})`);
  console.log(`Source video: ${path.relative(process.cwd(), plan.sourceVideo)}`);
  const result = await generateMerchantOnboardingVoiceover({
    locale,
    overwrite: booleanOption(options, 'overwrite'),
  });
  console.log(`Narration: ${path.relative(process.cwd(), result.narrationPath)}`);
  console.log(`Subtitles: ${path.relative(process.cwd(), result.subtitlesPath)}`);
  console.log(`Voiceover report: ${path.relative(process.cwd(), result.reportPath)}`);
}

async function renderMerchantOnboardingVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const result = await renderMerchantOnboardingNarratedVideo({
    locale,
    overwrite: booleanOption(options, 'overwrite'),
  });
  console.log(`Rendered: ${path.relative(process.cwd(), result.finalVideoPath)}`);
  console.log(`YouTube captions: ${path.relative(process.cwd(), result.subtitlesPath)}`);
}

async function narrateMerchantVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const result = await generateMerchantDemoVoiceover({
    locale,
    overwrite: booleanOption(options, 'overwrite'),
  });
  console.log(`Main narration voice: ${result.voice} (${result.language}, speed ${result.speed})`);
  console.log(`Subtitles: ${path.relative(process.cwd(), result.subtitlesPath)}`);
  console.log(`Voiceover report: artifacts/videos/${locale}/main-voiceover/voiceover-report.json`);
}

async function renderMerchantVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const result = await renderMerchantDemoNarratedVideo({
    locale,
    overwrite: booleanOption(options, 'overwrite'),
  });
  console.log(`Rendered: ${path.relative(process.cwd(), result.finalVideoPath)}`);
  console.log(`YouTube captions: ${path.relative(process.cwd(), result.subtitlesPath)}`);
  console.log(`Render report: ${path.relative(process.cwd(), result.renderReportPath)}`);
}

async function captureMerchantVideo(
  options: Record<string, string | boolean>,
): Promise<void> {
  const locale = requestedVideoLocale(options);
  const sceneId = stringOption(options, 'scene');
  const results = await captureMerchantDemo({
    locale,
    ...(sceneId ? { sceneId } : {}),
    overwrite: booleanOption(options, 'overwrite'),
    headed: booleanOption(options, 'headed'),
  });

  for (const result of results) {
    const suffix = result.outputPath ? ` -> ${result.outputPath}` : '';
    console.log(`${result.status}: ${result.sceneId}${suffix}`);
    if (result.reason) console.log(`  ${result.reason}`);
  }

  const failed = results.filter((result) => result.status === 'failed');
  if (failed.length) {
    throw new Error(
      `${failed.length} merchant video scene${failed.length === 1 ? '' : 's'} failed. ` +
        `Successful scene clips were kept; review artifacts/videos/${locale}/capture-report.json and rerun only the affected --scene with --overwrite.`,
    );
  }
}

async function captureSelection(options: {
  manual: ManualKind | undefined;
  locale: ReturnType<typeof parseLocale>;
  screenshotId: string | undefined;
  overwrite: boolean;
  headed: boolean;
  requireCompleteCoverage: boolean;
}): Promise<CaptureResult[]> {
  const manifest = await loadScreenshotManifest();
  const filters: { manual?: ManualKind; screenshotId?: string } = {};
  if (options.manual) filters.manual = options.manual;
  if (options.screenshotId) filters.screenshotId = options.screenshotId;
  const rows = await buildCapturePlan(manifest, options.locale, filters);

  if (rows.length === 0) throw new Error('No manifest entries matched the requested capture.');
  if (options.requireCompleteCoverage) assertCompleteCoverage(rows);

  const missingRequested = rows.filter((row) => !row.configured);
  if (missingRequested.length > 0) {
    throw new Error(
      `Requested screenshot target is not wired: ${missingRequested
        .map((row) => row.screenshotId)
        .join(', ')}`,
    );
  }

  const results: CaptureResult[] = [];
  for (const row of rows) {
    const result = await captureScreenshot({
      entry: row,
      locale: options.locale,
      overwrite: options.overwrite,
      headed: options.headed,
    });
    results.push(result);
    const suffix = result.outputPath ? ` -> ${result.outputPath}` : '';
    console.log(`${result.status}: ${result.screenshotId} [${result.locale}]${suffix}`);
  }

  const report = await writeCaptureReport(results);
  console.log(`Capture report: ${report}`);
  return results;
}

async function main(): Promise<void> {
  const { command, options } = parseCliArgs(process.argv.slice(2));
  const overwrite = booleanOption(options, 'overwrite');
  const headed = booleanOption(options, 'headed');

  switch (command) {
    case 'plan':
      await printPlan(options);
      return;
    case 'auth-shopify':
      await authenticateShopify();
      return;
    case 'auth-admin':
      await authenticateAdmin();
      return;
    case 'capture-merchant':
      await captureSelection({
        manual: 'merchant',
        locale: parseLocale(stringOption(options, 'locale')),
        screenshotId: stringOption(options, 'id'),
        overwrite,
        headed,
        requireCompleteCoverage: false,
      });
      return;
    case 'capture-admin':
      await captureSelection({
        manual: 'admin',
        locale: parseLocale(stringOption(options, 'locale')),
        screenshotId: stringOption(options, 'id'),
        overwrite,
        headed,
        requireCompleteCoverage: false,
      });
      return;
    case 'capture-locale': {
      const locale = parseLocale(stringOption(options, 'locale'));
      await captureSelection({
        manual: undefined,
        locale,
        screenshotId: undefined,
        overwrite,
        headed,
        requireCompleteCoverage: true,
      });
      return;
    }
    case 'capture-all-locales':
      for (const locale of DOCUMENTATION_LOCALES) {
        console.log(`\n=== Capturing locale ${locale} ===`);
        await captureSelection({
          manual: undefined,
          locale,
          screenshotId: undefined,
          overwrite,
          headed,
          requireCompleteCoverage: true,
        });
      }
      return;
    case 'video-merchant-plan':
      await printMerchantVideoPlan(options);
      return;
    case 'video-merchant-capture':
      await captureMerchantVideo(options);
      return;
    case 'video-merchant-narrate':
      await narrateMerchantVideo(options);
      return;
    case 'video-merchant-render':
      await renderMerchantVideo(options);
      return;
    case 'video-merchant-onboarding-plan':
      await printMerchantOnboardingPlan(options);
      return;
    case 'video-merchant-onboarding-capture':
      await captureMerchantOnboardingVideo(options);
      return;
    case 'video-merchant-onboarding-narrate':
      await narrateMerchantOnboardingVideo(options);
      return;
    case 'video-merchant-onboarding-render':
      await renderMerchantOnboardingVideo(options);
      return;
    default:
      printUsage();
      if (command) throw new Error(`Unknown command '${command}'.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nERROR: ${message}`);
  process.exitCode = 1;
});
