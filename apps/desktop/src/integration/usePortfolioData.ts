import { useQuery } from '@tanstack/react-query';
import { calculateAllocation } from '@zapengine/app-core/adapters';
import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics';
import { useLandingPageData } from '@zapengine/app-core/hooks/queries';
import { getDailyYieldReturns } from '@zapengine/app-core/services';

import { DEMO, type MetricTone } from '@/data/demo';
import {
  calculateWindowReturn,
  mapDailyValuesToSparkline,
  sumYieldReturns,
} from '@/integration/portfolioMetrics';
import { formatSignedPct, formatUsd } from '@/lib/format';

interface Metric {
  label: string;
  value: string;
  tone: MetricTone;
}

/** Shape the PortfolioScreen renders. */
export interface PortfolioViewData {
  positionValue: number | null;
  changePct: number | null;
  changeUsdAllTime: number | null;
  changePctToday: number | null;
  chartData: number[];
  metrics: Metric[];
  allocation: { label: string; pct: number; color: string }[];
  lastRebalancedLabel: string;
}

export interface UsePortfolioDataResult {
  data: PortfolioViewData | null;
  isLoading: boolean;
  isError: boolean;
}

export type PortfolioRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

const DEMO_PORTFOLIO = DEMO.portfolio;

export function portfolioDaysForRange(range: PortfolioRange): number {
  if (range === '1W') return 7;
  if (range === '1M') return 30;
  if (range === '3M') return 90;
  return 365;
}

/** A small rotating palette so real allocation categories without a known
 * colour still render with a stable, distinct swatch. */
const ALLOCATION_PALETTE = [
  'var(--usd)',
  'var(--spy)',
  'var(--btc)',
  'var(--accent)',
];

/** Colour for a real allocation category: reuse the DEMO colour for a matching
 *  label, otherwise fall back to a stable palette slot. */
function allocationColor(label: string, index: number): string {
  const known = DEMO_PORTFOLIO.allocation.find(
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

function unavailableMetric(
  label: string,
  tone: MetricTone = 'neutral',
): Metric {
  return { label, value: '—', tone };
}

function pctMetric(label: string, pct: number | null): Metric {
  if (typeof pct !== 'number') {
    return unavailableMetric(label);
  }
  return {
    label,
    value: formatSignedPct(pct),
    tone: toneForSignedPct(pct),
  };
}

function positivePctMetric(label: string, pct: number | null): Metric {
  if (typeof pct !== 'number') {
    return unavailableMetric(label, 'accent');
  }
  return {
    label,
    value: `${Math.abs(pct).toFixed(1)}%`,
    tone: 'accent',
  };
}

/**
 * Container hook for the Portfolio screen. Calls the real app-core
 * `usePortfolioDashboard` and maps its (deeply optional) response into the
 * exact shape `PortfolioScreen` already consumes. Fields without a clean source
 * are explicit dashes rather than demo values.
 */
export function usePortfolioData(
  userId: string | null,
  range: PortfolioRange,
): UsePortfolioDataResult {
  const days = portfolioDaysForRange(range);
  const landingQuery = useLandingPageData(userId, false, true);
  const { dashboard, isLoading, isError } = usePortfolioDashboard(
    userId ?? undefined,
    { trend_days: days, drawdown_days: days, rolling_days: days },
  );
  const yieldQuery = useQuery({
    queryKey: ['desktop', 'portfolio', 'dailyYield', userId, days],
    queryFn: () => getDailyYieldReturns(userId as string, days),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

  // userId still resolving, or the query hasn't produced a dashboard yet.
  if (!userId || (isLoading && !dashboard)) {
    return { data: null, isLoading: true, isError: false };
  }

  const landing = landingQuery.data;
  const dailyValues = dashboard?.trends?.daily_values ?? [];
  const chronologicalDailyValues = [...dailyValues].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
  const firstDay = chronologicalDailyValues[0];
  const lastDay = chronologicalDailyValues.at(-1);

  // Position value = authoritative landing BFF balance.
  const positionValue =
    typeof landing?.net_portfolio_value === 'number'
      ? landing.net_portfolio_value
      : typeof landing?.total_net_usd === 'number'
        ? landing.total_net_usd
        : null;

  // All-time change: earliest vs latest total_value_usd.
  const firstValue = firstDay?.total_value_usd;
  const lastValue = lastDay?.total_value_usd;
  const trend =
    typeof firstValue === 'number' &&
    typeof lastValue === 'number' &&
    firstValue > 0
      ? { first: firstValue, last: lastValue }
      : null;
  const changeUsdAllTime = trend ? trend.last - trend.first : null;
  const changePct = trend
    ? ((trend.last - trend.first) / trend.first) * 100
    : null;

  // Today = latest daily change_percentage.
  const changePctToday =
    typeof lastDay?.change_percentage === 'number'
      ? lastDay.change_percentage
      : null;

  // --- Metrics: real where analytics gives a clean source, unavailable otherwise. ---
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

  const totalReturnMetric = pctMetric('Total return', changePct);

  const maxDrawdownMetric: Metric =
    typeof maxDrawdownPct === 'number'
      ? {
          label: 'Max drawdown',
          // max_drawdown_pct is reported as a negative value upstream.
          value: formatSignedPct(maxDrawdownPct),
          tone: 'negative',
        }
      : unavailableMetric('Max drawdown', 'negative');

  const volatilityMetric: Metric =
    typeof lastVolatilityPct === 'number'
      ? {
          label: 'Volatility',
          value: `${Math.abs(lastVolatilityPct).toFixed(1)}%`,
          tone: 'neutral',
        }
      : unavailableMetric('Volatility');

  const sharpeMetric: Metric =
    typeof lastSharpe === 'number'
      ? {
          label: 'Sharpe',
          value: lastSharpe.toFixed(2),
          tone: 'accent',
        }
      : unavailableMetric('Sharpe', 'accent');

  const return7d = calculateWindowReturn(chronologicalDailyValues, 7);
  const return30d = calculateWindowReturn(chronologicalDailyValues, 30);
  const realizedYield = sumYieldReturns(yieldQuery.data?.daily_returns);
  const realizedYieldMetric: Metric =
    typeof realizedYield === 'number'
      ? {
          label: 'Realized yield',
          value: formatUsd(realizedYield),
          tone: realizedYield < 0 ? 'negative' : 'neutral',
        }
      : unavailableMetric('Realized yield');

  const metrics: PortfolioViewData['metrics'] = [
    totalReturnMetric,
    positivePctMetric(
      'Current APY',
      landing?.portfolio_roi?.recommended_yearly_roi ?? null,
    ),
    pctMetric('7D return', return7d),
    pctMetric('30D return', return30d),
    realizedYieldMetric,
    maxDrawdownMetric,
    volatilityMetric,
    sharpeMetric,
  ];

  const allocation: PortfolioViewData['allocation'] =
    landing?.portfolio_allocation
      ? [
          ...calculateAllocation(landing).simplifiedCrypto.map((row) => ({
            label: row.name,
            pct: Math.round(row.value),
            color: row.color,
          })),
          {
            label: 'Stablecoins',
            pct: Math.round(calculateAllocation(landing).stable),
            color: allocationColor('Stables', 0),
          },
        ].filter((row) => row.pct > 0)
      : [];

  const data: PortfolioViewData = {
    positionValue,
    changePct,
    changeUsdAllTime,
    changePctToday,
    chartData: mapDailyValuesToSparkline(chronologicalDailyValues),
    metrics,
    allocation,
    lastRebalancedLabel: 'Auto-managed by Zap Strategy',
  };

  return {
    data,
    isLoading: isLoading || landingQuery.isLoading || yieldQuery.isLoading,
    isError: isError || landingQuery.isError || yieldQuery.isError,
  };
}
