import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  buildHomeIncomeView,
  MIN_OBSERVED_DAYS,
} from '@/integration/homeIncomeModel';

function summary(
  breakdown: {
    protocol: string;
    chain?: string;
    averageDaily: number;
  }[],
  observedDays = 30,
  windowKey = '30d',
): YieldReturnsSummaryResponse {
  return {
    user_id: 'user',
    windows: {
      [windowKey]: {
        user_id: 'user',
        period: { start_date: '2026-07-01', end_date: '2026-07-30', days: 30 },
        average_daily_yield_usd: 0,
        median_daily_yield_usd: 1.5,
        total_yield_usd: 0,
        statistics: {
          mean: 0,
          median: 1.5,
          std_dev: 0,
          min_value: 0,
          max_value: 0,
          total_days: observedDays,
          filtered_days: observedDays,
          outliers_removed: 0,
        },
        outlier_strategy: 'iqr',
        outliers_detected: [],
        protocol_breakdown: breakdown.map((item) => ({
          protocol: item.protocol,
          chain: item.chain,
          window: {
            total_yield_usd: item.averageDaily * observedDays,
            average_daily_yield_usd: item.averageDaily,
            data_points: observedDays,
            positive_days: item.averageDaily > 0 ? observedDays : 0,
            negative_days: item.averageDaily < 0 ? observedDays : 0,
          },
          today: null,
        })),
      },
    },
  };
}

describe('buildHomeIncomeView', () => {
  it('excludes strategy protocols from passive income', () => {
    const result = buildHomeIncomeView(
      summary([
        { protocol: 'Morpho', averageDaily: 2 },
        { protocol: 'GMX V2', averageDaily: 3 },
        { protocol: 'hyperliquid', averageDaily: -1 },
      ]),
    );

    expect(result.status).toBe('ready');
    expect(result.passiveMonthlyUsd).toBeCloseTo(60.8);
    expect(result).not.toHaveProperty('strategyRows');
  });

  it('marks fewer than seven observed days as insufficient', () => {
    const result = buildHomeIncomeView(
      summary([{ protocol: 'Morpho', averageDaily: 2 }], MIN_OBSERVED_DAYS - 1),
    );
    expect(result.status).toBe('insufficient');
  });

  it('returns empty for no breakdown or a missing window', () => {
    expect(buildHomeIncomeView(summary([])).status).toBe('empty');
    expect(buildHomeIncomeView(summary([], 30, '7d'))).toEqual(
      expect.objectContaining({ status: 'empty', observedDays: 0 }),
    );
  });
});
