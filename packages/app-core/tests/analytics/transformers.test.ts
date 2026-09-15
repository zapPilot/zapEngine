import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateMonthlyPnL,
  calculateKeyMetrics,
  transformToDrawdownChart,
  transformToPerformanceChart,
} from '../../src/lib/analytics/transformers';
import {
  buildDateRange,
  normalizeToScale,
  toDateKey,
} from '../../src/lib/analytics/utils/dateUtils';
import { getSharpePercentile } from '../../src/lib/analytics/utils/metricUtils';
import type {
  UnifiedDashboardResponse,
  DailyYieldReturnsResponse,
} from '../../src/services';

const dashboard = (data: unknown) => data as UnifiedDashboardResponse;
afterEach(() => vi.useRealTimers());

describe('analytics presentation', () => {
  it('uses dated empty states when data has not arrived', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(transformToPerformanceChart(undefined)).toEqual({
      points: [],
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.000Z',
    });
    expect(transformToDrawdownChart(undefined)).toEqual({
      points: [{ x: 0, value: 0, date: '2026-01-01T00:00:00.000Z' }],
      maxDrawdown: 0,
      maxDrawdownDate: '2026-01-01T00:00:00.000Z',
    });
    expect(calculateKeyMetrics(undefined)).toMatchObject({
      timeWeightedReturn: { value: '0%', trend: 'neutral' },
      sharpe: { value: 'N/A' },
      volatility: { value: 'N/A' },
      winRate: { value: '0%' },
      maxDrawdown: { subValue: 'Not yet recovered' },
    });
    expect(aggregateMonthlyPnL(undefined)).toEqual([]);
  });
  it('scales portfolio values inversely for SVG and preserves actual balances', () => {
    const result = transformToPerformanceChart(
      dashboard({
        trends: {
          daily_values: [
            { date: '2026-01-01', total_value_usd: 100 },
            { date: '2026-01-02', total_value_usd: 150 },
            { date: '2026-01-03', total_value_usd: 200 },
          ],
        },
      }),
    );
    expect(result.points).toEqual([
      { x: 0, portfolio: 100, date: '2026-01-01', portfolioValue: 100 },
      { x: 50, portfolio: 50, date: '2026-01-02', portfolioValue: 150 },
      { x: 100, portfolio: 0, date: '2026-01-03', portfolioValue: 200 },
    ]);
    expect(result).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-03',
    });
  });
  it('uses drawdown portfolio history when trends are empty and rejects nonfinite fallback values', () => {
    for (const key of ['enhanced', 'underwater_recovery']) {
      const result = transformToPerformanceChart(
        dashboard({
          drawdown_analysis: {
            [key]: {
              [key === 'enhanced' ? 'drawdown_data' : 'underwater_data']: [
                { date: '2026-01-01', portfolio_value: 100 },
                { portfolio_value: NaN },
                { portfolio_value: 'invalid' },
              ],
            },
          },
        }),
      );
      expect(result.points).toEqual([
        { x: 0, portfolio: 50, date: '2026-01-01', portfolioValue: 100 },
      ]);
    }
    expect(
      transformToPerformanceChart(
        dashboard({
          trends: {
            daily_values: [{ total_value_usd: 0 }, { total_value_usd: -1 }, {}],
          },
        }),
      ).points,
    ).toEqual([]);
  });
  it('renders drawdown magnitudes and recovery information', () => {
    const d = dashboard({
      drawdown_analysis: {
        enhanced: {
          summary: {
            max_drawdown_pct: -20,
            max_drawdown_date: '2026-01-02',
            recovery_days: 3,
          },
        },
        underwater_recovery: {
          underwater_data: [
            { date: '2026-01-01', drawdown_pct: 0 },
            { date: '2026-01-02', drawdown_pct: -20 },
          ],
        },
      },
    });
    expect(transformToDrawdownChart(d)).toEqual({
      points: [
        { x: 0, value: 0, date: '2026-01-01' },
        { x: 100, value: -20, date: '2026-01-02' },
      ],
      maxDrawdown: -20,
      maxDrawdownDate: '2026-01-02',
    });
    expect(calculateKeyMetrics(d).maxDrawdown).toEqual({
      value: '-20.0%',
      subValue: 'Recovered in 3 days',
      trend: 'down',
    });
  });
  it.each([
    [2, 10, 'up', 'Low risk'],
    [1, 30, 'neutral', 'Moderate'],
    [0, 50, 'down', 'High risk'],
  ] as const)(
    'summarizes rolling risk at Sharpe %s',
    (sharpe, volatility, trend, risk) => {
      const metrics = calculateKeyMetrics(
        dashboard({
          trends: {
            daily_values: [
              { total_value_usd: 100, pnl_percentage: -1 },
              { total_value_usd: 120, pnl_percentage: 2 },
              { total_value_usd: 150, pnl_percentage: 3 },
            ],
          },
          rolling_analytics: {
            sharpe: {
              rolling_sharpe_data: [
                { rolling_sharpe_ratio: sharpe },
                { rolling_sharpe_ratio: NaN },
              ],
            },
            volatility: {
              rolling_volatility_data: [
                { annualized_volatility_pct: volatility },
              ],
            },
          },
        }),
      );
      expect(metrics.sharpe).toMatchObject({ value: sharpe.toFixed(2), trend });
      expect(metrics.volatility).toMatchObject({
        value: `${volatility.toFixed(1)}%`,
        subValue: risk,
      });
      expect(metrics.timeWeightedReturn).toMatchObject({
        value: '+50.0%',
        trend: 'up',
      });
      expect(metrics.winRate).toMatchObject({
        value: '67%',
        subValue: '2 winning days',
        trend: 'up',
      });
    },
  );
  it('handles zero starting balances and falling portfolios', () => {
    expect(
      calculateKeyMetrics(dashboard({ trends: { daily_values: [{}, {}] } }))
        .timeWeightedReturn.value,
    ).toBe('0%');
    const result = calculateKeyMetrics(
      dashboard({
        trends: {
          daily_values: [{ total_value_usd: 100 }, { total_value_usd: 80 }],
        },
        rolling_analytics: {
          sharpe: { rolling_sharpe_data: [{}] },
          volatility: { rolling_volatility_data: [{}] },
        },
      }),
    );
    expect(result.timeWeightedReturn.value).toBe('-20.0%');
    expect(result.winRate.trend).toBe('down');
    expect(result.sharpe.value).toBe('0.00');
  });
  it('aggregates yields in month order against portfolio capital', () => {
    const returns = {
      daily_returns: [
        { date: '2026-02-01', yield_return_usd: 20 },
        { date: '2026-01-01', yield_return_usd: 10 },
        { date: '2026-01-02', yield_return_usd: 5 },
        { date: '2026-01-03' },
        { yield_return_usd: 999 },
        { date: 'invalid', yield_return_usd: 999 },
      ],
    } as DailyYieldReturnsResponse;
    expect(
      aggregateMonthlyPnL(returns, [
        { date: '2026-01-01', total_value_usd: 100 },
        { date: '2026-02-01', total_value_usd: 0 },
      ]),
    ).toEqual([
      { month: 'Jan', year: 2026, value: 15 },
      { month: 'Feb', year: 2026, value: 0 },
    ]);
    expect(aggregateMonthlyPnL(returns)[0]?.value).toBeCloseTo(0.015);
  });
  it('normalizes supported date strings and centers constant series', () => {
    expect(toDateKey(' 2026-02-03T01:00:00Z ')).toBe('2026-02-03');
    expect(toDateKey('February 3, 2026 00:00:00 UTC')).toBe('2026-02-03');
    expect(toDateKey('bad')).toBeNull();
    expect(toDateKey(null)).toBeNull();
    expect(
      buildDateRange([{ date: '2026-01-01' }, { date: '2026-02-01' }]),
    ).toEqual({ startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(normalizeToScale(10, 10, 0)).toBe(50);
    expect(normalizeToScale(20, 10, 20)).toBe(50);
    expect([4, 3, 2, 1.5, 1].map(getSharpePercentile)).toEqual([
      1, 5, 10, 25, 50,
    ]);
  });
});
