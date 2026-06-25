import { usePortfolioDashboard } from '@zapengine/app-core/hooks/analytics/usePortfolioDashboard';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';
import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';

import { MOCK } from '@/data/mock';

type HomeSlice = (typeof MOCK)['home'];
type StrategySlice = (typeof MOCK)['strategy'];

/**
 * Shape consumed by HomeScreen — mirrors the MOCK.home / MOCK.strategy slices
 * the card JSX reads, so the presentational layer is data-source agnostic.
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
 * Wires the cleanly-available live signals into the MOCK.home / MOCK.strategy
 * shapes:
 * - total balance from the progressive landing balance section,
 * - today's change % / USD and the balance sparkline from the unified dashboard
 *   trends series,
 * - the contrarian quote + market-mode label from the progressive strategy
 *   section (Fear & Greed quote + current regime).
 *
 * Per-token holdings, the est. APY range, and the home strategy pillar weights
 * have no clean live source here and stay on MOCK (see NOTE(real-data) notes) —
 * fabricating holdings or weights would invent numbers.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   The portfolio hooks are user-scoped, so they only fetch once userId exists;
 *   while it is null the screen renders the layout in a calm loading state.
 */
export function useHomeData(userId: string | null): UseHomeDataResult {
  // Hooks run unconditionally (React rules); they no-op until userId resolves.
  const progressive = usePortfolioDataProgressive(userId);
  const dashboard = usePortfolioDashboard(userId ?? undefined);

  const mockHome = MOCK.home;
  const mockStrategy = MOCK.strategy;

  const balanceSection = progressive.sections?.balance;
  const strategySection = progressive.sections?.strategy;

  const isLoading =
    userId === null ||
    Boolean(balanceSection?.isLoading) ||
    Boolean(strategySection?.isLoading) ||
    dashboard.isLoading;
  const isError =
    Boolean(balanceSection?.error) ||
    Boolean(strategySection?.error) ||
    dashboard.isError;

  // --- Live: total balance from the landing balance section ---
  const totalBalance = balanceSection?.data?.balance ?? mockHome.totalBalance;

  // --- Live: today's change + balance sparkline from the trends series ---
  const dailyValues = dashboard.dashboard?.trends?.daily_values ?? [];
  // Use array.at(-1) for the latest day — never index with [-1].
  const latestDay = dailyValues.at(-1);

  const changePct =
    typeof latestDay?.change_percentage === 'number'
      ? latestDay.change_percentage
      : mockHome.changePct; // NOTE(real-data): no trends series yet — fall back to mock change %
  const changeUsdToday =
    typeof latestDay?.pnl_usd === 'number'
      ? latestDay.pnl_usd
      : mockHome.changeUsdToday; // NOTE(real-data): no trends series yet — fall back to mock today USD

  const sparkline = dailyValues
    .map((point) => point?.total_value_usd)
    .filter((value): value is number => typeof value === 'number');
  // A single point cannot render a line; keep the mock curve until ≥2 points.
  const homeSparkline = sparkline.length >= 2 ? sparkline : mockHome.sparkline; // NOTE(real-data): trends series empty/too short — fall back to mock sparkline

  const home: HomeSlice = {
    totalBalance,
    changePct,
    changeUsdToday,
    sparkline: homeSparkline,
    // NOTE(real-data): per-token holdings (symbol/name/usdValue/chains) have no
    // clean portfolio-wide source — the token-balance hooks need an explicit
    // chain + token list, and useTokenBalanceQuery resolves a single mocked
    // token. Keep the mock asset rows rather than fabricate holdings.
    assets: mockHome.assets,
  };

  // --- Live: contrarian quote tied to current sentiment ---
  const quote = strategySection?.data?.sentimentQuote ?? mockStrategy.quote;

  // --- Live: current market regime → human-readable mode label ---
  const currentRegime = strategySection?.data?.currentRegime;
  const regimeLabel = currentRegime ? getRegimeLabel(currentRegime) : '';
  const marketModeLabel = regimeLabel
    ? `Market mode · ${regimeLabel}`
    : mockStrategy.marketModeLabel;

  const strategy: StrategySlice = {
    // NOTE(real-data): est. APY range has no live strategy-quote source here.
    estApyLabel: mockStrategy.estApyLabel,
    quote,
    marketModeLabel,
    // NOTE(real-data): the 3-pillar home weights (Equities/Crypto/Stables) are
    // not derivable from the regime crypto/stable target — keep mock weights.
    pillars: mockStrategy.pillars,
    // Backtest is unused by the Home card; pass the mock slice through untouched.
    backtest: mockStrategy.backtest,
  };

  return { data: { home, strategy }, isLoading, isError };
}
