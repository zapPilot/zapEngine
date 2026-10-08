import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  easeInOutCubic,
  progress,
  fadeWindow,
  keyframes,
  wrap,
  signedPercent,
} from './index.js';
describe('timeline mathematics', () => {
  it('clamps, interpolates and eases each half', () => {
    expect([clamp(-1), clamp(0.5), clamp(2), clamp(5, 2, 4)]).toEqual([
      0, 0.5, 1, 4,
    ]);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect([
      easeInOutCubic(0),
      easeInOutCubic(0.25),
      easeInOutCubic(0.5),
      easeInOutCubic(1),
    ]).toEqual([0, 0.0625, 0.5, 1]);
    expect([
      progress(0, 2, 4),
      progress(3, 2, 4),
      progress(5, 2, 4),
      progress(1, 2, 2),
      progress(2, 2, 2),
    ]).toEqual([0, 0.5, 1, 0, 1]);
    expect([
      fadeWindow(0, 1, 5, 1, 1),
      fadeWindow(1.5, 1, 5, 1, 1),
      fadeWindow(3, 1, 5, 1, 1),
      fadeWindow(4.5, 1, 5, 1, 1),
    ]).toEqual([0, 0.5, 1, 0.5]);
    expect(wrap(-1, 14)).toBe(13);
    expect([signedPercent(2), signedPercent(-2)]).toEqual(['+2.00%', '−2.00%']);
  });
  it('interpolates keyframes with bounded endpoints and rejects malformed data', () => {
    const frames = [
      [0, 0],
      [2, 10],
      [4, 20],
    ] as const;
    expect([-1, 1, 3, 5].map((t) => keyframes(t, frames))).toEqual([
      0, 5, 15, 20,
    ]);
    for (const invalid of [
      [],
      [[NaN, 0]],
      [[0, Infinity]],
      [
        [0, 0],
        [0, 1],
      ],
      [
        [1, 0],
        [0, 1],
      ],
    ] as const) {
      expect(() => keyframes(0, invalid)).toThrow();
    }
  });
});
