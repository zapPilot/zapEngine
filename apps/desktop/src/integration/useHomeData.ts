import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';

import { DEMO } from '@/data/demo';
import { useMoralisWalletAssets } from '@/integration/moralisWallet';
import { mapDailyValuesToSparkline } from '@/integration/portfolioMetrics';
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

type HomeSlice = (typeof DEMO)['home'];
type StrategySlice = (typeof DEMO)['strategy'];
export type HomeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

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
  walletAssets: {
    isConnected: boolean;
    isLoading: boolean;
    isError: boolean;
  };
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
 * Wallet holdings come from Moralis Asset Holdings for the connected EOA.
 * Target pillars come from app-core/account-engine sources. Default strategy
 * ROI/drawdown metrics come from the backtesting compare endpoint.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   Analytics endpoints accept the account-engine id or a connected wallet
 *   address, so Home can still request `/landing` and `/dashboard` while the
 *   backend user record is settling.
 */
function trendDaysForRange(range: HomeRange): number {
  if (range === '1D') return 2;
  if (range === '1W') return 7;
  if (range === '1M') return 30;
  return 365;
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
): UseHomeDataResult {
  // Hooks run unconditionally (React rules); analytics no-ops until we have
  // either an account-engine user id or a connected wallet address.
  const analyticsSubjectId = resolveHomeAnalyticsSubjectId(userId, address);
  const progressive = usePortfolioDataProgressive(analyticsSubjectId);
  const trendDays = trendDaysForRange(range);
  const dashboard = usePortfolioDashboard(analyticsSubjectId ?? undefined, {
    trend_days: trendDays,
    drawdown_days: trendDays,
    rolling_days: trendDays,
  });
  const walletAssets = useMoralisWalletAssets(address);
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

  const isDemo = address === null;

  // --- Live: total balance from the landing balance section ---
  const totalBalance = isDemo
    ? demoHome.totalBalance
    : (balanceSection?.data?.balance ?? null);

  // --- Live: today's change + balance sparkline from the trends series ---
  const dailyValues = dashboard.dashboard?.trends?.daily_values ?? [];
  // Use array.at(-1) for the latest day — never index with [-1].
  const latestDay = dailyValues.at(-1);

  const sparkline = mapDailyValuesToSparkline(dailyValues);
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
    walletAssets: {
      isConnected: walletAssets.isConnected,
      isLoading: walletAssets.isLoading,
      isError: walletAssets.isError,
    },
  };
}
