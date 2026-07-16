import { dirname, join } from 'node:path';

import { throwIfAborted } from './abort.js';
import {
  resolveVideoFfmpegPath,
  runProcess,
  type VideoProcessRunner,
} from './ffmpeg-video.js';
import { OUTPUT_FPS } from './manifest.js';
import {
  type CanonicalSentence,
  splitCanonicalSentences,
} from './storyboard/sentences.js';
import { characterUnits, MAX_LINE_UNITS } from './subtitles.js';

export interface SilenceInterval {
  startMs: number;
  endMs: number;
}

export interface TimedCanonicalSentence {
  sentence: CanonicalSentence;
  startMs: number;
  endMs: number;
}

export interface WeightedCaption {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CanonicalAudioTiming {
  durationMs: number;
  sentences: TimedCanonicalSentence[];
  captions: WeightedCaption[];
  silences: SilenceInterval[];
}

export function resolveVideoFfprobePath(): string {
  const configured = process.env['VIDEO_FFPROBE_PATH']?.trim();
  if (configured) return configured;
  const configuredFfmpeg = process.env['VIDEO_FFMPEG_PATH']?.trim();
  return configuredFfmpeg
    ? join(dirname(configuredFfmpeg), 'ffprobe')
    : 'ffprobe';
}

function invokeRunner(
  runner: VideoProcessRunner,
  executable: string,
  args: string[],
  signal?: AbortSignal,
) {
  return signal
    ? runner(executable, args, false, signal)
    : runner(executable, args);
}

export function assertMainNarrationAudioSource(audioSource: string): void {
  if (!/^https?:\/\//i.test(audioSource)) return;
  const pathname = new URL(audioSource).pathname.toLowerCase();
  if (pathname.includes('/classroom/')) {
    throw new Error('Video audio must use main narration, not classroom audio');
  }
  if (!pathname.includes('/main/')) {
    throw new Error(
      'Remote video audio URL must point to the main HLS section',
    );
  }
}

export async function probeAudioDurationMs(
  audioSource: string,
  options: {
    ffprobePath?: string;
    processRunner?: VideoProcessRunner;
    signal?: AbortSignal;
  } = {},
): Promise<number> {
  throwIfAborted(options.signal);
  const result = await invokeRunner(
    options.processRunner ?? runProcess,
    options.ffprobePath ?? resolveVideoFfprobePath(),
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      audioSource,
    ],
    options.signal,
  );
  let duration: unknown;
  try {
    const parsed = JSON.parse(result.stdout) as {
      format?: { duration?: unknown };
    };
    duration = parsed.format?.duration;
  } catch (error) {
    throw new Error('ffprobe returned malformed duration JSON', {
      cause: error,
    });
  }
  const seconds = typeof duration === 'string' ? Number(duration) : duration;
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    throw new Error('ffprobe did not return a positive audio duration');
  }
  return snapToFrame(seconds * 1_000);
}

export function parseSilenceDetection(stderr: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const start = /silence_start:\s*([\d.]+)/.exec(line)?.[1];
    if (start !== undefined) {
      pendingStart = Number(start) * 1_000;
    }
    const end = /silence_end:\s*([\d.]+)/.exec(line)?.[1];
    if (end !== undefined) {
      const endMs = Number(end) * 1_000;
      const startMs = pendingStart ?? endMs;
      if (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        endMs >= startMs
      ) {
        intervals.push({ startMs, endMs });
      }
      pendingStart = null;
    }
  }
  return intervals;
}

export async function detectAudioSilences(
  audioSource: string,
  options: {
    ffmpegPath?: string;
    processRunner?: VideoProcessRunner;
    signal?: AbortSignal;
  } = {},
): Promise<SilenceInterval[]> {
  throwIfAborted(options.signal);
  const result = await invokeRunner(
    options.processRunner ?? runProcess,
    options.ffmpegPath ?? resolveVideoFfmpegPath(),
    [
      '-hide_banner',
      '-nostdin',
      '-i',
      audioSource,
      '-vn',
      '-af',
      'silencedetect=noise=-35dB:d=0.25',
      '-f',
      'null',
      '-',
    ],
    options.signal,
  );
  return parseSilenceDetection(result.stderr);
}

function speakingUnits(value: string): number {
  const latinWords = value.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const nonLatin = Array.from(value.replace(/[A-Za-z0-9\s]/g, '')).length;
  return Math.max(1, nonLatin + latinWords * 1.4);
}

function snapToFrame(valueMs: number, fps = OUTPUT_FPS): number {
  return Math.round((Math.round((valueMs * fps) / 1_000) * 1_000) / fps);
}

function nearestSilenceBoundary(
  idealMs: number,
  silences: readonly SilenceInterval[],
  minMs: number,
  maxMs: number,
): number | null {
  let nearest: number | null = null;
  let nearestDistance = 1_500;
  for (const silence of silences) {
    const candidate = (silence.startMs + silence.endMs) / 2;
    if (candidate <= minMs || candidate >= maxMs) continue;
    const distance = Math.abs(candidate - idealMs);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function sentenceBoundaries(
  sentences: readonly CanonicalSentence[],
  durationMs: number,
  silences: readonly SilenceInterval[],
): number[] {
  const weights = sentences.map((sentence) => speakingUnits(sentence.text));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const boundaries = [0];
  let cumulativeWeight = 0;
  for (let index = 0; index < sentences.length - 1; index += 1) {
    cumulativeWeight += weights[index]!;
    const ideal = (durationMs * cumulativeWeight) / totalWeight;
    const remaining = sentences.length - index - 1;
    const min = boundaries.at(-1)! + 33;
    const max = durationMs - remaining * 33;
    const silence = nearestSilenceBoundary(ideal, silences, min, max);
    const snapped = snapToFrame(silence ?? ideal);
    boundaries.push(Math.min(max, Math.max(min, snapped)));
  }
  boundaries.push(durationMs);
  return boundaries;
}

// Generated captions must each fit a single rendered subtitle line: the ASS
// wrapper breaks overflow greedily with no phrase awareness, so multi-line
// chunks would wrap mid-phrase. Two-line rendering stays reserved for
// explicit editorial "\n" breaks.
const CAPTION_MAX_UNITS = MAX_LINE_UNITS;

export function splitCaptionText(text: string): string[] {
  const characters = Array.from(text.trim());
  const chunks: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let units = 0;
    let end = start;
    let preferredBreak = -1;
    while (end < characters.length) {
      const character = characters[end]!;
      const nextUnits = units + characterUnits(character);
      if (nextUnits > CAPTION_MAX_UNITS) break;
      units = nextUnits;
      end += 1;
      if (/[，。！？、：；,!?\s]/.test(character) && units >= 16) {
        preferredBreak = end;
      }
    }
    if (end < characters.length && preferredBreak > start) end = preferredBreak;
    if (end <= start) end = start + 1;
    const chunk = characters.slice(start, end).join('').trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks;
}

function captionChunksForSentence(
  sentence: TimedCanonicalSentence,
): WeightedCaption[] {
  const chunks = splitCaptionText(sentence.sentence.text);
  const weights = chunks.map(speakingUnits);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = sentence.endMs - sentence.startMs;
  const captions: WeightedCaption[] = [];
  let cumulative = 0;
  for (const [index, chunk] of chunks.entries()) {
    const startMs = index === 0 ? sentence.startMs : captions.at(-1)!.endMs;
    cumulative += weights[index]!;
    const endMs =
      index === chunks.length - 1
        ? sentence.endMs
        : Math.max(
            startMs + 33,
            snapToFrame(
              sentence.startMs + (duration * cumulative) / totalWeight,
            ),
          );
    captions.push({ startMs, endMs, text: chunk });
  }
  return captions;
}

export function buildWeightedCaptionTiming(input: {
  script: string;
  durationMs: number;
  silences?: readonly SilenceInterval[];
}): CanonicalAudioTiming {
  const sentences = splitCanonicalSentences(input.script);
  if (sentences.length === 0) {
    throw new Error('Canonical script does not contain any sentences');
  }
  const durationMs = snapToFrame(input.durationMs);
  const silences = input.silences ?? [];
  const boundaries = sentenceBoundaries(sentences, durationMs, silences);
  const timedSentences = sentences.map((sentence, index) => ({
    sentence,
    startMs: boundaries[index]!,
    endMs: boundaries[index + 1]!,
  }));
  return {
    durationMs,
    sentences: timedSentences,
    captions: timedSentences.flatMap(captionChunksForSentence),
    silences: [...silences],
  };
}

export async function analyzeCanonicalAudio(input: {
  script: string;
  audioSource: string;
  ffprobePath?: string;
  ffmpegPath?: string;
  processRunner?: VideoProcessRunner;
  signal?: AbortSignal;
}): Promise<CanonicalAudioTiming> {
  assertMainNarrationAudioSource(input.audioSource);
  const common = {
    ...(input.processRunner ? { processRunner: input.processRunner } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const durationMs = await probeAudioDurationMs(input.audioSource, {
    ...common,
    ...(input.ffprobePath ? { ffprobePath: input.ffprobePath } : {}),
  });
  const silences = await detectAudioSilences(input.audioSource, {
    ...common,
    ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
  });
  return buildWeightedCaptionTiming({
    script: input.script,
    durationMs,
    silences,
  });
}
