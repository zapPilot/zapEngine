import strategySnapshot from './strategy-snapshot.json';

const BACKTEST_STRATEGY_ID = strategySnapshot.default_strategy_id;

interface StrategyMetrics {
  display_name: string;
  calmar_ratio: number;
  sharpe_ratio: number;
  max_drawdown_percent: number;
  roi_percent: number;
  trade_count: number;
}

interface StrategyPerformanceSnapshot {
  reference_date: string;
  window_days: number;
  window_start: string;
  window_end: string;
  default_strategy_id: string;
  strategies: Record<string, StrategyMetrics>;
}

export interface BacktestSnapshot {
  strategyId: typeof BACKTEST_STRATEGY_ID;
  displayName: string;
  referenceDate: string;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  raw: {
    roiPercent: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    calmarRatio: number;
    tradeCount: number;
  };
  roiPercent: string;
  maxDrawdownPercent: string;
  sharpeRatio: string;
  calmarRatio: string;
  tradeCount: string;
}

export function formatMetricPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatRatio(value: number): string {
  return value.toFixed(2);
}

export function formatPercentagePoint(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}pp`;
}

export function getBacktestSnapshot(): BacktestSnapshot {
  const snapshot = strategySnapshot as StrategyPerformanceSnapshot;
  const strategy = snapshot.strategies[BACKTEST_STRATEGY_ID];

  if (!strategy) {
    throw new Error(`Missing strategy snapshot: ${BACKTEST_STRATEGY_ID}`);
  }

  return {
    strategyId: BACKTEST_STRATEGY_ID,
    displayName: strategy.display_name,
    referenceDate: snapshot.reference_date,
    windowDays: snapshot.window_days,
    windowStart: snapshot.window_start,
    windowEnd: snapshot.window_end,
    raw: {
      roiPercent: strategy.roi_percent,
      maxDrawdownPercent: strategy.max_drawdown_percent,
      sharpeRatio: strategy.sharpe_ratio,
      calmarRatio: strategy.calmar_ratio,
      tradeCount: strategy.trade_count,
    },
    roiPercent: formatMetricPercent(strategy.roi_percent),
    maxDrawdownPercent: formatMetricPercent(strategy.max_drawdown_percent),
    sharpeRatio: formatRatio(strategy.sharpe_ratio),
    calmarRatio: formatRatio(strategy.calmar_ratio),
    tradeCount: String(strategy.trade_count),
  };
}
