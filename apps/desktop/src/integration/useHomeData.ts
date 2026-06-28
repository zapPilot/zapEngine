import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';
import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';

import { DEMO, type DemoAsset } from '@/data/demo';
import { mapDailyValuesToSparkline } from '@/integration/portfolioMetrics';
import {
  type InvestableBalanceRow,
  useInvestableBalances,
} from '@/integration/useInvestableBalances';
import {
  type CompositionTarget,
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
 * Base investable balances and target pillars come from app-core sources.
 * Est. APY has no clean source here and renders unavailable when connected.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   The portfolio hooks are user-scoped, so they only fetch once userId exists;
 *   while it is null the screen renders the layout in a calm loading state.
 */
function trendDaysForRange(range: HomeRange): number {
  if (range === '1D') return 2;
  if (range === '1W') return 7;
  if (range === '1M') return 30;
  return 365;
}

function assetsFromBalances(rows: InvestableBalanceRow[]): DemoAsset[] {
  return rows.map((row) => ({
    symbol: row.token.symbol,
    name: row.token.name,
    usdValue: row.usdValue,
    amountLabel: row.amountLabel,
    chains: ['base'],
    iconBg: row.token.iconBg,
    glyph: row.token.glyph,
  }));
}

function liveNumberOrDemo(
  value: unknown,
  demoValue: number | null,
  isDemo: boolean,
): number | null {
  if (typeof value === 'number') {
    return value;
  }
  return isDemo ? demoValue : null;
}

function liveTextOrDemo(
  value: string | null | undefined,
  demoValue: string,
  isDemo: boolean,
): string {
  return value ?? (isDemo ? demoValue : '—');
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

function marketModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return `Market mode · ${regimeLabel}`;
  }
  return isDemo ? demoLabel : 'Market mode · —';
}

function emptyPillars(): StrategySlice['pillars'] {
  return [
    { label: 'Equities', weight: 0, color: 'var(--spy)' },
    { label: 'Crypto', weight: 0, color: 'var(--btc)' },
    { label: 'Stables', weight: 0, color: 'var(--usd)' },
  ];
}

function pillarsFromTarget(
  target: CompositionTarget | null,
  demoPillars: StrategySlice['pillars'],
  isDemo: boolean,
): StrategySlice['pillars'] {
  if (target) {
    return [
      { label: 'Equities', weight: target.equities, color: 'var(--spy)' },
      { label: 'Crypto', weight: target.crypto, color: 'var(--btc)' },
      { label: 'Stables', weight: target.stables, color: 'var(--usd)' },
    ];
  }
  return isDemo ? demoPillars : emptyPillars();
}

export function useHomeData(
  userId: string | null,
  range: HomeRange,
): UseHomeDataResult {
  // Hooks run unconditionally (React rules); they no-op until userId resolves.
  const progressive = usePortfolioDataProgressive(userId);
  const dashboard = usePortfolioDashboard(userId ?? undefined, {
    trend_days: trendDaysForRange(range),
  });
  const investableBalances = useInvestableBalances();
  const suggestion = useStrategySuggestion(userId);

  const demoHome = DEMO.home;
  const demoStrategy = DEMO.strategy;

  const balanceSection = progressive.sections?.balance;
  const strategySection = progressive.sections?.strategy;

  const isLoading =
    userId === null ||
    Boolean(balanceSection?.isLoading) ||
    Boolean(strategySection?.isLoading) ||
    dashboard.isLoading ||
    (investableBalances.isConnected && investableBalances.isLoading) ||
    suggestion.isLoading;
  const isError =
    Boolean(balanceSection?.error) ||
    Boolean(strategySection?.error) ||
    dashboard.isError ||
    investableBalances.isError ||
    suggestion.isError;

  const isDemo = userId === null;

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
    assets: isDemo
      ? demoHome.assets
      : assetsFromBalances(investableBalances.rows),
  };

  // --- Live: contrarian quote tied to current sentiment ---
  const quote = liveTextOrDemo(
    strategySection?.data?.sentimentQuote,
    demoStrategy.quote,
    isDemo,
  );

  // --- Live: current market regime → human-readable mode label ---
  const currentRegime = strategySection?.data?.currentRegime;
  const regimeLabel = currentRegime ? getRegimeLabel(currentRegime) : '';
  const marketModeLabel = marketModeLabelFor(
    regimeLabel,
    demoStrategy.marketModeLabel,
    isDemo,
  );

  const target = suggestion.data
    ? toCompositionTargetFromSuggestion(suggestion.data)
    : null;
  const pillars = pillarsFromTarget(target, demoStrategy.pillars, isDemo);

  const strategy: StrategySlice = {
    estApyLabel: isDemo ? demoStrategy.estApyLabel : '—',
    quote,
    marketModeLabel,
    pillars,
    // Backtest is unused by the Home card; pass the demo slice through untouched.
    backtest: demoStrategy.backtest,
  };

  return { data: { home, strategy }, isLoading, isError };
}
