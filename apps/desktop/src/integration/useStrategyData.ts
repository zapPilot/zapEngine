import { useRegimeHistory } from '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery';
import { useSentimentData } from '@zapengine/app-core/hooks/queries/market/useSentimentQuery';
import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';

import { DEMO } from '@/data/demo';
import {
  allocationFromTarget,
  currentModeLabelFor,
  demoTextOrDash,
  liveNumberOrDemo,
  liveTextOrDemo,
  marketModeLabelFor,
  pillarsFromTarget,
} from '@/integration/strategyPresentation';
import { useDefaultStrategyBacktest } from '@/integration/useDefaultStrategyBacktest';
import {
  toCompositionTargetFromSuggestion,
  useStrategySuggestion,
} from '@/integration/useStrategySuggestion';

/**
 * Shape consumed by StrategyScreen. Disconnected/demo mode can still use DEMO;
 * connected unavailable fields are explicit dashes.
 */
export type StrategyData = (typeof DEMO)['strategy'] & {
  hasTargetAllocation: boolean;
};

export interface UseStrategyDataResult {
  data: StrategyData | null;
  isLoading: boolean;
  isError: boolean;
}

function unavailableBacktestMetrics(): StrategyData['backtest']['metrics'] {
  return [
    { label: 'ROI', value: '—', tone: 'positive' },
    { label: 'Max drawdown', value: '—', tone: 'negative' },
    { label: 'Sharpe', value: '—', tone: 'accent' },
    { label: 'Calmar', value: '—', tone: 'accent' },
    { label: 'Volatility', value: '—', tone: 'neutral' },
    { label: 'Win rate', value: '—', tone: 'neutral' },
    { label: 'Trades', value: '—', tone: 'neutral' },
    { label: 'Final value', value: '—', tone: 'positive' },
  ];
}

/**
 * Container hook for the Strategy screen.
 *
 * Wires the cleanly-available live signals — Fear & Greed sentiment value +
 * quote, current market regime, and target allocation. Backtest performance
 * metrics stay unavailable until a lazy run flow exists.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   Sentiment/regime are market-wide (not user-scoped), so the hooks run as soon
 *   as the screen mounts; userId only gates the "still resolving identity" state.
 */
export function useStrategyData(
  userId: string | null,
  isConnected: boolean,
): UseStrategyDataResult {
  // Market-wide signals — no userId needed; run unconditionally (React rules).
  const sentiment = useSentimentData();
  const regime = useRegimeHistory();
  const suggestion = useStrategySuggestion(userId);
  const defaultBacktest = useDefaultStrategyBacktest();

  const demoStrategy = DEMO.strategy;
  const demoBacktest = demoStrategy.backtest;
  const isDemo = !isConnected;

  const isLoading =
    isDemo ||
    sentiment.isLoading ||
    regime.isLoading ||
    suggestion.isLoading ||
    defaultBacktest.isLoading;
  // Regime degrades to DEFAULT_REGIME_HISTORY internally (never errors), so a
  // genuine failure here is sentiment-only.
  const isError = sentiment.isError || defaultBacktest.isError;

  // --- Live: Fear & Greed sentiment marker (0–100) ---
  const sentimentValue = liveNumberOrDemo(
    sentiment.data?.value,
    demoBacktest.sentiment,
    isDemo,
  );

  // --- Live: contrarian discipline quote tied to current sentiment ---
  const quote = liveTextOrDemo(
    sentiment.data?.quote?.quote,
    demoStrategy.quote,
    isDemo,
  );

  // --- Live: current market regime → human-readable mode label ---
  const currentRegime = regime.data?.currentRegime;
  const regimeLabel = currentRegime ? getRegimeLabel(currentRegime) : '';
  const currentModeLabel = currentModeLabelFor(
    regimeLabel,
    demoBacktest.currentModeLabel,
    isDemo,
  );
  const marketModeLabel = marketModeLabelFor(
    regimeLabel,
    demoStrategy.marketModeLabel,
    isDemo,
  );

  const target = suggestion.data
    ? toCompositionTargetFromSuggestion(suggestion.data)
    : null;
  const hasTargetAllocation = target !== null;
  const pillars = pillarsFromTarget(target, demoStrategy.pillars, isDemo);
  const allocation = allocationFromTarget(
    target,
    demoBacktest.allocation,
    isDemo,
  );
  const backtestMetrics = defaultBacktest.data
    ? defaultBacktest.data.metrics
    : isDemo
      ? demoBacktest.metrics
      : unavailableBacktestMetrics();

  const data: StrategyData = {
    estApyLabel:
      defaultBacktest.data?.returnLabel ??
      demoTextOrDash(demoStrategy.estApyLabel, isDemo),
    quote,
    marketModeLabel,
    pillars,
    backtest: {
      returnLabel:
        defaultBacktest.data?.returnLabel ??
        demoTextOrDash(demoBacktest.returnLabel, isDemo),
      vsBtcLabel:
        defaultBacktest.data?.vsBtcLabel ??
        demoTextOrDash(demoBacktest.vsBtcLabel, isDemo, 'Trades —'),
      vsEthLabel:
        defaultBacktest.data?.vsEthLabel ??
        demoTextOrDash(demoBacktest.vsEthLabel, isDemo, 'Max DD —'),
      metrics: backtestMetrics,
      currentModeLabel,
      allocation,
      sentiment: sentimentValue,
    },
    hasTargetAllocation,
  };

  return { data, isLoading, isError };
}
