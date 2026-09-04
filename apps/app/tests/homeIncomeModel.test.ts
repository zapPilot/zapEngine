import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  buildHomeIncomeView,
  MIN_DISPLAY_MONTHLY_USD,
  MIN_OBSERVED_DAYS,
} from '@/integration/homeIncomeModel';

function summary(
  breakdown: {
    protocol: string;
    chain?: string;
    averageDaily: number;
    tokenSymbols?: string[];
    positionTypes?: string[];
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
          token_symbols: item.tokenSymbols,
          position_types: item.positionTypes,
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
  it('groups gains before costs, sorts each side by impact, and preserves position metadata', () => {
    const result = buildHomeIncomeView(
      summary([
        { protocol: 'Moonwell', chain: 'base', averageDaily: 0.5 },
        {
          protocol: 'Morpho',
          chain: 'ethereum',
          averageDaily: 2,
          tokenSymbols: ['USDC', 'WETH'],
          positionTypes: ['Lending'],
        },
        { protocol: 'GMX V2', averageDaily: 3 },
        { protocol: 'Aave', chain: 'arbitrum', averageDaily: -0.25 },
        { protocol: 'Morpho', chain: 'arbitrum', averageDaily: -1 },
        { protocol: 'hyperliquid', averageDaily: -1 },
      ]),
    );

    expect(result.status).toBe('ready');
    expect(result.incomeMonthlyUsd).toBeCloseTo(76);
    expect(result.costMonthlyUsd).toBeCloseTo(-38);
    expect(result.passiveMonthlyUsd).toBeCloseTo(38);
    expect(result.protocolRows).toEqual([
      expect.objectContaining({
        protocol: 'Morpho',
        chain: 'ethereum',
        monthlyNetUsd: 60.8,
        tokenSymbols: ['USDC', 'WETH'],
        positionTypes: ['Lending'],
      }),
      expect.objectContaining({
        protocol: 'Moonwell',
        chain: 'base',
        monthlyNetUsd: 15.2,
      }),
      expect.objectContaining({
        protocol: 'Morpho',
        chain: 'arbitrum',
        monthlyNetUsd: -30.4,
      }),
      expect.objectContaining({
        protocol: 'Aave',
        chain: 'arbitrum',
        monthlyNetUsd: -7.6,
      }),
    ]);
  });

  it('drops values that would render as zero cents', () => {
    const result = buildHomeIncomeView(
      summary([
        { protocol: 'Morpho', averageDaily: 0.0001 },
        { protocol: 'Aave', averageDaily: -0.0001 },
        { protocol: 'Moonwell', averageDaily: MIN_DISPLAY_MONTHLY_USD / 30.4 },
      ]),
    );

    expect(result.protocolRows).toHaveLength(1);
    expect(result.protocolRows[0]?.protocol).toBe('Moonwell');
  });

  it('marks fewer than seven observed days as insufficient while retaining tracked protocols', () => {
    const result = buildHomeIncomeView(
      summary([{ protocol: 'Morpho', averageDaily: 2 }], MIN_OBSERVED_DAYS - 1),
    );
    expect(result.status).toBe('insufficient');
    expect(result.protocolRows).toHaveLength(1);
  });

  it('returns empty for no breakdown or a missing window', () => {
    expect(buildHomeIncomeView(summary([]))).toEqual(
      expect.objectContaining({ status: 'empty', protocolRows: [] }),
    );
    expect(buildHomeIncomeView(summary([], 30, '7d'))).toEqual(
      expect.objectContaining({
        status: 'empty',
        observedDays: 0,
        protocolRows: [],
      }),
    );
  });
});
