import { expect, it } from 'vitest';

import { bedCopies, copyGain, crossfadeGain } from './music-bed';

it('places overlapping clips without MP3 loop restarts', () => {
  expect(bedCopies(160, 60, 6)).toEqual([
    { from: 0, durationInFrames: 66, fadeIn: false, fadeOut: true },
    { from: 60, durationInFrames: 66, fadeIn: true, fadeOut: true },
    { from: 120, durationInFrames: 40, fadeIn: true, fadeOut: false },
  ]);
  expect(bedCopies(20, 60, 6)).toEqual([
    { from: 0, durationInFrames: 20, fadeIn: false, fadeOut: false },
  ]);
  for (const args of [
    [0, 60, 6],
    [10, 0, 6],
    [10, 60, 0],
    [10, 60, 60],
    [10.5, 60, 6],
  ])
    expect(() => bedCopies(...(args as [number, number, number]))).toThrow();
});
it('keeps crossfade energy constant for uncorrelated material and level constant for correlated material', () => {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    expect(crossfadeGain(t, 0) ** 2 + crossfadeGain(1 - t, 0) ** 2).toBeCloseTo(
      1,
      10,
    );
    expect(crossfadeGain(t, 1)).toBeCloseTo(t, 10);
    const a = crossfadeGain(t, 0.5),
      b = crossfadeGain(1 - t, 0.5);
    expect(a * a + b * b + a * b).toBeCloseTo(1, 10);
  }
  expect(crossfadeGain(-1, 0)).toBe(0);
  expect(crossfadeGain(2, 0)).toBe(1);
  for (const args of [
    [NaN, 0],
    [0, NaN],
    [0, -1],
    [0, 2],
  ])
    expect(() => crossfadeGain(...(args as [number, number]))).toThrow();
});
it('fades only the overlapping edges; the first and last copies keep their outer edges', () => {
  const copies = bedCopies(160, 60, 6);
  expect(copyGain(0, copies[0]!, 60, 6, 1)).toBe(1);
  expect(copyGain(63, copies[0]!, 60, 6, 1)).toBe(0.5);
  expect(copyGain(3, copies[1]!, 60, 6, 1)).toBe(0.5);
  expect(copyGain(30, copies[1]!, 60, 6, 1)).toBe(1);
  expect(copyGain(63, copies[2]!, 60, 6, 1)).toBe(1);
});
