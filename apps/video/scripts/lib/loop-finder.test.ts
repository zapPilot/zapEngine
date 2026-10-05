import { expect, it } from 'vitest';

import { findLoops } from './loop-finder';

// FFT search covers real-duration audio and is slower under coverage instrumentation.
const sr = 12000;
const samples = Float64Array.from(
  { length: sr * 24 },
  (_, i) =>
    Math.sin((2 * Math.PI * 440 * i) / sr) *
    (0.1 + (i % (sr / 2) < 300 ? 0.1 : 0)),
);
it('ranks repeatable beat-aligned candidates in a bounded region', () => {
  const candidates = findLoops(samples, sr, 120, {
    start: 2,
    end: 22,
    bars: 4,
  });
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.length).toBeLessThanOrEqual(5);
  for (const candidate of candidates) {
    expect(candidate.startSeconds).toBeGreaterThanOrEqual(2);
    expect(
      candidate.startSeconds + candidate.periodSeconds + 0.2,
    ).toBeLessThanOrEqual(22);
    expect(candidate.levelDifferenceDb).toBeLessThanOrEqual(3);
  }
  expect(findLoops(samples, sr, 120).length).toBeGreaterThan(0);
}, 20000);
it('rejects silence, short regions and invalid inputs', () => {
  expect(
    findLoops(new Float64Array(samples.length), sr, 120, { start: 2, end: 22 }),
  ).toEqual([]);
  expect(findLoops(samples, sr, 120, { start: 2, end: 3 })).toEqual([]);
  for (const options of [
    { bars: 0 },
    { bars: 1.5 },
    { start: -1 },
    { end: 100 },
    { start: 10, end: 5 },
  ])
    expect(() => findLoops(samples, sr, 120, options)).toThrow();
  expect(() => findLoops(samples, 0, 120)).toThrow();
  expect(findLoops(samples, 1000, 120, { start: 2, end: 22, bars: 1 })).toEqual(
    [],
  );
}, 20000);
it('discards harmonically incompatible seams and prefers the longest stable region', () => {
  const chirp = Float64Array.from(
    { length: sr * 24 },
    (_, i) =>
      0.1 * Math.sin(2 * Math.PI * ((220 * i) / sr + 80 * (i / sr) ** 2)),
  );
  expect(findLoops(chirp, sr, 120, { start: 2, end: 22, bars: 4 })).toEqual([]);
  const changing = Float64Array.from(
    samples,
    (x, i) =>
      x *
      ([12, 16, 20, 23].reduce((n, s) => n + (i / sr >= s ? 1 : 0), 0) % 2
        ? 10
        : 1),
  );
  for (const candidate of findLoops(changing, sr, 120, { bars: 4 }))
    expect(
      candidate.startSeconds + candidate.periodSeconds + 0.2,
    ).toBeLessThanOrEqual(12);
}, 20000);
