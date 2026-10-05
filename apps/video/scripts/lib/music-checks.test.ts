import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  acceptMusic,
  inspectMusic,
  leadingSilence,
  masterMusic,
  MUSIC_TARGET,
  type MusicReport,
} from './music-checks';
import { publicDir } from './paths';

const good: MusicReport = {
  durationSeconds: 90,
  leadingSilenceSeconds: 0,
  loudness: { i: -18, tp: -3, lra: 3, thresh: -28, offset: 0 },
};
const report = (i = -18, tp = -3) =>
  JSON.stringify({
    input_i: i,
    input_tp: tp,
    input_lra: 3,
    input_thresh: -28,
    target_offset: 0,
  });
const tools = () => ({
  duration: vi.fn().mockResolvedValue(90),
  run: vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce(report()),
});
describe('music acceptance', () => {
  it('accepts exact boundaries', () =>
    expect(() =>
      acceptMusic(
        { ...good, durationSeconds: 74, leadingSilenceSeconds: 0.3 },
        72,
      ),
    ).not.toThrow());
  it.each([0, 73.99, NaN])(
    'rejects short or invalid duration %s',
    (durationSeconds) =>
      expect(() => acceptMusic({ ...good, durationSeconds }, 72)).toThrow(
        'too short',
      ),
  );
  it.each([0.301, Infinity, NaN])(
    'rejects excessive or invalid intro silence %s',
    (leadingSilenceSeconds) =>
      expect(() => acceptMusic({ ...good, leadingSilenceSeconds }, 72)).toThrow(
        'intro silence',
      ),
  );
  it.each([-61, -Infinity, NaN])('rejects silent input %s', (i) =>
    expect(() =>
      acceptMusic({ ...good, loudness: { ...good.loudness, i } }, 72),
    ).toThrow('silent'),
  );
  it('rejects unmeasurable true peak', () =>
    expect(() =>
      acceptMusic({ ...good, loudness: { ...good.loudness, tp: NaN } }, 72),
    ).toThrow('true peak'));
  it('parses initial silence without confusing later pauses', () => {
    expect(leadingSilence('')).toBe(0);
    expect(leadingSilence('silence_start: 2\nsilence_end: 3')).toBe(0);
    expect(leadingSilence('silence_start: 0\nsilence_end: 0.2')).toBe(0.2);
    expect(leadingSilence('silence_start: 0')).toBe(Infinity);
  });
  it('inspects duration, silence and measured loudness', async () =>
    expect(await inspectMusic('raw', tools())).toEqual(good));
  it('masters to stereo 48k and validates the encoded result', async () => {
    const ops = {
      duration: vi.fn().mockResolvedValue(90),
      run: vi
        .fn()
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report()),
    };
    expect(await masterMusic('raw', 'master', 72, ops)).toEqual(good);
    expect(ops.run.mock.calls[5]?.[0]).toEqual(
      expect.arrayContaining(['48000', '2', '192k', 'master']),
    );
  });
  it.each([
    [-20, -3],
    [-18, -1],
  ])('rejects masters outside LUFS/peak (%s,%s)', async (i, tp) => {
    const ops = {
      duration: vi.fn().mockResolvedValue(90),
      run: vi
        .fn()
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(report(i, tp)),
    };
    await expect(masterMusic('raw', 'master', 72, ops)).rejects.toThrow(
      'outside targets',
    );
  });
  // Real-tools acceptance: ~10 Remotion ffmpeg runs including two full
  // encodes of the 86s asset (~32s locally, ~10x slower on CI + coverage).
  it(
    'uses the real bundled media tools by default',
    { timeout: 300000 },
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'music-check-'));
      try {
        const src = path.join(publicDir, 'music/kokode-clinic.mp3');
        const measured = await inspectMusic(src);
        expect(measured.durationSeconds).toBeGreaterThan(83.33);
        const mastered = await masterMusic(
          src,
          path.join(dir, 'test.mp3'),
          81.33,
        );
        expect(mastered.loudness.tp).toBeLessThanOrEqual(MUSIC_TARGET.tp);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
