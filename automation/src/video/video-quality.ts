/**
 * High-fidelity video production profile.
 *
 * Keep the CSS viewport smaller than the recorded pixel surface so the Moda
 * application occupies more of each frame while Chromium renders at a high
 * device pixel ratio. This preserves small UI text before YouTube performs its
 * own transcode.
 */
export const VIDEO_CAPTURE_CSS_WIDTH = 1600;
export const VIDEO_CAPTURE_CSS_HEIGHT = 900;
export const VIDEO_CAPTURE_DEVICE_SCALE_FACTOR = 2.4;
// Context DPR alone scales screenshots but can leave screencast frames at CSS
// resolution. Force Chromium's compositor scale too, rather than padding a
// 1600×900 recording into a nominal 4K container.
export const VIDEO_CAPTURE_CHROMIUM_ARGS: readonly string[] = Object.freeze([
  `--force-device-scale-factor=${VIDEO_CAPTURE_DEVICE_SCALE_FACTOR}`,
]);

export const VIDEO_OUTPUT_WIDTH = 3840;
export const VIDEO_OUTPUT_HEIGHT = 2160;
export const VIDEO_OUTPUT_FPS = 25;

/** VP9 scene intermediates: intentionally very high quality for text/UI. */
export const VIDEO_INTERMEDIATE_CRF = 8;
export const VIDEO_INTERMEDIATE_CPU_USED = 2;

/** Final YouTube master: high-quality H.264 4K, encoded only once per scene. */
export const VIDEO_FINAL_CRF = 12;
export const VIDEO_FINAL_PRESET = 'slow';
export const VIDEO_FINAL_TUNE = 'animation';

export function assertVideoQualityProfile(): void {
  const physicalWidth = Math.round(
    VIDEO_CAPTURE_CSS_WIDTH * VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
  );
  const physicalHeight = Math.round(
    VIDEO_CAPTURE_CSS_HEIGHT * VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
  );
  if (
    physicalWidth !== VIDEO_OUTPUT_WIDTH ||
    physicalHeight !== VIDEO_OUTPUT_HEIGHT
  ) {
    throw new Error(
      `Video capture profile mismatch: ${VIDEO_CAPTURE_CSS_WIDTH}x${VIDEO_CAPTURE_CSS_HEIGHT} at DPR ${VIDEO_CAPTURE_DEVICE_SCALE_FACTOR} renders ${physicalWidth}x${physicalHeight}, expected ${VIDEO_OUTPUT_WIDTH}x${VIDEO_OUTPUT_HEIGHT}.`,
    );
  }
}

export function videoQualityReport(): Record<string, unknown> {
  return {
    profile: 'native-4k-ui',
    cssViewport: {
      width: VIDEO_CAPTURE_CSS_WIDTH,
      height: VIDEO_CAPTURE_CSS_HEIGHT,
    },
    deviceScaleFactor: VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
    chromiumArgs: [...VIDEO_CAPTURE_CHROMIUM_ARGS],
    recordedPixels: {
      width: VIDEO_OUTPUT_WIDTH,
      height: VIDEO_OUTPUT_HEIGHT,
    },
    fps: VIDEO_OUTPUT_FPS,
    intermediate: {
      codec: 'vp9',
      crf: VIDEO_INTERMEDIATE_CRF,
      cpuUsed: VIDEO_INTERMEDIATE_CPU_USED,
    },
    final: {
      codec: 'h264',
      crf: VIDEO_FINAL_CRF,
      preset: VIDEO_FINAL_PRESET,
      tune: VIDEO_FINAL_TUNE,
    },
  };
}
