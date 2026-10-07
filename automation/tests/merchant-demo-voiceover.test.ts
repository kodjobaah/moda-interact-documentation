import { describe, expect, it } from 'vitest';
import { MERCHANT_VIDEO_SCENES } from '../config/merchant-video-scenes.js';
import {
  editedDurationForSegments,
  readMerchantDemoVoiceoverConfig,
} from '../src/video/merchant-demo-voiceover.js';

describe('merchant demo voiceover', () => {
  it('keeps narration aligned with enabled merchant scenes and excludes deferred Support', async () => {
    const config = await readMerchantDemoVoiceoverConfig('en');
    const expected = MERCHANT_VIDEO_SCENES
      .filter((scene) => scene.capture === 'enabled')
      .map((scene) => scene.id);
    expect(config.scenes.map((scene) => scene.id)).toEqual(expected);
    expect(config.scenes.some((scene) => scene.id === 'support')).toBe(false);
  });

  it('describes Moda AI discount selection as an available production behaviour', async () => {
    const config = await readMerchantDemoVoiceoverConfig('en');
    const settings = config.scenes.find((scene) => scene.id === 'recovery-settings');
    const text = settings?.cues.map((cue) => cue.text).join(' ') ?? '';
    expect(text).toMatch(/let Moda AI choose the best applicable discount/i);
    expect(text).not.toMatch(/future capability|upcoming/i);
  });

  it('documents live catalogue and merchant-managed knowledge capabilities without toggling them', async () => {
    const config = await readMerchantDemoVoiceoverConfig('en');
    const features = config.scenes.find((scene) => scene.id === 'features');
    const text = features?.cues.map((cue) => cue.text).join(' ') ?? '';
    expect(text).toMatch(/Product Search adds live Shopify catalogue information/i);
    expect(text).toMatch(/Merchant Knowledge adds merchant-managed context/i);
  });

  it('supports deterministic removal of reviewed internal loading gaps', () => {
    expect(
      editedDurationForSegments(8.733, [
        { startSeconds: 0, endSeconds: 3.75 },
        { startSeconds: 5.65, endSeconds: null },
      ]),
    ).toBeCloseTo(6.833, 3);
    expect(
      editedDurationForSegments(18.067, [
        { startSeconds: 0, endSeconds: 7.65 },
        { startSeconds: 10.75, endSeconds: 13.8 },
        { startSeconds: 15.75, endSeconds: null },
      ]),
    ).toBeCloseTo(13.017, 3);
  });

  it('keeps main-walkthrough narration production-facing', async () => {
    const config = await readMerchantDemoVoiceoverConfig('en');
    const text = config.scenes
      .flatMap((scene) => scene.cues)
      .map((cue) => cue.text)
      .join(' ');
    expect(text).not.toMatch(/future capability/i);
    expect(text).not.toMatch(/not available yet/i);
  });
});
