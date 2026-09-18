import { describe, expect, it, vi } from 'vitest';
import {
  count,
  elapsedFromMinutes,
  money,
  percent,
  plural,
  seriesAndDelta,
  signedCount,
  signedPercent,
} from './format.js';

describe('coverage handoff: statement formatter boundaries', () => {
  it.each([
    [() => money(Number.NaN), '—'],
    [() => count(Number.POSITIVE_INFINITY), '—'],
    [() => percent(Number.NEGATIVE_INFINITY), '—'],
    [() => signedPercent(null), '—'],
  ])('renders unusable numeric input as unavailable', (format, expected) => {
    expect(format()).toBe(expected);
  });

  it('formats every signed direction explicitly', () => {
    expect(signedPercent(0.01)).toBe('+1%');
    expect(signedPercent(-0.01)).toBe('-1%');
    expect(signedPercent(0)).toBe('±0%');
    expect(signedCount(0)).toBe('±0');
    expect(signedCount(2)).toBe('+2');
    expect(signedCount(-2)).toBe('-2');
  });

  it('formats minute and hour boundaries without negative ages', () => {
    expect(elapsedFromMinutes(Number.NaN)).toBeNull();
    expect(elapsedFromMinutes(-3)).toBe('0m');
    expect(elapsedFromMinutes(60)).toBe('1h');
    expect(elapsedFromMinutes(61)).toBe('1h 1m');
  });

  it('supports irregular plurals', () => {
    expect(plural(1, 'person', 'people')).toBe('person');
    expect(plural(2, 'person', 'people')).toBe('people');
    expect(plural(2, 'item')).toBe('items');
  });

  it('caps collection progress and covers positive, negative, and flat deltas', () => {
    const tone = vi.fn(() => 'good' as const);
    expect(
      seriesAndDelta(
        new Map([
          ['pending', { rowCount: 99, series: [1], delta7d: null }],
        ]) as never,
        'pending',
        tone,
      ),
    ).toEqual({ series: [1], delta: 'collecting (7/7)', deltaTone: 'neutral' });

    for (const [delta, label] of [
      [2, '+2.0 · 7d'],
      [-2, '-2.0 · 7d'],
      [0, '±0.0 · 7d'],
    ] as const) {
      expect(
        seriesAndDelta(
          new Map([
            ['ready', { rowCount: 8, series: [1, 2], delta7d: delta }],
          ]) as never,
          'ready',
          tone,
          1,
        ).delta,
      ).toBe(label);
    }
    expect(tone).toHaveBeenCalledTimes(3);
  });
});
