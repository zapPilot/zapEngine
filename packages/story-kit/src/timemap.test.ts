import { expect, it } from 'vitest';
import {
  clockAt,
  cutDuration,
  holdMap,
  identityMap,
  storyAt,
} from './index.js';
it('holds story time while clock time advances, including arrival/departure endpoints', () => {
  const map = holdMap(48, [
    { story: 20.5, extra: 3 },
    { story: 10, extra: 2 },
  ]);
  expect(cutDuration(map)).toBe(53);
  expect(
    [0, 10, 11, 12, 20, 22.5, 24, 25.5, 53, 60, -1].map((c) => storyAt(map, c)),
  ).toEqual([0, 10, 10, 10, 18, 20.5, 20.5, 20.5, 48, 48, 0]);
  expect(clockAt(map, 20.5)).toBe(22.5);
  expect(clockAt(map, 20.5, 'departure')).toBe(25.5);
  expect(clockAt(map, 60)).toBe(53);
  expect(clockAt(map, -1)).toBe(0);
  const identity = identityMap(48);
  expect(storyAt(identity, 10)).toBe(10);
  expect(clockAt(identity, 10)).toBe(10);
  for (let s = 0; s <= 48; s += 0.25) {
    expect(storyAt(map, clockAt(map, s))).toBeCloseTo(s);
  }
});
it('fails closed on invalid holds and duration limits', () => {
  for (const duration of [0, -1, NaN, Infinity]) {
    expect(() => holdMap(duration, [])).toThrow();
  }
  expect(() => holdMap(48, [], Infinity)).toThrow();
  expect(() => holdMap(48, [], 60, -1)).toThrow();
  expect(() => holdMap(48, [], 60, NaN)).toThrow();
  for (const hold of [
    { story: NaN, extra: 0 },
    { story: -1, extra: 0 },
    { story: 49, extra: 0 },
    { story: 10, extra: NaN },
    { story: 10, extra: -1 },
    { story: 10, extra: 3.6 },
  ]) {
    expect(() => holdMap(48, [hold])).toThrow();
  }
  expect(() =>
    holdMap(48, [
      { story: 10, extra: 1 },
      { story: 10, extra: 2 },
    ]),
  ).toThrow('Duplicate');
  expect(() =>
    holdMap(
      48,
      [10, 20, 30, 40].map((story) => ({ story, extra: 3.5 })),
    ),
  ).toThrow('maximum duration');
});
