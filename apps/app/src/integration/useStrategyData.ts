import { useRegimeHistory } from '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery';

import type { MetricTone } from '@/integration/portfolioTypes';
import {
  type CompositionRow,
  compositionRows,
  currentModeLabelFor,
} from '@/integration/strategyPresentation';
import { useDefaultStrategyBacktest } from '@/integration/useDefaultStrategyBacktest';
import {
  toCompositionTargetFromSuggestion,
  useStrategySuggestion,
} from '@/integration/useStrategySuggestion';

interface StrategyMetric {
  label: string;
  value: string;
  tone: MetricTone;
}

/**
 * Shape consumed by StrategyScreen. Every field comes from a live source;
 * anything unavailable is an explicit dash, never demo data.
 */
export interface StrategyData {
  backtest: {
    returnLabel: string;
    vsBtcLabel: string;
    vsEthLabel: string;
    metrics: StrategyMetric[];
    currentModeLabel: string;
    allocation: CompositionRow[];
    chartData: number[];
    displayName: string | null;
  };
  hasTargetAllocation: boolean;
}

export interface UseStrategyDataResult {
  data: StrategyData;
  isLoading: boolean;
  isError: boolean;
}

function unavailableBacktestMetrics(): StrategyMetric[] {
  return [
    { label: 'ROI', value: '—', tone: 'positive' },
    { label: 'Max drawdown', value: '—', tone: 'negative' },
    { label: 'Sharpe', value: '—', tone: 'neutral' },
    { label: 'Calmar', value: '—', tone: 'neutral' },
    { label: 'Volatility', value: '—', tone: 'neutral' },
    { label: 'Win rate', value: '—', tone: 'neutral' },
    { label: 'Trades', value: '—', tone: 'neutral' },
    { label: 'Final value', value: '—', tone: 'positive' },
  ];
}

/**
 * Container hook for the Strategy screen.
 *
 * Wires the cleanly-available live signals — current market regime, target
 * allocation, and the reference strategy's default backtest metrics/chart
 * data when analytics is available.
 *
 * @param userId Resolved account-engine user id, or null while connecting.
 *   Regime is market-wide (not user-scoped), so its hook runs as soon as the
 *   screen mounts; userId only gates the user-scoped target allocation.
 * @param backtestDays Backtest window; omitted uses the server default.
 */
export function useStrategyData(
  userId: string | null,
  backtestDays?: number,
): UseStrategyDataResult {
  // Market-wide regime — no userId needed; run unconditionally (React rules).
  const regime = useRegimeHistory();
  const suggestion = useStrategySuggestion(userId);
  const defaultBacktest = useDefaultStrategyBacktest(backtestDays);

  const isLoading =
    regime.isLoading || suggestion.isLoading || defaultBacktest.isLoading;
  // Regime degrades to DEFAULT_REGIME_HISTORY internally (never errors), so a
  // genuine failure here is backtest-only.
  const isError = defaultBacktest.isError;

  const target = suggestion.data
    ? toCompositionTargetFromSuggestion(suggestion.data)
    : null;
  const backtest = defaultBacktest.data;

  const data: StrategyData = {
    backtest: {
      returnLabel: backtest?.returnLabel ?? '—',
      vsBtcLabel: backtest?.vsBtcLabel ?? 'Trades —',
      vsEthLabel: backtest?.vsEthLabel ?? 'Max DD —',
      metrics: backtest?.metrics ?? unavailableBacktestMetrics(),
      currentModeLabel: currentModeLabelFor(regime.data?.currentRegime),
      allocation: compositionRows(target),
      chartData: backtest?.chartData ?? [],
      displayName: backtest?.displayName ?? null,
    },
    hasTargetAllocation: target !== null,
  };

  return { data, isLoading, isError };
}
