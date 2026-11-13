import { describe, expect, it } from 'vitest';
import {
  VIDEO_CAPTURE_CSS_HEIGHT,
  VIDEO_CAPTURE_CSS_WIDTH,
  VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
  VIDEO_FINAL_CRF,
  VIDEO_FINAL_PRESET,
  VIDEO_INTERMEDIATE_CRF,
  VIDEO_OUTPUT_HEIGHT,
  VIDEO_OUTPUT_WIDTH,
  assertVideoQualityProfile,
  videoQualityReport,
} from '../src/video/video-quality.js';

describe('video quality profile', () => {
  it('renders the tighter CSS viewport onto a true 3840x2160 pixel surface', () => {
    expect(VIDEO_CAPTURE_CSS_WIDTH).toBe(1600);
    expect(VIDEO_CAPTURE_CSS_HEIGHT).toBe(900);
    expect(VIDEO_CAPTURE_DEVICE_SCALE_FACTOR).toBe(2.4);
    expect(VIDEO_CAPTURE_CSS_WIDTH * VIDEO_CAPTURE_DEVICE_SCALE_FACTOR).toBe(
      VIDEO_OUTPUT_WIDTH,
    );
    expect(VIDEO_CAPTURE_CSS_HEIGHT * VIDEO_CAPTURE_DEVICE_SCALE_FACTOR).toBe(
      VIDEO_OUTPUT_HEIGHT,
    );
    expect(VIDEO_OUTPUT_WIDTH).toBe(3840);
    expect(VIDEO_OUTPUT_HEIGHT).toBe(2160);
    expect(() => assertVideoQualityProfile()).not.toThrow();
  });

  it('uses high-quality intermediate and final encoding defaults', () => {
    expect(VIDEO_INTERMEDIATE_CRF).toBeLessThanOrEqual(10);
    expect(VIDEO_FINAL_CRF).toBeLessThanOrEqual(14);
    expect(VIDEO_FINAL_PRESET).toBe('slow');
    expect(videoQualityReport()).toMatchObject({
      profile: 'native-4k-ui',
      recordedPixels: { width: 3840, height: 2160 },
      intermediate: { codec: 'vp9', crf: VIDEO_INTERMEDIATE_CRF },
      final: { codec: 'h264', crf: VIDEO_FINAL_CRF },
    });
  });
});
