import { useRegimeHistory } from '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery';
import { useSentimentData } from '@zapengine/app-core/hooks/queries/market/useSentimentQuery';
import { getRegimeLabel } from '@zapengine/app-core/lib/domain/regime';

import { DEMO } from '@/data/demo';
import {
  type CompositionTarget,
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

function demoTextOrDash(
  demoValue: string,
  isDemo: boolean,
  fallback = '—',
): string {
  return isDemo ? demoValue : fallback;
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

function currentModeLabelFor(
  regimeLabel: string,
  demoLabel: string,
  isDemo: boolean,
): string {
  if (regimeLabel) {
    return regimeLabel;
  }
  return demoTextOrDash(demoLabel, isDemo);
}

function emptyPillars(): StrategyData['pillars'] {
  return [
    { label: 'Equities', weight: 0, color: 'var(--spy)' },
    { label: 'Crypto', weight: 0, color: 'var(--btc)' },
    { label: 'Stables', weight: 0, color: 'var(--usd)' },
  ];
}

function pillarsFromTarget(
  target: CompositionTarget | null,
  demoPillars: StrategyData['pillars'],
  isDemo: boolean,
): StrategyData['pillars'] {
  if (target) {
    return [
      { label: 'Equities', weight: target.equities, color: 'var(--spy)' },
      { label: 'Crypto', weight: target.crypto, color: 'var(--btc)' },
      { label: 'Stables', weight: target.stables, color: 'var(--usd)' },
    ];
  }
  return isDemo ? demoPillars : emptyPillars();
}

function emptyAllocation(): StrategyData['backtest']['allocation'] {
  return [
    { label: 'Equities', pct: 0, color: 'var(--spy)' },
    { label: 'Crypto', pct: 0, color: 'var(--btc)' },
    { label: 'Stables', pct: 0, color: 'var(--usd)' },
  ];
}

function allocationFromTarget(
  target: CompositionTarget | null,
  demoAllocation: StrategyData['backtest']['allocation'],
  isDemo: boolean,
): StrategyData['backtest']['allocation'] {
  if (target) {
    return [
      {
        label: 'Equities',
        pct: Math.round(target.equities),
        color: 'var(--spy)',
      },
      { label: 'Crypto', pct: Math.round(target.crypto), color: 'var(--btc)' },
      {
        label: 'Stables',
        pct: Math.round(target.stables),
        color: 'var(--usd)',
      },
    ];
  }
  return isDemo ? demoAllocation : emptyAllocation();
}

function unavailableBacktestMetrics(): StrategyData['backtest']['metrics'] {
  return [
    { label: 'CAGR', value: '—', tone: 'positive' },
    { label: 'Max drawdown', value: '—', tone: 'negative' },
    { label: 'Volatility', value: '—', tone: 'neutral' },
    { label: 'Sharpe', value: '—', tone: 'accent' },
    { label: 'Sortino', value: '—', tone: 'accent' },
    { label: 'Win rate', value: '—', tone: 'neutral' },
    { label: 'Worst month', value: '—', tone: 'negative' },
    { label: 'Best month', value: '—', tone: 'positive' },
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
export function useStrategyData(userId: string | null): UseStrategyDataResult {
  // Market-wide signals — no userId needed; run unconditionally (React rules).
  const sentiment = useSentimentData();
  const regime = useRegimeHistory();
  const suggestion = useStrategySuggestion(userId);

  const demoStrategy = DEMO.strategy;
  const demoBacktest = demoStrategy.backtest;
  const isDemo = userId === null;

  const isLoading =
    isDemo || sentiment.isLoading || regime.isLoading || suggestion.isLoading;
  // Regime degrades to DEFAULT_REGIME_HISTORY internally (never errors), so a
  // genuine failure here is sentiment-only.
  const isError = sentiment.isError;

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
  const backtestMetrics = isDemo
    ? demoBacktest.metrics
    : unavailableBacktestMetrics();

  const data: StrategyData = {
    estApyLabel: demoTextOrDash(demoStrategy.estApyLabel, isDemo),
    quote,
    marketModeLabel,
    pillars,
    backtest: {
      returnLabel: demoTextOrDash(demoBacktest.returnLabel, isDemo),
      vsBtcLabel: demoTextOrDash(
        demoBacktest.vsBtcLabel,
        isDemo,
        'BTC comparison —',
      ),
      vsEthLabel: demoTextOrDash(
        demoBacktest.vsEthLabel,
        isDemo,
        'ETH comparison —',
      ),
      metrics: backtestMetrics,
      currentModeLabel,
      allocation,
      sentiment: sentimentValue,
    },
    hasTargetAllocation,
  };

  return { data, isLoading, isError };
}
