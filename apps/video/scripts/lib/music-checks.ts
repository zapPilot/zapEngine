import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type LoudnessReport, loudnormFilter, parseLoudnorm } from './audio';
import { ffmpeg, mediaDuration } from './media';

export const MUSIC_TARGET = { i: -18, tp: -2, lra: 3 } as const;
export interface MusicReport {
  readonly durationSeconds: number;
  readonly leadingSilenceSeconds: number;
  readonly loudness: LoudnessReport;
}

export function leadingSilence(stderr: string): number {
  const start = /silence_start: (-?[\d.]+)/.exec(stderr);
  if (start === null || Number(start[1]) > 0.01) return 0;
  const end = /silence_end: ([\d.]+)/.exec(stderr);
  return end === null ? Infinity : Number(end[1]);
}

/** No looping or silent padding: a take must cover the entire film. */
export function acceptMusic(report: MusicReport, videoSeconds: number): void {
  if (
    !Number.isFinite(report.durationSeconds) ||
    report.durationSeconds < videoSeconds + 2
  )
    throw new Error(
      `Music is too short: ${report.durationSeconds}s; need ${videoSeconds + 2}s`,
    );
  if (
    report.leadingSilenceSeconds > 0.3 ||
    !Number.isFinite(report.leadingSilenceSeconds)
  )
    throw new Error(
      `Music intro silence exceeds 0.3s: ${report.leadingSilenceSeconds}s`,
    );
  if (!Number.isFinite(report.loudness.i) || report.loudness.i < -60)
    throw new Error('Music is silent or too quiet');
  if (!Number.isFinite(report.loudness.tp))
    throw new Error('Music true peak is unmeasurable');
}

export interface MusicTools {
  readonly run: typeof ffmpeg;
  readonly duration: typeof mediaDuration;
}
const DEFAULT_TOOLS: MusicTools = { run: ffmpeg, duration: mediaDuration };

export async function inspectMusic(
  file: string,
  tools: MusicTools = DEFAULT_TOOLS,
): Promise<MusicReport> {
  const durationSeconds = await tools.duration(file);
  const silence = await tools.run([
    '-i',
    file,
    '-af',
    'silencedetect=noise=-50dB:d=0.05',
    '-f',
    'null',
    '-',
  ]);
  const loudness = parseLoudnorm(
    await tools.run([
      '-i',
      file,
      '-af',
      loudnormFilter(undefined, MUSIC_TARGET),
      '-f',
      'null',
      '-',
    ]),
  );
  return {
    durationSeconds,
    leadingSilenceSeconds: leadingSilence(silence),
    loudness,
  };
}

/** Re-measure the encoded MP3: codec overshoot must not escape the peak ceiling. */
export async function masterMusic(
  raw: string,
  target: string,
  videoSeconds: number,
  tools: MusicTools = DEFAULT_TOOLS,
): Promise<MusicReport> {
  const before = await inspectMusic(raw, tools);
  acceptMusic(before, videoSeconds);
  const scratch = await mkdtemp(path.join(tmpdir(), 'video-music-'));
  try {
    const dynamic = path.join(scratch, 'dynamic.wav');
    // Unseeded dynamic loudnorm lifts sparse intros. Seeding it with the
    // whole-track measured loudness suppresses that startup gain adjustment.
    await tools.run([
      '-y',
      '-i',
      raw,
      '-af',
      loudnormFilter(undefined, { ...MUSIC_TARGET, tp: -2.5 }),
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s24le',
      dynamic,
    ]);
    const shaped = await inspectMusic(dynamic, tools);
    // Only align the integrated level after shaping; do not compress it again.
    await tools.run([
      '-y',
      '-i',
      dynamic,
      '-af',
      loudnormFilter(shaped.loudness, { i: -18, tp: -2.5, lra: 11 }),
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      target,
    ]);
    const after = await inspectMusic(target, tools);
    acceptMusic(after, videoSeconds);
    if (
      Math.abs(after.loudness.i - MUSIC_TARGET.i) > 1 ||
      after.loudness.tp > MUSIC_TARGET.tp
    )
      throw new Error(
        `Music master outside targets: ${after.loudness.i} LUFS, ${after.loudness.tp} dBTP`,
      );
    return after;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
