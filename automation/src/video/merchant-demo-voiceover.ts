import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MERCHANT_VIDEO_SCENES,
  type MerchantVideoSceneId,
} from '../../config/merchant-video-scenes.js';
import type { DocumentationLocale } from '../locales.js';
import { ARTIFACTS_DIR, REPOSITORY_ROOT } from '../paths.js';
import {
  DEFAULT_KOKORO_LANGUAGE,
  DEFAULT_KOKORO_SPEED,
  DEFAULT_KOKORO_VOICE,
} from './merchant-onboarding-voiceover.js';

const execFileAsync = promisify(execFile);
const KOKORO_TOOL_DIR = path.join(ARTIFACTS_DIR, 'video-tools', 'kokoro');
const KOKORO_PYTHON = path.join(KOKORO_TOOL_DIR, '.venv', 'bin', 'python');
const KOKORO_MODEL = path.join(KOKORO_TOOL_DIR, 'kokoro-v1.0.onnx');
const KOKORO_VOICES = path.join(KOKORO_TOOL_DIR, 'voices-v1.0.bin');
const KOKORO_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'kokoro_tts.py');

export type MerchantDemoVoiceoverCue = {
  id: string;
  startSeconds: number;
  text: string;
};

export type MerchantDemoKeepSegment = {
  startSeconds: number;
  endSeconds: number | null;
};

export type MerchantDemoVoiceoverSceneConfig = {
  id: MerchantVideoSceneId;
  keepSegments?: MerchantDemoKeepSegment[];
  cues: MerchantDemoVoiceoverCue[];
};

export type MerchantDemoVoiceoverConfig = {
  id: string;
  locale: string;
  voice: string;
  language: string;
  speed: number;
  tailSeconds: number;
  scenes: MerchantDemoVoiceoverSceneConfig[];
};

type GeneratedCue = MerchantDemoVoiceoverCue & {
  durationSeconds: number;
  outputPath: string;
};

export type MerchantDemoGeneratedScene = {
  id: MerchantVideoSceneId;
  order: number;
  sourcePath: string;
  sourceSizeBytes: number;
  sourceMtimeMs: number;
  sourceDurationSeconds: number;
  editedVisualDurationSeconds: number;
  renderedDurationSeconds: number;
  keepSegments: MerchantDemoKeepSegment[];
  narrationPath: string;
  narratedScenePath: string;
  cues: GeneratedCue[];
};

type MerchantDemoVoiceoverReport = {
  generatedAt: string;
  provider: 'kokoro-onnx';
  locale: DocumentationLocale;
  voice: string;
  language: string;
  speed: number;
  tailSeconds: number;
  subtitlesPath: string;
  finalVideoPath: string;
  scenes: MerchantDemoGeneratedScene[];
};

function mainVideoRoot(locale: DocumentationLocale): string {
  return path.join(ARTIFACTS_DIR, 'videos', locale);
}

function voiceoverRoot(locale: DocumentationLocale): string {
  return path.join(mainVideoRoot(locale), 'main-voiceover');
}

function narrationRoot(locale: DocumentationLocale): string {
  return path.join(mainVideoRoot(locale), 'narration');
}

function narratedScenesRoot(locale: DocumentationLocale): string {
  return path.join(mainVideoRoot(locale), 'narrated-scenes');
}

function configPath(locale: DocumentationLocale): string {
  return path.join(REPOSITORY_ROOT, 'videos', 'merchant-demo', `voiceover.${locale}.json`);
}

function reportPath(locale: DocumentationLocale): string {
  return path.join(voiceoverRoot(locale), 'voiceover-report.json');
}

function subtitlesPath(locale: DocumentationLocale): string {
  return path.join(mainVideoRoot(locale), `moda-interact-shopify-demo.${locale}.srt`);
}

function finalVideoPath(locale: DocumentationLocale): string {
  return path.join(mainVideoRoot(locale), `moda-interact-shopify-demo.${locale}.mp4`);
}

function sceneFilename(order: number, id: string, extension: string): string {
  return `${String(order).padStart(2, '0')}-${id}.${extension}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function configuredNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be numeric. Received '${raw}'.`);
  }
  return value;
}

function enabledSceneIds(): MerchantVideoSceneId[] {
  return MERCHANT_VIDEO_SCENES
    .filter((scene) => scene.capture === 'enabled')
    .map((scene) => scene.id);
}

export function editedDurationForSegments(
  sourceDurationSeconds: number,
  keepSegments: readonly MerchantDemoKeepSegment[],
): number {
  if (keepSegments.length === 0) return sourceDurationSeconds;
  return keepSegments.reduce((total, segment) => {
    const end = segment.endSeconds ?? sourceDurationSeconds;
    return total + Math.max(0, end - segment.startSeconds);
  }, 0);
}

function validateKeepSegments(
  segments: readonly MerchantDemoKeepSegment[],
  sourceDurationSeconds?: number,
): void {
  let previousEnd = -1;
  segments.forEach((segment, index) => {
    const end = segment.endSeconds ?? sourceDurationSeconds ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(segment.startSeconds) || segment.startSeconds < 0) {
      throw new Error(`Invalid keep segment start at index ${index}.`);
    }
    if (segment.endSeconds !== null && (!Number.isFinite(segment.endSeconds) || segment.endSeconds <= segment.startSeconds)) {
      throw new Error(`Invalid keep segment end at index ${index}.`);
    }
    if (segment.startSeconds < previousEnd - 0.001) {
      throw new Error('Keep segments must be ordered and non-overlapping.');
    }
    if (sourceDurationSeconds !== undefined && segment.startSeconds >= sourceDurationSeconds) {
      throw new Error(
        `Keep segment ${index} starts at ${segment.startSeconds}s beyond the ${sourceDurationSeconds.toFixed(2)}s source video.`,
      );
    }
    if (sourceDurationSeconds !== undefined && end > sourceDurationSeconds + 0.05) {
      throw new Error(
        `Keep segment ${index} ends at ${end.toFixed(2)}s beyond the ${sourceDurationSeconds.toFixed(2)}s source video.`,
      );
    }
    previousEnd = end;
  });
}

function validateCueOrdering(cues: readonly MerchantDemoVoiceoverCue[], sceneId: string): void {
  if (cues.length === 0) throw new Error(`Scene '${sceneId}' must contain at least one narration cue.`);
  cues.forEach((cue, index) => {
    if (!cue.id.trim() || !cue.text.trim() || cue.startSeconds < 0) {
      throw new Error(`Invalid narration cue ${index} in scene '${sceneId}'.`);
    }
    const previous = cues[index - 1];
    if (previous && cue.startSeconds <= previous.startSeconds) {
      throw new Error(`Narration cue start times must increase in scene '${sceneId}'.`);
    }
  });
}

export async function readMerchantDemoVoiceoverConfig(
  locale: DocumentationLocale,
): Promise<MerchantDemoVoiceoverConfig> {
  if (locale !== 'en') {
    throw new Error(`The main walkthrough currently has English narration only. Requested '${locale}'.`);
  }
  const parsed = JSON.parse(
    await fs.readFile(configPath(locale), 'utf8'),
  ) as MerchantDemoVoiceoverConfig;
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('The main walkthrough voiceover must define at least one scene.');
  }
  const expected = enabledSceneIds();
  const actual = parsed.scenes.map((scene) => scene.id);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Voiceover scene order does not match the enabled capture registry.\nExpected: ${expected.join(', ')}\nActual: ${actual.join(', ')}`,
    );
  }
  parsed.scenes.forEach((scene) => {
    validateCueOrdering(scene.cues, scene.id);
    validateKeepSegments(scene.keepSegments ?? []);
  });
  if (!Number.isFinite(parsed.tailSeconds) || parsed.tailSeconds < 0 || parsed.tailSeconds > 5) {
    throw new Error('tailSeconds must be between 0 and 5 seconds.');
  }
  return parsed;
}

async function assertKokoroInstalled(): Promise<void> {
  const required = [KOKORO_PYTHON, KOKORO_MODEL, KOKORO_VOICES];
  const missing: string[] = [];
  for (const filePath of required) {
    if (!(await fileExists(filePath))) missing.push(filePath);
  }
  if (missing.length) {
    throw new Error(
      `Kokoro is not set up yet. Missing:\n${missing.map((item) => `  - ${item}`).join('\n')}\n` +
        'Run: npm run video:voiceover:setup',
    );
  }
}

async function mediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid media duration '${stdout.trim()}'.`);
    }
    return duration;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error("ffprobe is required. Install FFmpeg with 'brew install ffmpeg'.");
    }
    throw error;
  }
}

function formatSrtTime(seconds: number): string {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function splitSubtitleText(text: string): string[] {
  const sentenceParts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const sentence of sentenceParts) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 12) {
      result.push(sentence);
      continue;
    }
    for (let index = 0; index < words.length; index += 10) {
      result.push(words.slice(index, index + 10).join(' '));
    }
  }
  return result;
}

function wrapCaption(text: string, maxWidth = 44): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function buildGlobalSrt(scenes: readonly MerchantDemoGeneratedScene[]): string {
  const blocks: string[] = [];
  let index = 1;
  let sceneOffset = 0;
  for (const scene of scenes) {
    for (const cue of scene.cues) {
      const pieces = splitSubtitleText(cue.text);
      const weights = pieces.map((piece) => piece.split(/\s+/).filter(Boolean).length);
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      let cursor = sceneOffset + cue.startSeconds;
      pieces.forEach((piece, pieceIndex) => {
        const isLast = pieceIndex === pieces.length - 1;
        const duration = isLast
          ? sceneOffset + cue.startSeconds + cue.durationSeconds - cursor
          : cue.durationSeconds * (weights[pieceIndex]! / totalWeight);
        const end = cursor + Math.max(0.8, duration);
        blocks.push(
          `${index}\n${formatSrtTime(cursor)} --> ${formatSrtTime(end)}\n${wrapCaption(piece)}\n`,
        );
        index += 1;
        cursor = end;
      });
    }
    sceneOffset += scene.renderedDurationSeconds;
  }
  return `${blocks.join('\n')}\n`;
}

async function synthesizeCue(options: {
  cue: MerchantDemoVoiceoverCue;
  outputPath: string;
  voice: string;
  language: string;
  speed: number;
}): Promise<number> {
  const textPath = `${options.outputPath}.txt`;
  await fs.writeFile(textPath, `${options.cue.text.trim()}\n`, 'utf8');
  try {
    await execFileAsync(
      KOKORO_PYTHON,
      [
        KOKORO_SCRIPT,
        '--model', KOKORO_MODEL,
        '--voices', KOKORO_VOICES,
        '--voice', options.voice,
        '--speed', String(options.speed),
        '--language', options.language,
        '--text-file', textPath,
        '--output', options.outputPath,
      ],
      {
        env: {
          ...process.env,
          ONNX_PROVIDER: process.env.ONNX_PROVIDER?.trim() || 'CPUExecutionProvider',
        },
      },
    );
  } finally {
    await fs.rm(textPath, { force: true });
  }
  return mediaDuration(options.outputPath);
}

function assertCueTiming(cues: readonly GeneratedCue[], sceneId: string): void {
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]!;
    const end = cue.startSeconds + cue.durationSeconds;
    const next = cues[index + 1];
    if (next && end > next.startSeconds - 0.1) {
      throw new Error(
        `Narration cue '${sceneId}/${cue.id}' ends at ${end.toFixed(2)}s but '${next.id}' starts at ${next.startSeconds.toFixed(2)}s. ` +
          'Shorten the narration, increase VOICEOVER_SPEED slightly, or move the next cue.',
      );
    }
  }
}

async function mixSceneNarration(
  cues: readonly GeneratedCue[],
  narrationPath: string,
): Promise<void> {
  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const cue of cues) args.push('-i', cue.outputPath);
  const filters: string[] = cues.map((cue, index) => {
    const delay = Math.round(cue.startSeconds * 1000);
    return `[${index}:a]adelay=${delay}:all=1[a${index}]`;
  });
  filters.push(
    `${cues.map((_, index) => `[a${index}]`).join('')}amix=inputs=${cues.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[outa]`,
  );
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[outa]',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    narrationPath,
  );
  try {
    await execFileAsync('ffmpeg', args);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error("ffmpeg is required. Install it with 'brew install ffmpeg'.");
    }
    throw error;
  }
}

function sourcePathForScene(locale: DocumentationLocale, id: MerchantVideoSceneId): string {
  const scene = MERCHANT_VIDEO_SCENES.find((candidate) => candidate.id === id);
  if (!scene) throw new Error(`Unknown merchant demo scene '${id}'.`);
  return path.join(
    mainVideoRoot(locale),
    'scenes',
    sceneFilename(scene.order, scene.id, 'webm'),
  );
}

function narratedPathForScene(locale: DocumentationLocale, id: MerchantVideoSceneId): string {
  const scene = MERCHANT_VIDEO_SCENES.find((candidate) => candidate.id === id);
  if (!scene) throw new Error(`Unknown merchant demo scene '${id}'.`);
  return path.join(
    narratedScenesRoot(locale),
    sceneFilename(scene.order, scene.id, 'mp4'),
  );
}

export async function generateMerchantDemoVoiceover(options: {
  locale: DocumentationLocale;
  overwrite: boolean;
}): Promise<MerchantDemoVoiceoverReport> {
  await assertKokoroInstalled();
  const provider = process.env.VOICEOVER_PROVIDER?.trim() || 'kokoro';
  if (provider !== 'kokoro') {
    throw new Error(`The main walkthrough currently supports Kokoro only. Received '${provider}'.`);
  }
  const config = await readMerchantDemoVoiceoverConfig(options.locale);
  const voice = process.env.VOICEOVER_VOICE?.trim() || config.voice || DEFAULT_KOKORO_VOICE;
  const language = process.env.VOICEOVER_LANGUAGE?.trim() || config.language || DEFAULT_KOKORO_LANGUAGE;
  const speed = configuredNumber('VOICEOVER_SPEED', config.speed || DEFAULT_KOKORO_SPEED);
  if (speed < 0.5 || speed > 2) {
    throw new Error(`VOICEOVER_SPEED must be between 0.5 and 2.0. Received ${speed}.`);
  }

  const reportFile = reportPath(options.locale);
  if (!options.overwrite && (await fileExists(reportFile))) {
    throw new Error(
      `Main walkthrough narration already exists: ${reportFile}\nRerun with --overwrite to regenerate it.`,
    );
  }

  await fs.mkdir(voiceoverRoot(options.locale), { recursive: true });
  await fs.mkdir(narrationRoot(options.locale), { recursive: true });
  await fs.mkdir(narratedScenesRoot(options.locale), { recursive: true });

  const generatedScenes: MerchantDemoGeneratedScene[] = [];
  for (const sceneConfig of config.scenes) {
    const registryScene = MERCHANT_VIDEO_SCENES.find((scene) => scene.id === sceneConfig.id)!;
    const sourcePath = sourcePathForScene(options.locale, sceneConfig.id);
    if (!(await fileExists(sourcePath))) {
      throw new Error(
        `Missing source clip for '${sceneConfig.id}': ${sourcePath}\nRun the main merchant capture before narration.`,
      );
    }
    const sourceDurationSeconds = await mediaDuration(sourcePath);
    const keepSegments = sceneConfig.keepSegments ?? [];
    validateKeepSegments(keepSegments, sourceDurationSeconds);
    const editedVisualDurationSeconds = editedDurationForSegments(
      sourceDurationSeconds,
      keepSegments,
    );
    const stat = await fs.stat(sourcePath);
    const cueDir = path.join(
      voiceoverRoot(options.locale),
      `${String(registryScene.order).padStart(2, '0')}-${registryScene.id}`,
    );
    await fs.mkdir(cueDir, { recursive: true });
    const generatedCues: GeneratedCue[] = [];
    for (let index = 0; index < sceneConfig.cues.length; index += 1) {
      const cue = sceneConfig.cues[index]!;
      const outputPath = path.join(
        cueDir,
        `${String(index + 1).padStart(2, '0')}-${cue.id}.wav`,
      );
      if (options.overwrite) await fs.rm(outputPath, { force: true });
      const durationSeconds = await synthesizeCue({
        cue,
        outputPath,
        voice,
        language,
        speed,
      });
      generatedCues.push({ ...cue, durationSeconds, outputPath });
      console.log(
        `generated: ${sceneConfig.id}/${cue.id} (${durationSeconds.toFixed(2)}s) -> ${path.relative(REPOSITORY_ROOT, outputPath)}`,
      );
    }
    assertCueTiming(generatedCues, sceneConfig.id);
    const narrationPath = path.join(
      narrationRoot(options.locale),
      sceneFilename(registryScene.order, registryScene.id, 'wav'),
    );
    await mixSceneNarration(generatedCues, narrationPath);
    const narrationEnd = Math.max(
      ...generatedCues.map((cue) => cue.startSeconds + cue.durationSeconds),
    );
    const renderedDurationSeconds = Math.max(
      editedVisualDurationSeconds,
      narrationEnd + config.tailSeconds,
    );
    generatedScenes.push({
      id: registryScene.id,
      order: registryScene.order,
      sourcePath,
      sourceSizeBytes: stat.size,
      sourceMtimeMs: stat.mtimeMs,
      sourceDurationSeconds,
      editedVisualDurationSeconds,
      renderedDurationSeconds,
      keepSegments,
      narrationPath,
      narratedScenePath: narratedPathForScene(options.locale, registryScene.id),
      cues: generatedCues,
    });
  }

  const outputSubtitles = subtitlesPath(options.locale);
  await fs.writeFile(outputSubtitles, buildGlobalSrt(generatedScenes), 'utf8');

  const report: MerchantDemoVoiceoverReport = {
    generatedAt: new Date().toISOString(),
    provider: 'kokoro-onnx',
    locale: options.locale,
    voice,
    language,
    speed,
    tailSeconds: config.tailSeconds,
    subtitlesPath: outputSubtitles,
    finalVideoPath: finalVideoPath(options.locale),
    scenes: generatedScenes,
  };
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function segmentFilter(
  segments: readonly MerchantDemoKeepSegment[],
  sourceDurationSeconds: number,
): { filters: string[]; label: string } {
  if (segments.length === 0) {
    return { filters: ['[0:v]setpts=PTS-STARTPTS[vbase]'], label: 'vbase' };
  }
  const filters: string[] = [];
  const labels: string[] = [];
  segments.forEach((segment, index) => {
    const end = segment.endSeconds ?? sourceDurationSeconds;
    const label = `vseg${index}`;
    labels.push(`[${label}]`);
    filters.push(
      `[0:v]trim=start=${segment.startSeconds.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[${label}]`,
    );
  });
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vbase]`);
  return { filters, label: 'vbase' };
}

async function assertSourcesUnchanged(report: MerchantDemoVoiceoverReport): Promise<void> {
  for (const scene of report.scenes) {
    const stat = await fs.stat(scene.sourcePath).catch(() => null);
    if (!stat) {
      throw new Error(`Source clip disappeared after narration: ${scene.sourcePath}`);
    }
    if (stat.size !== scene.sourceSizeBytes || Math.abs(stat.mtimeMs - scene.sourceMtimeMs) > 1) {
      throw new Error(
        `Source clip changed after narration: ${scene.sourcePath}\nRerun: npm run video:merchant:narrate -- --language ${report.locale} --overwrite`,
      );
    }
  }
}

async function renderNarratedScene(scene: MerchantDemoGeneratedScene): Promise<void> {
  const extendSeconds = Math.max(
    0,
    scene.renderedDurationSeconds - scene.editedVisualDurationSeconds,
  );
  const { filters } = segmentFilter(scene.keepSegments, scene.sourceDurationSeconds);
  filters.push(
    `[vbase]tpad=stop_mode=clone:stop_duration=${extendSeconds.toFixed(3)},trim=duration=${scene.renderedDurationSeconds.toFixed(3)},` +
      'scale=1920:1080:force_original_aspect_ratio=decrease,' +
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=25,setsar=1,format=yuv420p[vout]',
  );
  filters.push(
    `[1:a]apad=pad_dur=${scene.renderedDurationSeconds.toFixed(3)},atrim=duration=${scene.renderedDurationSeconds.toFixed(3)},aresample=48000,asetpts=PTS-STARTPTS[aout]`,
  );
  await fs.mkdir(path.dirname(scene.narratedScenePath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', scene.sourcePath,
    '-i', scene.narrationPath,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    scene.narratedScenePath,
  ]);
}

function quoteConcatPath(filePath: string): string {
  return `file '${filePath.replaceAll("'", "'\\''")}'`;
}

async function readVoiceoverReport(
  locale: DocumentationLocale,
): Promise<MerchantDemoVoiceoverReport> {
  const file = reportPath(locale);
  if (!(await fileExists(file))) {
    throw new Error(
      `Main walkthrough narration report does not exist: ${file}\nRun: npm run video:merchant:narrate -- --language ${locale}`,
    );
  }
  return JSON.parse(await fs.readFile(file, 'utf8')) as MerchantDemoVoiceoverReport;
}

export async function renderMerchantDemoNarratedVideo(options: {
  locale: DocumentationLocale;
  overwrite: boolean;
}): Promise<{ finalVideoPath: string; subtitlesPath: string; renderReportPath: string }> {
  const report = await readVoiceoverReport(options.locale);
  await assertSourcesUnchanged(report);
  const outputPath = report.finalVideoPath;
  if (!options.overwrite && (await fileExists(outputPath))) {
    throw new Error(
      `Final main walkthrough already exists: ${outputPath}\nRerun with --overwrite to replace it.`,
    );
  }

  try {
    for (const scene of report.scenes) {
      await renderNarratedScene(scene);
      console.log(
        `rendered scene: ${scene.id} -> ${path.relative(REPOSITORY_ROOT, scene.narratedScenePath)}`,
      );
    }

    const tempDir = path.join(mainVideoRoot(options.locale), '.main-render');
    await fs.mkdir(tempDir, { recursive: true });
    const concatList = path.join(tempDir, 'concat.txt');
    const joinedVideo = path.join(tempDir, 'joined.mp4');
    const tempFinal = path.join(tempDir, 'final.mp4');
    await fs.writeFile(
      concatList,
      `${report.scenes.map((scene) => quoteConcatPath(scene.narratedScenePath)).join('\n')}\n`,
      'utf8',
    );
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',
      '-movflags', '+faststart',
      joinedVideo,
    ]);
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', joinedVideo,
      '-i', report.subtitlesPath,
      '-map', '0:v:0',
      '-map', '0:a:0',
      '-map', '1:0',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-c:s', 'mov_text',
      '-metadata', 'title=Moda Interact - Shopify Merchant Walkthrough',
      '-metadata:s:s:0', 'language=eng',
      '-metadata:s:s:0', 'title=English',
      '-movflags', '+faststart',
      tempFinal,
    ]);
    await fs.rm(outputPath, { force: true });
    await fs.rename(tempFinal, outputPath);
    const renderReportPath = path.join(mainVideoRoot(options.locale), 'main-render-report.json');
    await fs.writeFile(
      renderReportPath,
      `${JSON.stringify({
        renderedAt: new Date().toISOString(),
        finalVideoPath: outputPath,
        subtitlesPath: report.subtitlesPath,
        totalDurationSeconds: report.scenes.reduce(
          (sum, scene) => sum + scene.renderedDurationSeconds,
          0,
        ),
        scenes: report.scenes.map((scene) => ({
          id: scene.id,
          narratedScenePath: scene.narratedScenePath,
          renderedDurationSeconds: scene.renderedDurationSeconds,
        })),
      }, null, 2)}\n`,
      'utf8',
    );
    await fs.rm(tempDir, { recursive: true, force: true });
    return {
      finalVideoPath: outputPath,
      subtitlesPath: report.subtitlesPath,
      renderReportPath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error("ffmpeg is required. Install it with 'brew install ffmpeg'.");
    }
    throw error;
  }
}
