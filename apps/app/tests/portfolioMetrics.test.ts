import { describe, expect, it } from 'vitest';

import {
  calculateAdjacentSnapshotChange,
  calculateWindowValueChangePct,
  nearestTrendPointIndex,
  snapshotCategoryTotals,
  toTrendPoints,
  trendPointX,
} from '@/integration/portfolioMetrics';

describe('portfolioMetrics', () => {
  it('keeps complete trend points in chronological order and ignores invalid totals', () => {
    expect(
      toTrendPoints([
        { date: '2026-06-03', total_value_usd: Number.NaN },
        {
          date: '2026-06-02',
          total_value_usd: 110,
          categories: [{ assets_usd: 120, debt_usd: 10 }],
        },
        { date: '2026-06-01', total_value_usd: 100 },
        { date: '2026-06-04', total_value_usd: Infinity },
        { date: '2026-06-05', total_value_usd: 125 },
      ]),
    ).toEqual([
      { date: '2026-06-01', total_value_usd: 100 },
      {
        date: '2026-06-02',
        total_value_usd: 110,
        categories: [{ assets_usd: 120, debt_usd: 10 }],
      },
      { date: '2026-06-05', total_value_usd: 125 },
    ]);
  });

  it('calculates window value change from the nearest eligible start point', () => {
    const dailyValues = [
      { date: '2026-06-01', total_value_usd: 100 },
      { date: '2026-06-20', total_value_usd: 120 },
      { date: '2026-06-30', total_value_usd: 150 },
      { date: '2026-06-10', total_value_usd: 90 },
    ];

    expect(calculateWindowValueChangePct(dailyValues, 7)).toBe(25);
    expect(calculateWindowValueChangePct(dailyValues, 30)).toBe(50);
  });

  it('returns null for unsafe value-change calculations', () => {
    expect(calculateWindowValueChangePct([], 7)).toBeNull();
    expect(
      calculateWindowValueChangePct(
        [
          { date: 'not-a-date', total_value_usd: 100 },
          { date: 'also-not-a-date', total_value_usd: 110 },
        ],
        7,
      ),
    ).toBeNull();
    expect(
      calculateWindowValueChangePct(
        [
          { date: '2026-06-01', total_value_usd: 0 },
          { date: '2026-06-30', total_value_usd: 110 },
        ],
        30,
      ),
    ).toBeNull();
  });

  it('derives portfolio change only from adjacent finite snapshots', () => {
    const points = [
      { total_value_usd: 100 },
      { total_value_usd: 125 },
      { total_value_usd: Number.NaN },
    ];
    expect(calculateAdjacentSnapshotChange(points, 1)).toEqual({
      usd: 25,
      pct: 25,
    });
    expect(calculateAdjacentSnapshotChange(points, 0)).toBeNull();
    expect(calculateAdjacentSnapshotChange(points, 2)).toBeNull();
    expect(
      calculateAdjacentSnapshotChange([{ total_value_usd: 100 }]),
    ).toBeNull();
  });

  it('sums gross assets and debt across categories and ignores non-finite fields', () => {
    expect(
      snapshotCategoryTotals({
        total_value_usd: 125,
        categories: [
          { assets_usd: 100, debt_usd: 10 },
          { assets_usd: 50, debt_usd: 15 },
          { assets_usd: Number.NaN, debt_usd: Infinity },
        ],
      }),
    ).toEqual({ assetsUsd: 150, debtUsd: 25 });
    expect(snapshotCategoryTotals({ total_value_usd: 125 })).toEqual({});
    expect(
      snapshotCategoryTotals({
        total_value_usd: 0,
        categories: [{ assets_usd: 0, debt_usd: 0 }],
      }),
    ).toEqual({ assetsUsd: 0, debtUsd: 0 });
  });

  it('selects and positions the nearest marker inside chart bounds', () => {
    expect(nearestTrendPointIndex(-20, 100, 5)).toBe(0);
    expect(nearestTrendPointIndex(51, 100, 5)).toBe(2);
    expect(nearestTrendPointIndex(200, 100, 5)).toBe(4);
    expect(nearestTrendPointIndex(20, 0, 5)).toBeNull();
    expect(nearestTrendPointIndex(Number.NaN, 100, 5)).toBeNull();
    expect(trendPointX(0, 100, 5)).toBe(0);
    expect(trendPointX(4, 100, 5)).toBe(100);
    expect(trendPointX(9, 100, 5)).toBe(100);
  });
});
