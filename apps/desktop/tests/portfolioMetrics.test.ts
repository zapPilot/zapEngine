import { describe, expect, it } from 'vitest';

import {
  calculateWindowReturn,
  mapDailyValuesToSparkline,
  sumYieldReturns,
} from '../src/integration/portfolioMetrics';

describe('portfolioMetrics', () => {
  it('maps sparkline values in chronological order and ignores invalid totals', () => {
    expect(
      mapDailyValuesToSparkline([
        { date: '2026-06-03', total_value_usd: Number.NaN },
        { date: '2026-06-02', total_value_usd: 110 },
        { date: '2026-06-01', total_value_usd: 100 },
        { date: '2026-06-04', total_value_usd: Infinity },
        { date: '2026-06-05', total_value_usd: 125 },
      ]),
    ).toEqual([100, 110, 125]);
  });

  it('calculates window returns from the latest point to the nearest eligible start point', () => {
    const dailyValues = [
      { date: '2026-06-01', total_value_usd: 100 },
      { date: '2026-06-20', total_value_usd: 120 },
      { date: '2026-06-30', total_value_usd: 150 },
      { date: '2026-06-10', total_value_usd: 90 },
    ];

    expect(calculateWindowReturn(dailyValues, 7)).toBe(25);
    expect(calculateWindowReturn(dailyValues, 30)).toBe(50);
  });

  it('returns null for unsafe return calculations instead of emitting misleading percentages', () => {
    expect(calculateWindowReturn([], 7)).toBeNull();
    expect(
      calculateWindowReturn(
        [
          { date: 'not-a-date', total_value_usd: 100 },
          { date: 'also-not-a-date', total_value_usd: 110 },
        ],
        7,
      ),
    ).toBeNull();
    expect(
      calculateWindowReturn(
        [
          { date: '2026-06-01', total_value_usd: 0 },
          { date: '2026-06-30', total_value_usd: 110 },
        ],
        30,
      ),
    ).toBeNull();
  });

  it('sums only finite realized yield returns and returns null when none are usable', () => {
    expect(
      sumYieldReturns([
        { yield_return_usd: 1.25 },
        { yield_return_usd: Number.NaN },
        { yield_return_usd: -0.5 },
        { yield_return_usd: Infinity },
      ]),
    ).toBe(0.75);

    expect(sumYieldReturns([{ yield_return_usd: Number.NaN }, {}])).toBeNull();
  });
});
