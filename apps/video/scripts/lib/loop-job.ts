import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MusicLoop } from '../../src/music/loop';
import { bedCopies, copyGain } from '../../src/primitives/music-bed';
import { sampleAt, seamMetrics } from './dsp';
import { findLoops, type LoopCandidate } from './loop-finder';
import { ffmpeg } from './media';
import { inspectMusic } from './music-checks';
import { type Pcm, readWav, stereoMono, writeWav } from './wav';

export async function decodePcm(file: string, target: string): Promise<Pcm> {
  await ffmpeg([
    '-y',
    '-i',
    file,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    target,
  ]);
  return readWav(await readFile(target));
}
export function previewBed(
  pcm: Pcm,
  period: number,
  crossfade: number,
  rho: number,
  duration = 3 * period,
): Pcm {
  const frames = duration,
    copies = bedCopies(frames, period, crossfade);
  const channels = pcm.channels.map((source) => {
    const result = new Float64Array(frames * 1600);
    for (const copy of copies)
      for (let i = 0; i < copy.durationInFrames * 1600; i++)
        result[copy.from * 1600 + i] =
          sampleAt(result, copy.from * 1600 + i) +
          (source[i] ?? 0) * copyGain(i / 1600, copy, period, crossfade, rho);
    return result;
  });
  return { sampleRate: pcm.sampleRate, channels };
}
export async function cutLoop(input: {
  id: MusicLoop['id'];
  sourceFile: string;
  sourceMetadata: MusicLoop['source'];
  target: string;
  work: string;
  candidates: boolean;
  start?: number;
  bars?: number;
  bpm: number;
  end: number;
}): Promise<void> {
  await mkdir(input.work, { recursive: true });
  const pcm = await decodePcm(
    input.sourceFile,
    path.join(input.work, 'source.wav'),
  );
  const mono = stereoMono(pcm);
  const candidates = findLoops(mono, pcm.sampleRate, input.bpm, {
    start: input.start ?? 30,
    end: input.end,
    bars: input.bars ?? 8,
  });
  await writeFile(
    path.join(input.work, 'candidates.json'),
    JSON.stringify(candidates, null, 2) + '\n',
  );
  if (candidates.length === 0)
    throw new Error(
      'No candidate passed seam thresholds; try --start or --bars 4',
    );
  const selected = input.candidates ? candidates : candidates.slice(0, 1);
  for (const [index, candidate] of selected.entries()) {
    const target = input.candidates
      ? path.join(input.work, `candidate-${index + 1}.mp3`)
      : input.target;
    await renderLoop(input, candidate, target);
  }
}
async function renderLoop(
  input: Parameters<typeof cutLoop>[0],
  candidate: LoopCandidate,
  target: string,
): Promise<void> {
  const periodFrames = Math.round(candidate.periodSeconds * 30),
    crossfadeFrames = 6,
    // Rate correction resamples, which can drop a few trailing samples; one
    // spare frame keeps period + crossfade covered. Beds and seams never read it.
    spareFrames = 1;
  const rate = candidate.periodSeconds / (periodFrames / 30);
  if (Math.abs(rate - 1) > 0.002)
    throw new Error(
      'Loop tempo correction exceeds 0.2%; choose another region',
    );
  const raw = path.join(input.work, 'clip.wav');
  await ffmpeg([
    '-y',
    '-ss',
    String(candidate.startSeconds),
    '-i',
    input.sourceFile,
    '-t',
    String(
      candidate.periodSeconds + ((crossfadeFrames + spareFrames) / 30) * rate,
    ),
    '-af',
    `asetrate=${48000 * rate},aresample=48000`,
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    raw,
  ]);
  const before = await inspectMusic(raw);
  const gainDb = Math.min(-18 - before.loudness.i, -2.5 - before.loudness.tp);
  await ffmpeg([
    '-y',
    '-i',
    raw,
    '-af',
    `volume=${gainDb}dB`,
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
  const report = await inspectMusic(target);
  if (Math.abs(report.loudness.i + 18) > 1 || report.loudness.tp > -2)
    throw new Error('Linear loop master outside loudness targets');
  const decoded = await decodePcm(
    target,
    path.join(input.work, 'clip-decoded.wav'),
  );
  if (stereoMono(decoded).length < (periodFrames + crossfadeFrames) * 1600)
    throw new Error('Encoded clip too short');
  const metrics = seamMetrics(
    stereoMono(decoded),
    periodFrames * 1600,
    crossfadeFrames * 1600,
    48000,
  );
  const { rho, ...seam } = metrics;
  const sha256 = createHash('sha256')
    .update(await readFile(target))
    .digest('hex');
  const metadata: MusicLoop = {
    id: input.id,
    sha256,
    sampleRate: 48000,
    fps: 30,
    periodSamples: periodFrames * 1600,
    crossfadeSamples: crossfadeFrames * 1600,
    rho,
    source: input.sourceMetadata,
    cut: {
      startSeconds: candidate.startSeconds,
      periodSeconds: candidate.periodSeconds,
      bpm: candidate.bpm,
      bars: candidate.bars,
    },
    rate,
    cents: 1200 * Math.log2(rate),
    gainDb,
    seam,
    report,
    review: { status: 'pending' },
  };
  await writeFile(
    target.replace(/\.mp3$/, '.json'),
    JSON.stringify(metadata, null, 2) + '\n',
  );
  const bed = previewBed(decoded, periodFrames, crossfadeFrames, rho);
  const bedFile = target.replace(/\.mp3$/, '.bed.wav');
  await writeFile(bedFile, writeWav(bed));
  await ffmpeg([
    '-y',
    '-i',
    bedFile,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    target.replace(/\.mp3$/, '.bed.mp3'),
  ]);
  const seamPreview = {
    sampleRate: 48000,
    channels: bed.channels.map((c) => {
      const window = 48000;
      const result = new Float64Array(window * 6);
      for (let k = 0; k < 3; k++)
        result.set(
          c.subarray(
            periodFrames * 1600 - window,
            periodFrames * 1600 + window,
          ),
          k * window * 2,
        );
      return result;
    }),
  };
  const seamFile = target.replace(/\.mp3$/, '.seams.wav');
  await writeFile(seamFile, writeWav(seamPreview));
  await ffmpeg([
    '-y',
    '-i',
    seamFile,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    target.replace(/\.mp3$/, '.seams.mp3'),
  ]);
  console.log(
    `✓ ${target}: ${periodFrames} frames, ${metadata.cents.toFixed(3)} cents, review pending`,
  );
}
