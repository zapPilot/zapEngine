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
