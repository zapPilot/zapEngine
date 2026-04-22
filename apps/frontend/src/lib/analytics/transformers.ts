/**
 * Analytics Data Transformers
 *
 * Pure functions to transform API responses into chart/metric display formats.
 */

import { MONTH_ABBREVIATIONS } from '@/constants/dates';
import type {
  DailyYieldReturnsResponse,
  UnifiedDashboardResponse,
} from '@/services';
import type {
  DrawdownChartData,
  KeyMetrics,
  MetricData,
  MonthlyPnL,
  PerformanceChartData,
} from '@/types';

import { buildDateRange, normalizeToScale, toDateKey } from './utils/dateUtils';
import {
  createPlaceholderMetric,
  extractDrawdownSummary,
  getSharpePercentile,
} from './utils/metricUtils';

function getRecoverySubValue(days: number): string {
  return days > 0 ? `Recovered in ${days} days` : 'Not yet recovered';
}

function getSignedPrefix(value: number): string {
  return value > 0 ? '+' : '';
}

function getSharpeTrend(value: number): MetricData['trend'] {
  if (value > 1.5) return 'up';
  if (value > 0.5) return 'neutral';
  return 'down';
}

function getVolatilityRiskLabel(value: number): string {
  if (value < 20) return 'Low risk';
  if (value < 40) return 'Moderate';
  return 'High risk';
}

interface TrendValue {
  total_value_usd?: number;
  date?: string;
}

function getPositivePortfolioValues(dailyValues: TrendValue[]): number[] {
  return dailyValues.map((d) => d.total_value_usd ?? 0).filter((v) => v > 0);
}

// ============================================================================
// CHART TRANSFORMERS
// ============================================================================

/**
 * Transform dashboard trends to Performance Chart SVG points
 */
export function transformToPerformanceChart(
  dashboard: UnifiedDashboardResponse | undefined,
): PerformanceChartData {
  const dailyValues = dashboard?.trends?.daily_values ?? [];

  if (dailyValues.length === 0) {
    return { points: [], ...buildDateRange(dailyValues) };
  }

  const portfolioValues = getPositivePortfolioValues(dailyValues);

  if (portfolioValues.length === 0) {
    return { points: [], ...buildDateRange(dailyValues) };
  }

  const min = Math.min(...portfolioValues);
  const max = Math.max(...portfolioValues);
  const range = max - min;

  const points = dailyValues.map((d, idx) => {
    const value = d.total_value_usd ?? min;
    const dateKey = toDateKey(d.date);

    const normalizedPortfolio = normalizeToScale(value, min, range);

    return {
      x: (idx / (dailyValues.length - 1)) * 100,
      portfolio: normalizedPortfolio,
      date: dateKey ?? d.date ?? new Date().toISOString(),
      portfolioValue: value,
    };
  });

  return { points, ...buildDateRange(dailyValues) };
}

/**
 * Transform drawdown analysis to Drawdown Chart underwater data
 */
export function transformToDrawdownChart(
  dashboard: UnifiedDashboardResponse | undefined,
): DrawdownChartData {
  const { maxDrawdownPct, maxDrawdownDate, underwaterData } =
    extractDrawdownSummary(dashboard);

  if (underwaterData.length === 0) {
    return {
      points: [{ x: 0, value: 0, date: new Date().toISOString() }],
      maxDrawdown: 0,
      maxDrawdownDate: new Date().toISOString(),
    };
  }

  const points = underwaterData.map((d, idx: number) => ({
    x: (idx / (underwaterData.length - 1)) * 100,
    value: d.drawdown_pct ?? 0,
    date: d.date ?? new Date().toISOString(),
  }));

  return {
    points,
    maxDrawdown: maxDrawdownPct,
    maxDrawdownDate,
  };
}

// ============================================================================
// METRIC CALCULATORS
// ============================================================================

export function calculateKeyMetrics(
  dashboard: UnifiedDashboardResponse | undefined,
): KeyMetrics {
  const dailyValues = dashboard?.trends?.daily_values ?? [];
  const rollingAnalytics = dashboard?.rolling_analytics;
  const { maxDrawdownPct, recoveryDays } = extractDrawdownSummary(dashboard);

  return {
    timeWeightedReturn: calculateTWR(dailyValues),
    maxDrawdown: {
      value: `${maxDrawdownPct.toFixed(1)}%`,
      subValue: getRecoverySubValue(recoveryDays),
      trend: maxDrawdownPct > -15 ? 'up' : 'down',
    },
    sharpe: extractSharpe(rollingAnalytics),
    winRate: calculateWinRate(dailyValues),
    volatility: extractVolatility(rollingAnalytics),
    sortino: createPlaceholderMetric('N/A', 'Coming soon'),
  };
}

function calculateTWR(
  dailyValues: { total_value_usd?: number; date?: string }[],
): MetricData {
  if (dailyValues.length < 2) {
    return createPlaceholderMetric('0%', '0% total return');
  }

  const first = dailyValues[0]?.total_value_usd ?? 0;
  const last = dailyValues[dailyValues.length - 1]?.total_value_usd ?? 0;

  if (first === 0) {
    return createPlaceholderMetric('0%', '0% total return');
  }

  const returnPct = ((last - first) / first) * 100;
  const prefix = getSignedPrefix(returnPct);

  return {
    value: `${prefix}${returnPct.toFixed(1)}%`,
    subValue: `${prefix}${returnPct.toFixed(1)}% total return`,
    trend: returnPct > 0 ? 'up' : 'down',
  };
}

function extractRollingAverage<T>(
  data: T[] | undefined,
  selector: (item: T) => number | undefined,
): number | null {
  const values = (data ?? [])
    .map((d) => selector(d) ?? 0)
    .filter(Number.isFinite);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function extractSharpe(
  rollingAnalytics: UnifiedDashboardResponse['rolling_analytics'],
): MetricData {
  const avg = extractRollingAverage(
    rollingAnalytics?.sharpe?.rolling_sharpe_data,
    (d) => d.rolling_sharpe_ratio,
  );
  if (avg === null) return createPlaceholderMetric('N/A', 'No data');

  return {
    value: avg.toFixed(2),
    subValue: `Top ${getSharpePercentile(avg)}% of Pilots`,
    trend: getSharpeTrend(avg),
  };
}

function calculateWinRate(
  dailyValues: { pnl_percentage?: number }[],
): MetricData {
  if (dailyValues.length === 0) {
    return createPlaceholderMetric('0%', 'No data');
  }

  const positiveDays = dailyValues.filter(
    (d) => (d.pnl_percentage ?? 0) > 0,
  ).length;
  const winRatePct = (positiveDays / dailyValues.length) * 100;

  return {
    value: `${winRatePct.toFixed(0)}%`,
    subValue: `${positiveDays} winning days`,
    trend: winRatePct > 50 ? 'up' : 'down',
  };
}

function extractVolatility(
  rollingAnalytics: UnifiedDashboardResponse['rolling_analytics'],
): MetricData {
  const avg = extractRollingAverage(
    rollingAnalytics?.volatility?.rolling_volatility_data,
    (d) => d.annualized_volatility_pct,
  );
  if (avg === null) return createPlaceholderMetric('N/A', 'No data');

  return {
    value: `${avg.toFixed(1)}%`,
    subValue: getVolatilityRiskLabel(avg),
    trend: avg < 25 ? 'up' : 'down',
  };
}

// ============================================================================
// MONTHLY PNL AGGREGATOR
// ============================================================================

export function aggregateMonthlyPnL(
  dailyReturns: DailyYieldReturnsResponse | undefined,
  portfolioValues: { date?: string; total_value_usd?: number }[] = [],
): MonthlyPnL[] {
  if (!dailyReturns?.daily_returns) {
    return [];
  }

  const monthlyMap = new Map<string, number>();

  for (const entry of dailyReturns.daily_returns) {
    if (!entry.date) {
      continue;
    }
    const date = new Date(entry.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(
      monthKey,
      (monthlyMap.get(monthKey) ?? 0) + (entry.yield_return_usd ?? 0),
    );
  }

  const monthNames = MONTH_ABBREVIATIONS;

  return Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([monthKey, yieldUSD]) => {
      const [yearStr, monthStr] = monthKey.split('-');
      const year = parseInt(yearStr ?? '', 10);
      const month = parseInt(monthStr ?? '', 10);

      if (!year || !month || month < 1 || month > 12) {
        return null;
      }

      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const portfolioValue =
        portfolioValues.find((pv) => pv.date && pv.date >= monthStart)
          ?.total_value_usd ?? 100000;

      return {
        month: monthNames[month - 1] ?? 'N/A',
        year,
        value: portfolioValue > 0 ? (yieldUSD / portfolioValue) * 100 : 0,
      };
    })
    .filter((entry): entry is MonthlyPnL => entry !== null);
}
