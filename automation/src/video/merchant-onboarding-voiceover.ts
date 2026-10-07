import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { DocumentationLocale } from '../locales.js';
import { ARTIFACTS_DIR, REPOSITORY_ROOT } from '../paths.js';

const execFileAsync = promisify(execFile);
const KOKORO_TOOL_DIR = path.join(ARTIFACTS_DIR, 'video-tools', 'kokoro');
const KOKORO_PYTHON = path.join(KOKORO_TOOL_DIR, '.venv', 'bin', 'python');
const KOKORO_MODEL = path.join(KOKORO_TOOL_DIR, 'kokoro-v1.0.onnx');
const KOKORO_VOICES = path.join(KOKORO_TOOL_DIR, 'voices-v1.0.bin');
const KOKORO_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'kokoro_tts.py');

export const DEFAULT_KOKORO_VOICE = 'bf_emma';
export const DEFAULT_KOKORO_LANGUAGE = 'en-gb';
export const DEFAULT_KOKORO_SPEED = 1.08;

export type VoiceoverCue = {
  id: string;
  startSeconds: number;
  text: string;
};

export type MerchantOnboardingVoiceoverConfig = {
  id: string;
  locale: string;
  source: string;
  voice: string;
  language: string;
  speed: number;
  cues: VoiceoverCue[];
};

export type MerchantOnboardingVoiceoverPlan = {
  locale: DocumentationLocale;
  sourceVideo: string;
  voice: string;
  language: string;
  speed: number;
  cues: VoiceoverCue[];
  narrationPath: string;
  subtitlesPath: string;
  finalVideoPath: string;
};

type GeneratedCue = VoiceoverCue & {
  durationSeconds: number;
  outputPath: string;
};

function onboardingRoot(locale: DocumentationLocale): string {
  return path.join(ARTIFACTS_DIR, 'videos', locale, 'onboarding');
}

function voiceoverRoot(locale: DocumentationLocale): string {
  return path.join(onboardingRoot(locale), 'voiceover');
}

function voiceoverConfigPath(locale: DocumentationLocale): string {
  return path.join(
    REPOSITORY_ROOT,
    'videos',
    'merchant-onboarding',
    `voiceover.${locale}.json`,
  );
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

export async function readMerchantOnboardingVoiceoverConfig(
  locale: DocumentationLocale,
): Promise<MerchantOnboardingVoiceoverConfig> {
  if (locale !== 'en') {
    throw new Error(
      `VIDEO-002 currently has an English onboarding narration only. Requested '${locale}'.`,
    );
  }
  const parsed = JSON.parse(
    await fs.readFile(voiceoverConfigPath(locale), 'utf8'),
  ) as MerchantOnboardingVoiceoverConfig;
  if (!Array.isArray(parsed.cues) || parsed.cues.length === 0) {
    throw new Error('The onboarding voiceover timeline must contain at least one cue.');
  }
  for (let index = 0; index < parsed.cues.length; index += 1) {
    const cue = parsed.cues[index]!;
    if (!cue.id.trim() || !cue.text.trim() || cue.startSeconds < 0) {
      throw new Error(`Invalid voiceover cue at index ${index}.`);
    }
    const previous = parsed.cues[index - 1];
    if (previous && cue.startSeconds <= previous.startSeconds) {
      throw new Error('Voiceover cue start times must be strictly increasing.');
    }
  }
  return parsed;
}

export async function resolveMerchantOnboardingSourceVideo(
  locale: DocumentationLocale,
): Promise<string> {
  const configured = process.env.VIDEO_ONBOARDING_SOURCE?.trim();
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(REPOSITORY_ROOT, configured);
    if (!(await fileExists(resolved))) {
      throw new Error(`VIDEO_ONBOARDING_SOURCE does not exist: ${resolved}`);
    }
    return resolved;
  }

  const root = onboardingRoot(locale);
  const candidates = [
    path.join(root, '01-onboarding-free-plan.final.webm'),
    path.join(root, '01-onboarding-free-plan.edited.webm'),
    path.join(root, '01-onboarding-free-plan.webm'),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(
    `No onboarding source video was found. Expected one of:\n${candidates
      .map((candidate) => `  - ${candidate}`)
      .join('\n')}`,
  );
}

export async function buildMerchantOnboardingVoiceoverPlan(
  locale: DocumentationLocale,
): Promise<MerchantOnboardingVoiceoverPlan> {
  const provider = process.env.VOICEOVER_PROVIDER?.trim() || 'kokoro';
  if (provider !== 'kokoro') {
    throw new Error(
      `VIDEO-002 currently supports the local Kokoro provider only. Received VOICEOVER_PROVIDER='${provider}'.`,
    );
  }
  const config = await readMerchantOnboardingVoiceoverConfig(locale);
  const voice = process.env.VOICEOVER_VOICE?.trim() || config.voice || DEFAULT_KOKORO_VOICE;
  const language =
    process.env.VOICEOVER_LANGUAGE?.trim() || config.language || DEFAULT_KOKORO_LANGUAGE;
  const speed = configuredNumber('VOICEOVER_SPEED', config.speed || DEFAULT_KOKORO_SPEED);
  if (speed < 0.5 || speed > 2) {
    throw new Error(`VOICEOVER_SPEED must be between 0.5 and 2.0. Received ${speed}.`);
  }
  const root = onboardingRoot(locale);
  return {
    locale,
    sourceVideo: await resolveMerchantOnboardingSourceVideo(locale),
    voice,
    language,
    speed,
    cues: config.cues,
    narrationPath: path.join(root, `01-onboarding-free-plan.${locale}.narration.wav`),
    subtitlesPath: path.join(root, `01-onboarding-free-plan.${locale}.srt`),
    finalVideoPath: path.join(root, `01-onboarding-free-plan.${locale}.mp4`),
  };
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

function buildSrt(cues: readonly GeneratedCue[]): string {
  const blocks: string[] = [];
  let index = 1;
  for (const cue of cues) {
    const pieces = splitSubtitleText(cue.text);
    const weights = pieces.map((piece) => piece.split(/\s+/).filter(Boolean).length);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = cue.startSeconds;
    pieces.forEach((piece, pieceIndex) => {
      const isLast = pieceIndex === pieces.length - 1;
      const duration = isLast
        ? cue.startSeconds + cue.durationSeconds - cursor
        : cue.durationSeconds * (weights[pieceIndex]! / totalWeight);
      const end = cursor + Math.max(0.8, duration);
      blocks.push(
        `${index}\n${formatSrtTime(cursor)} --> ${formatSrtTime(end)}\n${wrapCaption(piece)}\n`,
      );
      index += 1;
      cursor = end;
    });
  }
  return `${blocks.join('\n')}\n`;
}

async function synthesizeCue(
  cue: VoiceoverCue,
  outputPath: string,
  plan: MerchantOnboardingVoiceoverPlan,
): Promise<number> {
  const textPath = `${outputPath}.txt`;
  await fs.writeFile(textPath, `${cue.text.trim()}\n`, 'utf8');
  try {
    await execFileAsync(
      KOKORO_PYTHON,
      [
        KOKORO_SCRIPT,
        '--model', KOKORO_MODEL,
        '--voices', KOKORO_VOICES,
        '--voice', plan.voice,
        '--speed', String(plan.speed),
        '--language', plan.language,
        '--text-file', textPath,
        '--output', outputPath,
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
  return mediaDuration(outputPath);
}

function assertCueTiming(cues: readonly GeneratedCue[], videoDuration: number): void {
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]!;
    const end = cue.startSeconds + cue.durationSeconds;
    const next = cues[index + 1];
    if (next && end > next.startSeconds - 0.1) {
      throw new Error(
        `Narration cue '${cue.id}' ends at ${end.toFixed(2)}s but '${next.id}' starts at ${next.startSeconds.toFixed(2)}s. ` +
          'Increase VOICEOVER_SPEED slightly or adjust videos/merchant-onboarding/voiceover.en.json before rendering.',
      );
    }
    if (end > videoDuration - 0.15) {
      throw new Error(
        `Narration cue '${cue.id}' ends at ${end.toFixed(2)}s, beyond the ${videoDuration.toFixed(2)}s source video. ` +
          'Increase VOICEOVER_SPEED slightly or move/shorten the cue.',
      );
    }
  }
}

async function mixNarration(
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

export async function generateMerchantOnboardingVoiceover(options: {
  locale: DocumentationLocale;
  overwrite: boolean;
}): Promise<MerchantOnboardingVoiceoverPlan & { reportPath: string }> {
  await assertKokoroInstalled();
  const plan = await buildMerchantOnboardingVoiceoverPlan(options.locale);
  if (!options.overwrite && (await fileExists(plan.narrationPath))) {
    throw new Error(
      `Narration already exists: ${plan.narrationPath}\nRerun with --overwrite to regenerate it.`,
    );
  }
  const videoDuration = await mediaDuration(plan.sourceVideo);
  const outputRoot = voiceoverRoot(options.locale);
  await fs.mkdir(outputRoot, { recursive: true });

  const generated: GeneratedCue[] = [];
  for (let index = 0; index < plan.cues.length; index += 1) {
    const cue = plan.cues[index]!;
    const outputPath = path.join(
      outputRoot,
      `${String(index + 1).padStart(2, '0')}-${cue.id}.wav`,
    );
    if (options.overwrite) await fs.rm(outputPath, { force: true });
    const durationSeconds = await synthesizeCue(cue, outputPath, plan);
    generated.push({ ...cue, durationSeconds, outputPath });
    console.log(
      `generated: ${cue.id} (${durationSeconds.toFixed(2)}s) -> ${path.relative(REPOSITORY_ROOT, outputPath)}`,
    );
  }

  assertCueTiming(generated, videoDuration);
  await mixNarration(generated, plan.narrationPath);
  await fs.writeFile(plan.subtitlesPath, buildSrt(generated), 'utf8');

  const reportPath = path.join(outputRoot, 'voiceover-report.json');
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      provider: 'kokoro-onnx',
      voice: plan.voice,
      language: plan.language,
      speed: plan.speed,
      sourceVideo: plan.sourceVideo,
      videoDurationSeconds: videoDuration,
      narrationPath: plan.narrationPath,
      subtitlesPath: plan.subtitlesPath,
      cues: generated.map((cue) => ({
        id: cue.id,
        startSeconds: cue.startSeconds,
        durationSeconds: cue.durationSeconds,
        endSeconds: cue.startSeconds + cue.durationSeconds,
        text: cue.text,
        outputPath: cue.outputPath,
      })),
    }, null, 2)}\n`,
    'utf8',
  );

  return { ...plan, reportPath };
}

export async function renderMerchantOnboardingNarratedVideo(options: {
  locale: DocumentationLocale;
  overwrite: boolean;
}): Promise<MerchantOnboardingVoiceoverPlan> {
  const plan = await buildMerchantOnboardingVoiceoverPlan(options.locale);
  if (!(await fileExists(plan.narrationPath))) {
    throw new Error(
      `Narration does not exist: ${plan.narrationPath}\nRun: npm run video:merchant:onboarding:narrate -- --language ${options.locale}`,
    );
  }
  if (!(await fileExists(plan.subtitlesPath))) {
    throw new Error(
      `Subtitles do not exist: ${plan.subtitlesPath}\nRegenerate narration before rendering.`,
    );
  }
  if (!options.overwrite && (await fileExists(plan.finalVideoPath))) {
    throw new Error(
      `Final narrated video already exists: ${plan.finalVideoPath}\nRerun with --overwrite to replace it.`,
    );
  }

  const tempOutput = `${plan.finalVideoPath}.tmp.mp4`;
  await fs.rm(tempOutput, { force: true });
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', plan.sourceVideo,
      '-i', plan.narrationPath,
      '-i', plan.subtitlesPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-map', '2:0',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=eng',
      '-metadata:s:s:0', 'title=English',
      '-movflags', '+faststart',
      tempOutput,
    ]);
    await fs.rename(tempOutput, plan.finalVideoPath);
  } catch (error) {
    await fs.rm(tempOutput, { force: true });
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error("ffmpeg is required. Install it with 'brew install ffmpeg'.");
    }
    throw error;
  }

  return plan;
}
