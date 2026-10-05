import { expect, it, vi } from 'vitest';

import { inspectMusic, leadingSilence, MUSIC_TARGET } from './music-checks';

it('parses initial silence without confusing later pauses', () => {
  expect(leadingSilence('')).toBe(0);
  expect(leadingSilence('silence_start: 2\nsilence_end: 3')).toBe(0);
  expect(leadingSilence('silence_start: 0\nsilence_end: 0.2')).toBe(0.2);
  expect(leadingSilence('silence_start: 0')).toBe(Infinity);
});
it('inspects duration, initial silence and loudness through the shared tools', async () => {
  const loudness = {
    input_i: -18,
    input_tp: -3,
    input_lra: 3,
    input_thresh: -28,
    target_offset: 0,
  };
  const tools = {
    duration: vi.fn().mockResolvedValue(22),
    run: vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(JSON.stringify(loudness)),
  };
  expect(await inspectMusic('clip', tools)).toEqual({
    durationSeconds: 22,
    leadingSilenceSeconds: 0,
    loudness: { i: -18, tp: -3, lra: 3, thresh: -28, offset: 0 },
  });
  expect(MUSIC_TARGET).toEqual({ i: -18, tp: -2, lra: 3 });
});
it('inspects the real selected loop with the bundled ffmpeg', async () => {
  const path = await import('node:path');
  const { publicDir } = await import('./paths');
  expect(
    (await inspectMusic(path.join(publicDir, 'music/gentle-88.mp3'))).loudness
      .i,
  ).toBeCloseTo(-18, 0);
}, 60000);
