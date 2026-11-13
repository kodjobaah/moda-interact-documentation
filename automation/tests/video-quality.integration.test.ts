import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import {
  VIDEO_CAPTURE_CHROMIUM_ARGS,
  VIDEO_CAPTURE_CSS_HEIGHT,
  VIDEO_CAPTURE_CSS_WIDTH,
  VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
  VIDEO_FINAL_CRF,
  VIDEO_OUTPUT_HEIGHT,
  VIDEO_OUTPUT_WIDTH,
} from '../src/video/video-quality.js';

const exec = promisify(execFile);
type Probe = {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    color_primaries?: string;
    color_transfer?: string;
    color_space?: string;
  }>;
  format: { duration: string };
};

async function probe(file: string): Promise<Probe> {
  return JSON.parse((await exec('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ])).stdout) as Probe;
}

async function bottomRightPixel(file: string, seconds: string): Promise<number[]> {
  const { stdout } = await exec('ffmpeg', [
    '-v', 'error', '-ss', seconds, '-i', file, '-frames:v', '1',
    '-vf', `format=rgb24,crop=1:1:${VIDEO_OUTPUT_WIDTH - 2}:${VIDEO_OUTPUT_HEIGHT - 2}`,
    '-f', 'rawvideo', 'pipe:1',
  ], { encoding: 'buffer' });
  return [...stdout];
}

function assertFullPage(proof: Probe, pixels: number[]): void {
  expect(proof.streams.find((stream) => stream.codec_type === 'video')).toMatchObject({
    width: VIDEO_OUTPUT_WIDTH,
    height: VIDEO_OUTPUT_HEIGHT,
  });
  // The fixture fills the viewport red. Gray means that a smaller screencast
  // was merely padded into a 4K container, which ffprobe dimensions alone miss.
  expect(pixels).toHaveLength(3);
  expect(pixels[0]).toBeGreaterThan(220);
  expect(pixels[1]).toBeLessThan(30);
  expect(pixels[2]).toBeLessThan(30);
}

describe.skipIf(process.env.VIDEO_QUALITY_SMOKE !== '1')('offline video quality pipeline', () => {
  it('records full-frame page pixels and renders both final paths at 4K with audio and captions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moda-video-quality-'));
    const environment = { ...process.env };
    vi.resetModules();
    vi.doMock('../src/paths.js', async () => ({
      ...await vi.importActual<typeof import('../src/paths.js')>('../src/paths.js'),
      ARTIFACTS_DIR: root,
    }));
    const browser = await chromium.launch({ headless: true, args: [...VIDEO_CAPTURE_CHROMIUM_ARGS] });
    try {
      const context = await browser.newContext({
        viewport: { width: VIDEO_CAPTURE_CSS_WIDTH, height: VIDEO_CAPTURE_CSS_HEIGHT },
        deviceScaleFactor: VIDEO_CAPTURE_DEVICE_SCALE_FACTOR,
        recordVideo: { dir: path.join(root, 'raw'), size: { width: VIDEO_OUTPUT_WIDTH, height: VIDEO_OUTPUT_HEIGHT } },
      });
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      const video = page.video()!;
      await page.setContent('<html><body style="margin:0;background:rgb(255,0,0);height:100vh;width:100vw"><h1 style="margin:0;color:white;font-size:24px">Synthetic offline video fixture</h1></body></html>');
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
        width: VIDEO_CAPTURE_CSS_WIDTH, height: VIDEO_CAPTURE_CSS_HEIGHT,
      });
      await page.waitForTimeout(1200);
      await context.close();
      const raw = await video.path();
      const captured = await probe(raw);
      const rawPixel = await bottomRightPixel(raw, '0.5');
      assertFullPage(captured, rawPixel);

      const { trimRecordedWebm } = await import('../src/video/merchant-demo.js');
      const trimmed = path.join(root, 'trimmed.webm');
      await trimRecordedWebm(raw, trimmed, { startSeconds: 0.4, durationSeconds: 0.6 });
      const intermediate = await probe(trimmed);
      expect(intermediate.streams.find((stream) => stream.codec_type === 'video')?.codec_name).toBe('vp9');
      const trimmedPixel = await bottomRightPixel(trimmed, '0.1');
      assertFullPage(intermediate, trimmedPixel);

      const duration = Number(intermediate.format.duration);
      const narration = path.join(root, 'narration.wav');
      const captions = path.join(root, 'captions.srt');
      await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(duration), narration]);
      await fs.writeFile(captions, '1\n00:00:00,000 --> 00:00:00,500\nSynthetic offline caption\n');
      const source = await fs.stat(trimmed);
      const reportDir = path.join(root, 'videos', 'en', 'main-voiceover');
      await fs.mkdir(reportDir, { recursive: true });
      await fs.writeFile(path.join(reportDir, 'voiceover-report.json'), JSON.stringify({
        generatedAt: new Date().toISOString(), provider: 'kokoro-onnx', locale: 'en',
        voice: 'synthetic', language: 'en', speed: 1, tailSeconds: 0,
        subtitlesPath: captions, finalVideoPath: path.join(root, 'main.mp4'),
        scenes: [{
          id: 'closing', order: 15, sourcePath: trimmed,
          sourceSizeBytes: source.size, sourceMtimeMs: source.mtimeMs,
          sourceDurationSeconds: duration, editedVisualDurationSeconds: duration,
          renderedDurationSeconds: duration, keepSegments: [{ startSeconds: 0, endSeconds: null }],
          narrationPath: narration, narratedScenePath: path.join(root, 'narrated-scene.mp4'), cues: [],
        }],
      }));
      const { renderMerchantDemoNarratedVideo } = await import('../src/video/merchant-demo-voiceover.js');
      const mainResult = await renderMerchantDemoNarratedVideo({ locale: 'en', overwrite: false });

      Object.assign(process.env, { VIDEO_ONBOARDING_SOURCE: trimmed, VOICEOVER_PROVIDER: 'kokoro', VOICEOVER_VOICE: 'bf_emma', VOICEOVER_LANGUAGE: 'en-gb', VOICEOVER_SPEED: '1.08' });
      const { buildMerchantOnboardingVoiceoverPlan, renderMerchantOnboardingNarratedVideo } = await import('../src/video/merchant-onboarding-voiceover.js');
      const plan = await buildMerchantOnboardingVoiceoverPlan('en');
      await fs.mkdir(path.dirname(plan.narrationPath), { recursive: true });
      await fs.copyFile(narration, plan.narrationPath);
      await fs.copyFile(captions, plan.subtitlesPath);
      const onboardingResult = await renderMerchantOnboardingNarratedVideo({ locale: 'en', overwrite: false });

      const finals = [];
      for (const file of [mainResult.finalVideoPath, onboardingResult.finalVideoPath]) {
        const result = await probe(file);
        const pixel = await bottomRightPixel(file, '0.1');
        assertFullPage(result, pixel);
        expect(result.streams.find((stream) => stream.codec_type === 'video')).toMatchObject({
          codec_name: 'h264', avg_frame_rate: '25/1', color_primaries: 'bt709',
          color_transfer: 'bt709', color_space: 'bt709',
        });
        expect(result.streams.find((stream) => stream.codec_type === 'audio')?.codec_name).toBe('aac');
        expect(result.streams.find((stream) => stream.codec_type === 'subtitle')?.codec_name).toBe('mov_text');
        const encodedCrf = Number((await fs.readFile(file)).toString('latin1').match(/\bcrf=([0-9.]+)/)?.[1]);
        expect(encodedCrf).toBe(VIDEO_FINAL_CRF);
        finals.push({ streams: result.streams, pixel, encodedCrf });
      }
      const proof = { captured: captured.streams, rawPixel, intermediate: intermediate.streams, trimmedPixel, finals };
      if (process.env.VIDEO_QUALITY_PROOF_PATH) {
        await fs.writeFile(process.env.VIDEO_QUALITY_PROOF_PATH, JSON.stringify(proof, null, 2), { flag: 'wx', mode: 0o600 });
      }
      console.log('VIDEO_QUALITY_PROOF', JSON.stringify(proof));
    } finally {
      await browser.close();
      for (const key of ['VIDEO_ONBOARDING_SOURCE', 'VOICEOVER_PROVIDER', 'VOICEOVER_VOICE', 'VOICEOVER_LANGUAGE', 'VOICEOVER_SPEED']) {
        if (environment[key] === undefined) delete process.env[key];
        else process.env[key] = environment[key];
      }
      vi.doUnmock('../src/paths.js');
      vi.resetModules();
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
