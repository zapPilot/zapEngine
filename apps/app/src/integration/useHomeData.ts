import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';
import {
  buildTradeActions,
  formatRegimeLabel,
  getStatusPanelContent,
} from '@zapengine/app-core/services/suggestion';
import type { DailySuggestionActionStatus } from '@zapengine/app-core/types/strategy';
import { useMemo } from 'react';

import { DEMO } from '@/data/demo';
import {
  calculateAdjacentSnapshotChange,
  type DailyValuePoint,
  sortedDailyValues,
  toTrendPoints,
} from '@/integration/portfolioMetrics';
import { useStrategySuggestion } from '@/integration/useStrategySuggestion';

export const HOME_RANGE_OPTIONS = ['1D', '1W', '1M', '3M', '1Y'] as const;
export type HomeRange = (typeof HOME_RANGE_OPTIONS)[number];
export const DEFAULT_HOME_RANGE: HomeRange = '1Y';
const HOME_DASHBOARD_WINDOW_DAYS = 365;
const EMPTY_DAILY_VALUES: readonly DailyValuePoint[] = [];

export interface HomeViewData {
  totalBalance: number | null;
  rangeChangePct: number | null;
  rangeChangeUsd: number | null;
  latestSnapshotDate: string | null;
  trendPoints: DailyValuePoint[];
}

export interface HomeStrategyStatusView {
  status: DailySuggestionActionStatus;
  regimeLabel: string;
  fearGreed: number | null;
  primaryAction: {
    description: string;
    amountUsd: number;
  } | null;
  additionalActionCount: number;
  reason: string | null;
}

export interface HomeData {
  home: HomeViewData;
  strategyStatus: HomeStrategyStatusView | null;
}

export type HomeSnapshotAvailability = 'demo' | 'available' | 'unavailable';

export interface UseHomeDataResult {
  data: HomeData;
  isLoading: boolean;
  isError: boolean;
  snapshotAvailability: HomeSnapshotAvailability;
}

/**
 * Home only needs portfolio-level analytics plus the current strategy decision.
 * Spendable balances belong to the invest flow, not this portfolio overview.
 *
 * @param subjectUserId Account-engine user id whose bundle is displayed —
 *   the viewer's own id or a `?userId=` bundle-view id. Analytics v2 paths
 *   are UUID-typed; a wallet address must never be passed here.
 */
export function getHomeDashboardWindowParams() {
  return {
    trend_days: HOME_DASHBOARD_WINDOW_DAYS,
    drawdown_days: HOME_DASHBOARD_WINDOW_DAYS,
    rolling_days: HOME_DASHBOARD_WINDOW_DAYS,
  };
}

function rangeWindowDays(range: HomeRange): number | null {
  if (range === '1D') return 1;
  if (range === '1W') return 7;
  if (range === '1M') return 30;
  if (range === '3M') return 90;
  return null;
}

export function sliceHomeDailyValuesForRange(
  dailyValues: readonly DailyValuePoint[],
  range: HomeRange,
): DailyValuePoint[] {
  const sorted = sortedDailyValues(dailyValues);
  const days = rangeWindowDays(range);
  const latest = sorted.at(-1);
  if (days === null || !latest?.date) {
    return sorted;
  }

  const latestTs = Date.parse(latest.date);
  if (Number.isNaN(latestTs)) {
    return sorted.slice(-Math.max(2, days));
  }

  const cutoff = latestTs - days * 24 * 60 * 60 * 1000;
  const sliced = sorted.filter((point) => {
    if (!point.date) return false;
    const ts = Date.parse(point.date);
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  return sliced.length >= 2 ? sliced : sorted.slice(-2);
}

function trendPointsOrFallback(
  liveTrendPoints: DailyValuePoint[],
  demoTrendPoints: DailyValuePoint[],
  isDemo: boolean,
): DailyValuePoint[] {
  if (liveTrendPoints.length >= 2) {
    return liveTrendPoints;
  }
  return isDemo ? demoTrendPoints : [];
}

export function calculateHomeRangeChange(
  trendPoints: readonly DailyValuePoint[],
) {
  const first = trendPoints.at(0);
  const latest = trendPoints.at(-1);
  if (!first || !latest || trendPoints.length < 2) return null;
  return calculateAdjacentSnapshotChange([first, latest]);
}

function strategyStatusFromSuggestion(
  data: NonNullable<ReturnType<typeof useStrategySuggestion>['data']>,
): HomeStrategyStatusView {
  const actions = buildTradeActions(data);
  const primaryAction = actions.at(0) ?? null;
  const statusPanel = getStatusPanelContent(data, actions);

  return {
    status: data.action.status,
    regimeLabel: formatRegimeLabel(data.context.signal.regime),
    fearGreed: data.context.market.sentiment ?? null,
    primaryAction: primaryAction
      ? {
          description: primaryAction.description,
          amountUsd: primaryAction.amount_usd,
        }
      : null,
    additionalActionCount: Math.max(0, actions.length - 1),
    reason:
      data.action.status === 'action_required'
        ? null
        : statusPanel.bodyDescription,
  };
}

const DEMO_STRATEGY_STATUS: HomeStrategyStatusView = {
  status: 'no_action',
  regimeLabel: 'cautious',
  fearGreed: DEMO.strategy.backtest.sentiment,
  primaryAction: null,
  additionalActionCount: 0,
  reason: DEMO.strategy.quote,
};

export function useHomeData(
  subjectUserId: string | null,
  range: HomeRange,
  options: {
    isResolvingSubject?: boolean;
    isEtlInProgress?: boolean;
  } = {},
): UseHomeDataResult {
  const analyticsSubjectId = subjectUserId?.trim() || null;
  const progressive = usePortfolioDataProgressive(
    analyticsSubjectId,
    Boolean(options.isEtlInProgress),
  );
  const dashboard = usePortfolioDashboard(
    analyticsSubjectId ?? undefined,
    getHomeDashboardWindowParams(),
  );
  const suggestion = useStrategySuggestion(analyticsSubjectId);

  const balanceSection = progressive.sections?.balance;
  const hasPortfolioSnapshot = Boolean(progressive.unifiedData?.lastUpdated);
  const isResolvingSubject =
    Boolean(options.isResolvingSubject) && analyticsSubjectId === null;

  const isLoading =
    isResolvingSubject ||
    Boolean(balanceSection?.isLoading) ||
    dashboard.isLoading ||
    suggestion.isLoading;
  const isError =
    Boolean(balanceSection?.error) || dashboard.isError || suggestion.isError;

  // While the subject is still resolving, stay in the live (skeleton) state
  // instead of flashing demo data.
  const isDemo = analyticsSubjectId === null && !isResolvingSubject;
  const totalBalance = isDemo
    ? DEMO.home.totalBalance
    : hasPortfolioSnapshot
      ? (balanceSection?.data?.balance ?? null)
      : null;

  const dailyValues =
    dashboard.dashboard?.trends?.daily_values ?? EMPTY_DAILY_VALUES;
  const allTrendPoints = useMemo(
    () => toTrendPoints(dailyValues),
    [dailyValues],
  );
  const selectedTrendPoints = useMemo(
    () =>
      trendPointsOrFallback(
        toTrendPoints(sliceHomeDailyValuesForRange(allTrendPoints, range)),
        toTrendPoints(
          sliceHomeDailyValuesForRange(DEMO.home.trendPoints, range),
        ),
        isDemo,
      ),
    [allTrendPoints, isDemo, range],
  );
  const rangeChange = calculateHomeRangeChange(selectedTrendPoints);
  const latestDay = (isDemo ? DEMO.home.trendPoints : allTrendPoints).at(-1);

  return {
    data: {
      home: {
        totalBalance,
        rangeChangePct: rangeChange?.pct ?? null,
        rangeChangeUsd: rangeChange?.usd ?? null,
        latestSnapshotDate: latestDay?.date ?? null,
        trendPoints: selectedTrendPoints,
      },
      strategyStatus: isDemo
        ? DEMO_STRATEGY_STATUS
        : suggestion.data
          ? strategyStatusFromSuggestion(suggestion.data)
          : null,
    },
    isLoading,
    isError,
    snapshotAvailability: isDemo
      ? 'demo'
      : hasPortfolioSnapshot
        ? 'available'
        : 'unavailable',
  };
}
