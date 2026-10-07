import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../src/paths.js';
import {
  DEFAULT_KOKORO_LANGUAGE,
  DEFAULT_KOKORO_SPEED,
  DEFAULT_KOKORO_VOICE,
  readMerchantOnboardingVoiceoverConfig,
} from '../src/video/merchant-onboarding-voiceover.js';

const ORIGINAL_VOICE = process.env.VOICEOVER_VOICE;
const ORIGINAL_LANGUAGE = process.env.VOICEOVER_LANGUAGE;
const ORIGINAL_SPEED = process.env.VOICEOVER_SPEED;
const ORIGINAL_SOURCE = process.env.VIDEO_ONBOARDING_SOURCE;

afterEach(() => {
  if (ORIGINAL_VOICE === undefined) delete process.env.VOICEOVER_VOICE;
  else process.env.VOICEOVER_VOICE = ORIGINAL_VOICE;
  if (ORIGINAL_LANGUAGE === undefined) delete process.env.VOICEOVER_LANGUAGE;
  else process.env.VOICEOVER_LANGUAGE = ORIGINAL_LANGUAGE;
  if (ORIGINAL_SPEED === undefined) delete process.env.VOICEOVER_SPEED;
  else process.env.VOICEOVER_SPEED = ORIGINAL_SPEED;
  if (ORIGINAL_SOURCE === undefined) delete process.env.VIDEO_ONBOARDING_SOURCE;
  else process.env.VIDEO_ONBOARDING_SOURCE = ORIGINAL_SOURCE;
});

describe('merchant onboarding Kokoro voiceover contract', () => {
  it('uses the intended local British English defaults', () => {
    expect(DEFAULT_KOKORO_VOICE).toBe('bf_emma');
    expect(DEFAULT_KOKORO_LANGUAGE).toBe('en-gb');
    expect(DEFAULT_KOKORO_SPEED).toBeCloseTo(1.08);
  });

  it('keeps a strictly increasing checked-in English cue timeline', async () => {
    const config = await readMerchantOnboardingVoiceoverConfig('en');
    expect(config.locale).toBe('en');
    expect(config.voice).toBe('bf_emma');
    expect(config.cues.map((cue) => cue.id)).toEqual([
      'intro',
      'store-context',
      'product-explanation',
      'shopify-plan',
      'complete',
    ]);
    expect(config.cues.every((cue, index) => index === 0 || cue.startSeconds > config.cues[index - 1]!.startSeconds)).toBe(true);
  });

  it('stores voiceover source text in a normal JSON file for later translation', async () => {
    const filePath = path.join(
      REPOSITORY_ROOT,
      'videos/merchant-onboarding/voiceover.en.json',
    );
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      cues: Array<{ text: string }>;
    };
    expect(parsed.cues.length).toBeGreaterThan(0);
    expect(parsed.cues.every((cue) => cue.text.trim().length > 0)).toBe(true);
  });
});
