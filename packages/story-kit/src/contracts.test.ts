import { describe, expect, it } from 'vitest';
import { cut } from './test/fixtures.js';
import {
  arcViolations,
  assertCut,
  cutViolations,
  deckCommand,
  scrollProgress,
  slideFromHash,
  slideHash,
} from './index.js';
describe('cuts and narrative contracts', () => {
  it('accepts a complete story and reports missing arc structure', () => {
    expect(arcViolations(cut.stops, cut.arc)).toEqual([]);
    expect(arcViolations([], cut.arc)).toEqual([
      'opens without an opening beat',
      'closes without an ask',
      'states the answer before a pain',
      'misses pain',
      'misses answer',
      'misses ask or alternate',
    ]);
    expect(
      arcViolations(
        [
          { id: 'a', beats: ['answer'] },
          { id: 'a', beats: [] },
          { id: 'z', beats: ['pain', 'pain', 'hero', 'hero'] },
        ],
        cut.arc,
      ),
    ).toEqual([
      'opens without an opening beat',
      'closes without an ask',
      'states the answer before a pain',
      'misses ask or alternate',
      'repeats pain',
      'a is empty',
      'repeats group a',
    ]);
    expect(
      arcViolations(
        [
          { id: 'pain', beats: ['pain'] },
          { id: 'ask', beats: ['ask'] },
        ],
        { ...cut.arc, required: [] },
      ),
    ).toEqual([]);
  });
  it('rejects invalid dimensions, stop order and fade boundaries', () => {
    expect(cutViolations(cut)).toEqual([]);
    expect(() => assertCut(cut)).not.toThrow();
    const invalid = {
      ...cut,
      duration: 0,
      fps: NaN,
      width: -1,
      height: Infinity,
      poster: -1,
    };
    expect(cutViolations(invalid)).toContain('poster is outside the cut');
    expect(() => assertCut(invalid)).toThrow('Invalid cut test');
    expect(cutViolations({ ...cut, poster: NaN })).toContain(
      'poster is outside the cut',
    );
    expect(cutViolations({ ...cut, poster: 49 })).toContain(
      'poster is outside the cut',
    );
    expect(
      cutViolations({
        ...cut,
        stops: [
          { ...cut.stops[0]!, time: NaN },
          { ...cut.stops[1]!, time: -1 },
          { ...cut.stops[2]!, time: 49 },
        ],
      }),
    ).toContain('ask is outside the cut');
    expect(
      cutViolations({ ...cut, stops: [...cut.stops].reverse() }),
    ).toContain('answer is not strictly increasing');
    for (const patch of [
      { from: NaN },
      { from: 48 },
      { fadeIn: -1 },
      { fadeOut: -1 },
      { fadeIn: 30, fadeOut: 30 },
    ]) {
      expect(
        cutViolations({ ...cut, windows: [{ ...cut.windows[0]!, ...patch }] }),
      ).toContain('all has an invalid scene window');
    }
    for (const time of [0.5, 47.5]) {
      const violations = cutViolations({
        ...cut,
        stops: [{ ...cut.stops[0]!, time }],
      });
      expect(violations).toContain('pain is outside a settled scene');
      expect(violations).toContain('pain overlaps a fade');
    }
  });
  it('maps keys, section travel and explicit slide hashes', () => {
    expect(
      [
        'ArrowLeft',
        'ArrowUp',
        'PageUp',
        'ArrowRight',
        'ArrowDown',
        'PageDown',
        ' ',
        'Home',
        'End',
        'x',
      ].map(deckCommand),
    ).toEqual([
      'prev',
      'prev',
      'prev',
      'next',
      'next',
      'next',
      'toggle',
      'first',
      'last',
      null,
    ]);
    expect(slideHash(6)).toBe('#slide-07');
    expect(
      ['#slide-07', '#slide-00', '#slide-15', '#other'].map((hash) =>
        slideFromHash(hash, 14),
      ),
    ).toEqual([6, null, null, null]);
    expect(scrollProgress(-100, 300, 100)).toBe(0.5);
    expect(scrollProgress(100, 100, 200)).toBe(0);
    expect(scrollProgress(-1, 100, 200)).toBe(1);
  });
});
