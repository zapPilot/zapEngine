import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';

import { DEMO } from '@/data/demo';
import {
  type DailyValuePoint,
  mapDailyValuesToSparkline,
} from '@/integration/portfolioMetrics';
import {
  liveNumberOrDemo,
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
type StrategySlice = (typeof DEMO)['strategy'];
export type HomeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const DEFAULT_HOME_RANGE: HomeRange = '1Y';
const HOME_DASHBOARD_WINDOW_DAYS = 365;

/**
 * Shape consumed by HomeScreen. Disconnected/demo mode can still use DEMO;
 * connected live misses stay null/empty so the screen renders dashes.
 */
export interface HomeData {
  home: HomeSlice;
  strategy: StrategySlice;
}

export interface UseHomeDataResult {
  data: HomeData | null;
  isLoading: boolean;
  isError: boolean;
  walletAssets: UseWalletAssetsResult;
}

/**
 * Container hook for the Home screen.
 *
 * Wires the cleanly-available live signals into the DEMO.home / DEMO.strategy
 * shapes:
 * - total balance from the progressive landing balance section,
 * - today's change % / USD and the balance sparkline from the unified dashboard
 *   trends series,
 * - the contrarian quote + market-mode label from the progressive strategy
 *   section (Fear & Greed quote + current regime).
 *
 * Wallet holdings come from the configured token-balance provider for the
 * connected EOA. Target pillars come from app-core/account-engine sources.
 * Default strategy ROI/drawdown metrics come from the backtesting compare
 * endpoint.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   Analytics endpoints accept the account-engine id or a connected wallet
 *   address, so Home can still request `/landing` and `/dashboard` while the
 *   backend user record is settling.
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
  const sorted = [...dailyValues].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
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

export function resolveHomeAnalyticsSubjectId(
  userId: string | null,
  address: string | null,
): string | null {
  const resolvedUserId = userId?.trim();
  if (resolvedUserId) {
    return resolvedUserId;
  }

  const resolvedAddress = address?.trim();
  return resolvedAddress || null;
}

function sparklineOrFallback(
  liveSparkline: number[],
  demoSparkline: number[],
  isDemo: boolean,
): number[] {
  if (liveSparkline.length >= 2) {
    return liveSparkline;
  }
  return isDemo ? demoSparkline : [];
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
  userId: string | null,
  address: string | null,
  range: HomeRange,
  _walletAddresses: readonly string[] = [],
): UseHomeDataResult {
  // Hooks run unconditionally (React rules); analytics no-ops until we have
  // either an account-engine user id or a connected wallet address.
  const analyticsSubjectId = resolveHomeAnalyticsSubjectId(userId, address);
  const progressive = usePortfolioDataProgressive(analyticsSubjectId);
  const dashboard = usePortfolioDashboard(
    analyticsSubjectId ?? undefined,
    getHomeDashboardWindowParams(),
  );
  // Transaction readiness must reflect the active signing EOA only. Bundle
  // wallets remain an analytics concern and must not inflate spendable funds.
  const walletAssets = useWalletAssets(address);
  const defaultBacktest = useDefaultStrategyBacktest();
  const suggestion = useStrategySuggestion(userId);

  const demoHome = DEMO.home;
  const demoStrategy = DEMO.strategy;

  const balanceSection = progressive.sections?.balance;
  const strategySection = progressive.sections?.strategy;

  const isLoading =
    Boolean(balanceSection?.isLoading) ||
    Boolean(strategySection?.isLoading) ||
    dashboard.isLoading ||
    suggestion.isLoading;
  const isError =
    Boolean(balanceSection?.error) ||
    Boolean(strategySection?.error) ||
    dashboard.isError ||
    suggestion.isError;

  const isDemo = analyticsSubjectId === null;

  // --- Live: total balance from the landing balance section ---
  const totalBalance = isDemo
    ? demoHome.totalBalance
    : (balanceSection?.data?.balance ?? null);

  // --- Live: today's change + balance sparkline from the trends series ---
  const dailyValues = dashboard.dashboard?.trends?.daily_values ?? [];
  // Use array.at(-1) for the latest day — never index with [-1].
  const latestDay = dailyValues.at(-1);

  const sparkline = mapDailyValuesToSparkline(
    sliceHomeDailyValuesForRange(dailyValues, range),
  );
  const homeSparkline = sparklineOrFallback(
    sparkline,
    demoHome.sparkline,
    isDemo,
  );

  const home: HomeSlice = {
    totalBalance,
    changePct: liveNumberOrDemo(
      latestDay?.change_percentage,
      demoHome.changePct,
      isDemo,
    ),
    changeUsdToday: liveNumberOrDemo(
      latestDay?.pnl_usd,
      demoHome.changeUsdToday,
      isDemo,
    ),
    sparkline: homeSparkline,
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
    walletAssets,
  };
}
