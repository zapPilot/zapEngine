import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';
import { useMemo } from 'react';

import { DEMO } from '@/data/demo';
import {
  calculateAdjacentSnapshotChange,
  type DailyValuePoint,
  sortedDailyValues,
  toTrendPoints,
} from '@/integration/portfolioMetrics';
import {
  liveTextOrDemo,
  marketModeLabelFromRegime,
  pillarsFromTarget,
} from '@/integration/strategyPresentation';
import { useDefaultStrategyBacktest } from '@/integration/useDefaultStrategyBacktest';
import {
  toCompositionTargetFromSuggestion,
  useStrategySuggestion,
} from '@/integration/useStrategySuggestion';
import { useWalletAssets } from '@/integration/walletTokens';
import type { UseWalletAssetsResult } from '@/integration/walletTokens';

type HomeSlice = (typeof DEMO)['home'];
type HomeViewData = Omit<HomeSlice, 'sparkline'>;
type StrategySlice = (typeof DEMO)['strategy'];
export const HOME_RANGE_OPTIONS = ['1D', '1W', '1M', '1Y', 'ALL'] as const;
export type HomeRange = (typeof HOME_RANGE_OPTIONS)[number];
export const DEFAULT_HOME_RANGE: HomeRange = '1Y';
const HOME_DASHBOARD_WINDOW_DAYS = 365;
const EMPTY_DAILY_VALUES: readonly DailyValuePoint[] = [];

/**
 * Shape consumed by HomeScreen. Disconnected/demo mode can still use DEMO;
 * connected live misses stay null/empty so the screen renders dashes.
 */
export interface HomeData {
  home: HomeViewData;
  strategy: StrategySlice;
}

export type HomeSnapshotAvailability = 'demo' | 'available' | 'unavailable';

export interface UseHomeDataResult {
  data: HomeData;
  isLoading: boolean;
  isError: boolean;
  snapshotAvailability: HomeSnapshotAvailability;
  walletAssets: UseWalletAssetsResult;
}

/**
 * Container hook for the Home screen.
 *
 * Wires the cleanly-available live signals into the DEMO.home / DEMO.strategy
 * shapes:
 * - total balance from the progressive landing balance section,
 * - latest adjacent-snapshot change and complete balance trend points from the
 *   unified dashboard trends series,
 * - the contrarian quote + market-mode label from the progressive strategy
 *   section (Fear & Greed quote + current regime).
 *
 * Wallet holdings come from the configured token-balance provider for the
 * connected EOA. Target pillars come from app-core/account-engine sources.
 * Default strategy ROI/drawdown metrics come from the backtesting compare
 * endpoint.
 *
 * @param subjectUserId Account-engine user id whose bundle is displayed —
 *   the viewer's own id or a `?userId=` bundle-view id. Analytics v2 paths
 *   are UUID-typed; a wallet address 422s, so it must never be passed here.
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

function unavailableBacktest(): StrategySlice['backtest'] {
  return {
    returnLabel: '—',
    vsBtcLabel: 'Trades —',
    vsEthLabel: 'Max DD —',
    metrics: [
      { label: 'ROI', value: '—', tone: 'positive' },
      { label: 'Max drawdown', value: '—', tone: 'negative' },
    ],
    currentModeLabel: '—',
    allocation: [],
    sentiment: null,
  };
}

export function useHomeData(
  subjectUserId: string | null,
  address: string | null,
  range: HomeRange,
  options: {
    isResolvingSubject?: boolean;
    isEtlInProgress?: boolean;
  } = {},
): UseHomeDataResult {
  // Hooks run unconditionally (React rules); analytics no-ops until we have
  // an account-engine user id to display.
  const analyticsSubjectId = subjectUserId?.trim() || null;
  const progressive = usePortfolioDataProgressive(
    analyticsSubjectId,
    Boolean(options.isEtlInProgress),
  );
  const dashboard = usePortfolioDashboard(
    analyticsSubjectId ?? undefined,
    getHomeDashboardWindowParams(),
  );
  // Transaction readiness must reflect the active signing EOA only. Bundle
  // wallets remain an analytics concern and must not inflate spendable funds.
  const walletAssets = useWalletAssets(address);
  const defaultBacktest = useDefaultStrategyBacktest();
  const suggestion = useStrategySuggestion(analyticsSubjectId);

  const demoHome = DEMO.home;
  const demoStrategy = DEMO.strategy;

  const balanceSection = progressive.sections?.balance;
  const strategySection = progressive.sections?.strategy;
  const hasPortfolioSnapshot = Boolean(progressive.unifiedData?.lastUpdated);

  const isResolvingSubject =
    Boolean(options.isResolvingSubject) && analyticsSubjectId === null;

  const isLoading =
    isResolvingSubject ||
    Boolean(balanceSection?.isLoading) ||
    Boolean(strategySection?.isLoading) ||
    dashboard.isLoading ||
    suggestion.isLoading;
  const isError =
    Boolean(balanceSection?.error) ||
    Boolean(strategySection?.error) ||
    dashboard.isError ||
    suggestion.isError;

  // While the subject is still resolving, stay in the live (skeleton) state
  // instead of flashing demo data.
  const isDemo = analyticsSubjectId === null && !isResolvingSubject;

  // --- Live: total balance from the landing balance section ---
  const totalBalance = isDemo
    ? demoHome.totalBalance
    : hasPortfolioSnapshot
      ? (balanceSection?.data?.balance ?? null)
      : null;

  // --- Live: latest adjacent-snapshot change + complete trend points. ---
  const dailyValues =
    dashboard.dashboard?.trends?.daily_values ?? EMPTY_DAILY_VALUES;
  const allTrendPoints = useMemo(
    () => toTrendPoints(dailyValues),
    [dailyValues],
  );
  const homeTrendPoints = useMemo(
    () =>
      trendPointsOrFallback(
        toTrendPoints(sliceHomeDailyValuesForRange(allTrendPoints, range)),
        demoHome.trendPoints,
        isDemo,
      ),
    [allTrendPoints, demoHome.trendPoints, isDemo, range],
  );
  const changeSource = isDemo ? demoHome.trendPoints : allTrendPoints;
  const latestDay = changeSource.at(-1);
  const latestChange = calculateAdjacentSnapshotChange(changeSource);

  const home: HomeViewData = {
    totalBalance,
    latestChangePct: latestChange?.pct ?? null,
    latestChangeUsd: latestChange?.usd ?? null,
    latestSnapshotDate: latestDay?.date ?? null,
    trendPoints: homeTrendPoints,
    assets: isDemo ? demoHome.assets : walletAssets.assets,
  };

  // --- Live: contrarian quote tied to current sentiment ---
  const quote = liveTextOrDemo(
    strategySection?.data?.sentimentQuote,
    demoStrategy.quote,
    isDemo,
  );

  // --- Live: current market regime → human-readable mode label ---
  const marketModeLabel = marketModeLabelFromRegime(
    strategySection?.data?.currentRegime ?? null,
    demoStrategy.marketModeLabel,
    isDemo,
  );

  const target = suggestion.data
    ? toCompositionTargetFromSuggestion(suggestion.data)
    : null;
  const pillars = pillarsFromTarget(target, demoStrategy.pillars, isDemo);

  const strategy: StrategySlice = {
    estApyLabel:
      defaultBacktest.data?.returnLabel ??
      (isDemo ? demoStrategy.estApyLabel : '—'),
    quote,
    marketModeLabel,
    pillars,
    backtest: defaultBacktest.data
      ? {
          ...demoStrategy.backtest,
          returnLabel: defaultBacktest.data.returnLabel,
          vsBtcLabel: defaultBacktest.data.vsBtcLabel,
          vsEthLabel: defaultBacktest.data.vsEthLabel,
          metrics: defaultBacktest.data.metrics,
        }
      : isDemo
        ? demoStrategy.backtest
        : unavailableBacktest(),
  };

  return {
    data: { home, strategy },
    isLoading,
    isError,
    snapshotAvailability: isDemo
      ? 'demo'
      : hasPortfolioSnapshot
        ? 'available'
        : 'unavailable',
    walletAssets,
  };
}
