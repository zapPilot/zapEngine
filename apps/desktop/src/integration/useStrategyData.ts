import { useRegimeHistory } from '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery';
import { useSentimentData } from '@zapengine/app-core/hooks/queries/market/useSentimentQuery';
import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';

import { MOCK } from '@/data/mock';

/**
 * Shape consumed by StrategyScreen — mirrors MOCK.strategy 1:1 so the
 * presentational JSX is data-source agnostic.
 */
export type StrategyData = (typeof MOCK)['strategy'];

export interface UseStrategyDataResult {
  data: StrategyData | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Container hook for the Strategy screen.
 *
 * Wires the cleanly-available live signals — Fear & Greed sentiment value +
 * quote, and the current market regime — into the MOCK.strategy shape. Backtest
 * performance metrics stay on MOCK: a live backtest needs a strategies config +
 * date range the screen does not own, and inventing one would fabricate numbers.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   Sentiment/regime are market-wide (not user-scoped), so the hooks run as soon
 *   as the screen mounts; userId only gates the "still resolving identity" state.
 */
export function useStrategyData(userId: string | null): UseStrategyDataResult {
  // Market-wide signals — no userId needed; run unconditionally (React rules).
  const sentiment = useSentimentData();
  const regime = useRegimeHistory();

  const mockStrategy = MOCK.strategy;
  const mockBacktest = mockStrategy.backtest;

  const isLoading = userId === null || sentiment.isLoading || regime.isLoading;
  // Regime degrades to DEFAULT_REGIME_HISTORY internally (never errors), so a
  // genuine failure here is sentiment-only.
  const isError = sentiment.isError;

  // --- Live: Fear & Greed sentiment marker (0–100) ---
  const sentimentValue =
    typeof sentiment.data?.value === 'number'
      ? sentiment.data.value
      : mockBacktest.sentiment; // NOTE(real-data): sentiment unavailable — fall back to mock marker

  // --- Live: contrarian discipline quote tied to current sentiment ---
  const quote = sentiment.data?.quote?.quote ?? mockStrategy.quote;

  // --- Live: current market regime → human-readable mode label ---
  const currentRegime = regime.data?.currentRegime;
  const regimeLabel = currentRegime ? getRegimeLabel(currentRegime) : '';
  const currentModeLabel = regimeLabel || mockBacktest.currentModeLabel;
  const marketModeLabel = regimeLabel
    ? `Market mode · ${regimeLabel}`
    : mockStrategy.marketModeLabel;

  const data: StrategyData = {
    // NOTE(real-data): est. APY range has no live strategy-quote source here.
    estApyLabel: mockStrategy.estApyLabel,
    quote,
    marketModeLabel,
    // NOTE(real-data): home-card pillar weights are not exposed by sentiment/regime.
    pillars: mockStrategy.pillars,
    backtest: {
      // NOTE(real-data): backtest return/vs-BTC/vs-ETH need a runBacktest request
      // (strategies config + date range) the screen does not provide.
      returnLabel: mockBacktest.returnLabel,
      vsBtcLabel: mockBacktest.vsBtcLabel,
      vsEthLabel: mockBacktest.vsEthLabel,
      // NOTE(real-data): CAGR/drawdown/Sharpe/Sortino/win-rate come from runBacktest.
      metrics: mockBacktest.metrics,
      currentModeLabel,
      // NOTE(real-data): regime-driven target allocation is not in the regime payload.
      allocation: mockBacktest.allocation,
      sentiment: sentimentValue,
    },
  };

  return { data, isLoading, isError };
}
