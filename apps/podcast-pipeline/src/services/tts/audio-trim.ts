import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ffmpeg } from '../../lib/ffmpeg.js';

const EDGE_TOLERANCE_S = 0.05;
const RETAIN_S = 0.06;

export function parseSpeechBounds(
  stderrLines: string[],
  durationS: number,
): { startS: number; endS: number } | null {
  let startS = 0;
  let endS = durationS;
  let silenceStart: number | null = null;
  for (const line of stderrLines) {
    const start = /silence_start:\s*([\d.]+)/.exec(line);
    if (start) silenceStart = Number(start[1]);
    const end = /silence_end:\s*([\d.]+)/.exec(line);
    if (!end || silenceStart === null) continue;
    const silenceEnd = Number(end[1]);
    if (silenceStart <= EDGE_TOLERANCE_S) startS = silenceEnd;
    if (silenceEnd >= durationS - EDGE_TOLERANCE_S) endS = silenceStart;
    silenceStart = null;
  }
  if (silenceStart !== null) endS = silenceStart;
  if (startS >= endS) return null;
  return {
    startS: Math.max(0, startS - RETAIN_S),
    endS: Math.min(durationS, endS + RETAIN_S),
  };
}

function durationFromLines(lines: string[]): number {
  for (const line of lines) {
    const match = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(line);
    if (match)
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  throw new Error('Cannot determine MP3 duration for speech trim');
}

async function inAudioWorkspace<T>(
  fn: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'speech-trim-'));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

function saveMp3(
  command: ReturnType<typeof ffmpeg>,
  output: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => resolve())
      .on('error', reject)
      .save(output);
  });
}

export async function trimMp3Silence(audio: Buffer): Promise<Buffer> {
  return inAudioWorkspace(async (directory) => {
    const input = join(directory, 'source.mp3');
    await writeFile(input, audio);
    const lines: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .audioFilters('asetpts=PTS-STARTPTS,silencedetect=noise=-50dB:d=0.08')
        .format('null')
        .on('stderr', (line) => lines.push(line))
        .on('end', () => resolve())
        .on('error', reject)
        .save('/dev/null');
    });
    const durationS = durationFromLines(lines);
    const bounds = parseSpeechBounds(lines, durationS);
    if (!bounds) throw new Error('MP3 has no speech');
    if (bounds.startS === 0 && bounds.endS === durationS) return audio;
    const output = join(directory, 'trimmed.mp3');
    await saveMp3(
      ffmpeg(input).audioFilters(
        `atrim=start=${bounds.startS}:end=${bounds.endS},asetpts=PTS-STARTPTS`,
      ),
      output,
    );
    return readFile(output);
  });
}

export async function createSilentMp3(ms: number): Promise<Buffer> {
  return inAudioWorkspace(async (directory) => {
    const output = join(directory, 'pause.mp3');
    await saveMp3(
      ffmpeg()
        .input('anullsrc=channel_layout=mono:sample_rate=44100')
        .inputFormat('lavfi')
        .duration(ms / 1000),
      output,
    );
    return readFile(output);
  });
}
