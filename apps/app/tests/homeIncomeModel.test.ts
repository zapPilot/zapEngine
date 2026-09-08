import { AVG_DAYS_PER_MONTH } from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  buildHomeIncomeView,
  type HomeProtocolIncomeRow,
  MIN_DISPLAY_MONTHLY_USD,
  MIN_OBSERVED_DAYS,
  partitionIncomeRowsByCoverage,
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

  it('includes synthetic ETH staking income in passive headline totals', () => {
    const result = buildHomeIncomeView(
      summary([
        {
          protocol: 'ETH Staking',
          averageDaily: 2,
          tokenSymbols: ['wstETH', 'cbETH'],
        },
        {
          protocol: 'Morpho',
          chain: 'ethereum',
          averageDaily: -1,
          tokenSymbols: ['USDT'],
          positionTypes: ['Lending'],
        },
      ]),
    );

    expect(result.incomeMonthlyUsd).toBeCloseTo(60.8);
    expect(result.costMonthlyUsd).toBeCloseTo(-30.4);
    expect(result.passiveMonthlyUsd).toBeCloseTo(30.4);
    expect(result.protocolRows[0]).toEqual(
      expect.objectContaining({
        protocol: 'ETH Staking',
        monthlyNetUsd: 60.8,
        tokenSymbols: ['wstETH', 'cbETH'],
      }),
    );
  });

  it('shows staking-only income even without observed protocol delta days', () => {
    const result = buildHomeIncomeView(
      summary(
        [
          {
            protocol: 'ETH Staking',
            averageDaily: 2,
            tokenSymbols: ['wstETH'],
          },
        ],
        0,
      ),
    );

    expect(result.status).toBe('ready');
    expect(result.observedDays).toBe(0);
    expect(result.passiveMonthlyUsd).toBeCloseTo(60.8);
    expect(result.protocolRows).toHaveLength(1);
  });

  it('drops values that would render as zero cents', () => {
    const result = buildHomeIncomeView(
      summary([
        { protocol: 'Morpho', averageDaily: 0.0001 },
        { protocol: 'Aave', averageDaily: -0.0001 },
        {
          protocol: 'Moonwell',
          averageDaily: MIN_DISPLAY_MONTHLY_USD / AVG_DAYS_PER_MONTH,
        },
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

describe('partitionIncomeRowsByCoverage', () => {
  const incomeRow = (
    protocol: string,
    monthlyNetUsd: number,
  ): HomeProtocolIncomeRow => ({
    protocol,
    monthlyNetUsd,
    tokenSymbols: [],
    positionTypes: [],
  });

  it('keeps the rows that carry most of each side and rolls up the rest', () => {
    const partition = partitionIncomeRowsByCoverage([
      incomeRow('Morpho', 100),
      incomeRow('Frax', 40),
      incomeRow('Pendle', 5),
      incomeRow('Curve', 3),
      incomeRow('Yearn', 2),
      incomeRow('Aave', -20),
      incomeRow('Spark', -4),
    ]);

    expect(partition.visible.map((row) => row.protocol)).toEqual([
      'Morpho',
      'Frax',
      'Aave',
    ]);
    expect(partition.other.map((row) => row.protocol)).toEqual([
      'Pendle',
      'Curve',
      'Yearn',
      'Spark',
    ]);
    expect(partition.otherIncomeUsd).toBe(10);
    expect(partition.otherCostUsd).toBe(-4);
  });

  it('covers income and cost separately so a big income side cannot hide costs', () => {
    const partition = partitionIncomeRowsByCoverage([
      incomeRow('Morpho', 1_000),
      incomeRow('Aave', -6),
      incomeRow('Spark', -3),
      incomeRow('Compound', -1),
      incomeRow('Silo', -0.5),
    ]);

    // The costs are dust next to the income side, yet the two largest still
    // earn their rows.
    expect(partition.visible.map((row) => row.protocol)).toEqual([
      'Morpho',
      'Aave',
      'Spark',
    ]);
    expect(partition.other.map((row) => row.protocol)).toEqual([
      'Compound',
      'Silo',
    ]);
  });

  it('always keeps at least one row per side', () => {
    const partition = partitionIncomeRowsByCoverage(
      [incomeRow('Morpho', 100), incomeRow('Aave', -1)],
      0,
    );

    expect(partition.visible.map((row) => row.protocol)).toEqual([
      'Morpho',
      'Aave',
    ]);
  });

  it('leaves a lone tail row visible rather than behind a disclosure', () => {
    const partition = partitionIncomeRowsByCoverage([
      incomeRow('Morpho', 100),
      incomeRow('Frax', 40),
      incomeRow('Pendle', 5),
    ]);

    expect(partition.other).toEqual([]);
    expect(partition.visible).toHaveLength(3);
  });

  it('handles an empty list', () => {
    expect(partitionIncomeRowsByCoverage([])).toEqual({
      visible: [],
      other: [],
      otherIncomeUsd: 0,
      otherCostUsd: 0,
    });
  });
});
