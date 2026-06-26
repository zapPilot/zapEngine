import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics';

import { type MetricTone, MOCK } from '@/data/mock';
import { formatSignedPct } from '@/lib/format';

interface Metric {
  label: string;
  value: string;
  tone: MetricTone;
}

/** Shape the PortfolioScreen renders. Mirrors `MOCK.portfolio`. */
export interface PortfolioViewData {
  positionValue: number;
  changePct: number;
  changeUsdAllTime: number;
  changePctToday: number;
  metrics: Metric[];
  allocation: { label: string; pct: number; color: string }[];
  lastRebalancedLabel: string;
}

export interface UsePortfolioDataResult {
  data: PortfolioViewData | null;
  isLoading: boolean;
  isError: boolean;
}

const MOCK_PORTFOLIO = MOCK.portfolio;

/** A small rotating palette so any extra real allocation categories that have
 *  no MOCK colour still render with a stable, distinct swatch. */
const ALLOCATION_PALETTE = [
  'var(--usd)',
  'var(--spy)',
  'var(--btc)',
  'var(--accent)',
];

/** Colour for a real allocation category: reuse the MOCK colour for a matching
 *  label, otherwise fall back to a stable palette slot (the API carries no
 *  colour — NOTE(real-data) below). */
function allocationColor(label: string, index: number): string {
  const known = MOCK_PORTFOLIO.allocation.find(
    (a) => a.label.toLowerCase() === label.toLowerCase(),
  );
  return (
    known?.color ??
    ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length] ??
    'var(--accent)'
  );
}

function toneForSignedPct(pct: number): MetricTone {
  if (pct > 0) return 'positive';
  if (pct < 0) return 'negative';
  return 'neutral';
}

/** The MOCK metric at `index` (under noUncheckedIndexedAccess it may be
 *  undefined), or a neutral placeholder carrying the given label/tone. */
function mockMetric(
  index: number,
  label: string,
  tone: MetricTone = 'neutral',
): Metric {
  return MOCK_PORTFOLIO.metrics[index] ?? { label, value: '—', tone };
}

/**
 * Container hook for the Portfolio screen. Calls the real app-core
 * `usePortfolioDashboard` and maps its (deeply optional) response into the
 * exact shape `PortfolioScreen` already consumes, falling back to MOCK values
 * for any field with no clean real source.
 */
export function usePortfolioData(
  userId: string | null,
): UsePortfolioDataResult {
  const { dashboard, isLoading, isError } = usePortfolioDashboard(
    userId ?? undefined,
    { trend_days: 365, rolling_days: 30 },
  );

  // userId still resolving, or the query hasn't produced a dashboard yet.
  if (!userId || (isLoading && !dashboard)) {
    return { data: null, isLoading: true, isError: false };
  }

  const dailyValues = dashboard?.trends?.daily_values ?? [];
  const firstDay = dailyValues[0];
  const lastDay = dailyValues[dailyValues.length - 1];

  // Position value = latest total_value_usd; fall back to MOCK while empty.
  const positionValue =
    lastDay?.total_value_usd ?? MOCK_PORTFOLIO.positionValue;

  // All-time change: first vs last total_value_usd.
  const firstValue = firstDay?.total_value_usd;
  const lastValue = lastDay?.total_value_usd;
  const trend =
    typeof firstValue === 'number' &&
    typeof lastValue === 'number' &&
    firstValue > 0
      ? { first: firstValue, last: lastValue }
      : null;
  const haveTrendRange = trend !== null;
  const changeUsdAllTime = trend
    ? trend.last - trend.first
    : MOCK_PORTFOLIO.changeUsdAllTime;
  const changePct = trend
    ? ((trend.last - trend.first) / trend.first) * 100
    : MOCK_PORTFOLIO.changePct;

  // Today = latest daily change_percentage.
  const changePctToday =
    lastDay?.change_percentage ?? MOCK_PORTFOLIO.changePctToday;

  // --- Metrics: real where analytics gives a clean source, MOCK otherwise. ---
  const sharpeSeries =
    dashboard?.rolling_analytics?.sharpe?.rolling_sharpe_data ?? [];
  const lastSharpe =
    sharpeSeries[sharpeSeries.length - 1]?.rolling_sharpe_ratio;

  const volatilitySeries =
    dashboard?.rolling_analytics?.volatility?.rolling_volatility_data ?? [];
  const lastVolatilityPct =
    volatilitySeries[volatilitySeries.length - 1]?.annualized_volatility_pct;

  const maxDrawdownPct =
    dashboard?.drawdown_analysis?.enhanced?.summary?.max_drawdown_pct;

  const haveTotalReturn =
    haveTrendRange || lastDay?.change_percentage !== undefined;

  const totalReturnMetric: Metric = haveTotalReturn
    ? {
        label: 'Total return',
        value: formatSignedPct(changePct),
        tone: toneForSignedPct(changePct),
      }
    : mockMetric(0, 'Total return');

  const maxDrawdownMetric: Metric =
    typeof maxDrawdownPct === 'number'
      ? {
          label: 'Max drawdown',
          // max_drawdown_pct is reported as a negative value upstream.
          value: formatSignedPct(maxDrawdownPct),
          tone: 'negative',
        }
      : mockMetric(5, 'Max drawdown');

  const volatilityMetric: Metric =
    typeof lastVolatilityPct === 'number'
      ? {
          label: 'Volatility',
          value: `${Math.abs(lastVolatilityPct).toFixed(1)}%`,
          tone: 'neutral',
        }
      : { label: 'Volatility', value: '—', tone: 'neutral' };

  const sharpeMetric: Metric =
    typeof lastSharpe === 'number'
      ? {
          label: 'Sharpe',
          value: lastSharpe.toFixed(2),
          tone: 'accent',
        }
      : { label: 'Sharpe', value: '—', tone: 'accent' };

  const metrics: PortfolioViewData['metrics'] = [
    totalReturnMetric,
    // NOTE(real-data): Current APY — no clean per-position APY in the dashboard
    // response; keep MOCK until a yield/APY series is wired.
    mockMetric(1, 'Current APY', 'accent'),
    // NOTE(real-data): 7D / 30D windowed returns — derivable from daily_values
    // but not requested here; keep MOCK until a windowed-return helper exists.
    mockMetric(2, '7D return', 'positive'),
    mockMetric(3, '30D return', 'positive'),
    // NOTE(real-data): Realized yield — no realized-yield field in dashboard.
    mockMetric(4, 'Realized yield'),
    maxDrawdownMetric,
    volatilityMetric,
    sharpeMetric,
    // NOTE(real-data): Fees paid / Gas saved — no fee/gas accounting source.
  ];

  // --- Allocation: latest snapshot from the allocation time-series. ---
  const allocationRows = dashboard?.allocation?.allocations ?? [];
  // ISO date strings sort lexically = chronologically; .at(-1) is the latest
  // (or undefined when there are no allocation rows).
  const latestAllocationDate = allocationRows
    .map((row) => row?.date)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
  const latestAllocationRows = latestAllocationDate
    ? allocationRows.filter((row) => row?.date === latestAllocationDate)
    : [];

  const allocation: PortfolioViewData['allocation'] =
    latestAllocationRows.length > 0
      ? latestAllocationRows.map((row, index) => {
          const label = row?.category ?? 'Other';
          return {
            label,
            pct: Math.round(row?.allocation_percentage ?? 0),
            // NOTE(real-data): allocation colour — API carries no colour, mapped
            // from the MOCK palette by category label (see allocationColor).
            color: allocationColor(label, index),
          };
        })
      : MOCK_PORTFOLIO.allocation;

  const data: PortfolioViewData = {
    positionValue,
    changePct,
    changeUsdAllTime,
    changePctToday,
    metrics,
    allocation,
    // NOTE(real-data): lastRebalancedLabel — no rebalance-event/timeline source
    // in the dashboard response; keep MOCK label.
    lastRebalancedLabel: MOCK_PORTFOLIO.lastRebalancedLabel,
  };

  return { data, isLoading, isError };
}
