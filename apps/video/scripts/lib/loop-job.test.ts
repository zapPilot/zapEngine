import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

import { cutLoop, decodePcm, previewBed } from './loop-job';
import { writeWav } from './wav';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  inspect: vi.fn(),
  find: vi.fn(),
}));
vi.mock('./media', () => ({ ffmpeg: mocks.run }));
vi.mock('./music-checks', () => ({ inspectMusic: mocks.inspect }));
vi.mock('./loop-finder', () => ({ findLoops: mocks.find }));

const candidate = {
  startSeconds: 1,
  periodSeconds: 2,
  bpm: 120,
  bars: 1,
  score: 0.1,
  rho: 0.5,
  levelDifferenceDb: 0,
  spectralSimilarity: 1,
  chromaSimilarity: 1,
};
const report = {
  durationSeconds: 2.2,
  leadingSilenceSeconds: 0,
  loudness: { i: -18, tp: -3, lra: 2, thresh: -28, offset: 0 },
};
let sampleCount = 105600;
beforeEach(() => {
  sampleCount = 105600;
  mocks.run.mockReset();
  mocks.inspect.mockReset();
  mocks.find.mockReset();
  mocks.inspect.mockResolvedValue(report);
  mocks.find.mockReturnValue([candidate]);
  mocks.run.mockImplementation(async (args: string[]) => {
    const target = args.at(-1)!;
    await writeFile(
      target,
      target.endsWith('.wav')
        ? writeWav({
            sampleRate: 48000,
            channels: [
              new Float64Array(sampleCount).fill(0.1),
              new Float64Array(sampleCount).fill(0.1),
            ],
          })
        : Buffer.from('mp3'),
    );
    return '';
  });
});
async function job(candidates = false) {
  const work = await mkdtemp(path.join(tmpdir(), 'loop-job-'));
  return {
    id: 'gentle-88' as const,
    sourceFile: 'source.mp3',
    sourceMetadata: {
      file: 'source.mp3',
      sha256: 'a'.repeat(64),
      model: 'original',
      prompt: 'instrumental',
      commit: 'a4c889f0f',
    },
    target: path.join(work, 'clip.mp3'),
    work,
    candidates,
    bpm: 120,
    end: 50,
  };
}
it('decodes PCM through the bundled ffmpeg', async () => {
  const input = await job();
  try {
    expect(
      (await decodePcm('source', path.join(input.work, 'decoded.wav')))
        .sampleRate,
    ).toBe(48000);
  } finally {
    await rm(input.work, { recursive: true, force: true });
  }
});
it('builds three overlapping sample-accurate preview cycles', () => {
  const source = {
    sampleRate: 48000,
    channels: [new Float64Array(105600).fill(0.1)],
  };
  const bed = previewBed(source, 60, 6, 1);
  expect(bed.channels[0]!.length).toBe(288000);
  expect(bed.channels[0]![100000]).toBeCloseTo(0.1, 10);
  expect(
    previewBed(
      { sampleRate: 48000, channels: [Float64Array.of(0.1)] },
      60,
      6,
      0,
    ).channels[0]![10000],
  ).toBe(0);
});
it('writes selected clip provenance, linear mastering, seams and beds with pending acceptance', async () => {
  const input = await job();
  try {
    await cutLoop(input);
    const metadata = JSON.parse(
      await readFile(input.target.replace('.mp3', '.json'), 'utf8'),
    );
    expect(metadata.review).toEqual({ status: 'pending' });
    expect(metadata.periodSamples).toBe(96000);
    expect(metadata.source).toEqual(input.sourceMetadata);
    expect(mocks.run.mock.calls.flat(2).join(' ')).toContain('volume=0dB');
    expect(mocks.run.mock.calls.flat(2).join(' ')).not.toContain('loudnorm');
    expect(
      await readFile(input.target.replace('.mp3', '.bed.mp3'), 'utf8'),
    ).toBe('mp3');
  } finally {
    await rm(input.work, { recursive: true, force: true });
  }
});
// The audition decodes audio through mocked ffmpeg; CI runners under
// coverage instrumentation can exceed the 5s default.
it('candidate auditions stay in the disposable workspace', async () => {
  const input = await job(true);
  try {
    mocks.find.mockReturnValue([candidate, { ...candidate, startSeconds: 2 }]);
    await cutLoop({ ...input, start: 32, bars: 4 });
    expect(
      await readFile(path.join(input.work, 'candidate-2.mp3'), 'utf8'),
    ).toBe('mp3');
  } finally {
    await rm(input.work, { recursive: true, force: true });
  }
}, 15000);
it('fails closed for no candidate, excessive rate, bad loudness, peak and truncated decoded clip', async () => {
  for (const mode of ['none', 'rate', 'loudness', 'peak', 'length']) {
    const input = await job();
    try {
      mocks.find.mockReturnValue(
        mode === 'none'
          ? []
          : [
              mode === 'rate'
                ? { ...candidate, periodSeconds: 0.117 }
                : candidate,
            ],
      );
      mocks.inspect.mockResolvedValue(
        mode === 'loudness'
          ? { ...report, loudness: { ...report.loudness, i: -20 } }
          : mode === 'peak'
            ? { ...report, loudness: { ...report.loudness, tp: -1 } }
            : report,
      );
      sampleCount = mode === 'length' ? 10000 : 105600;
      await expect(cutLoop(input)).rejects.toThrow();
    } finally {
      await rm(input.work, { recursive: true, force: true });
    }
  }
});
