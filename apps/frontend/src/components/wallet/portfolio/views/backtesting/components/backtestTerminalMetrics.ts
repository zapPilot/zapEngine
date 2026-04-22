import type { BacktestStrategySummary } from '@/types/backtesting';

export interface HeroMetric {
  label: string;
  value: string;
  bar: string;
  color: string;
}
function asciiBar(value: number, max: number, width: number): string {
  if (max <= 0) {
    return '\u2591'.repeat(width);
  }

  const filled = Math.round((Math.min(Math.abs(value), max) / max) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

export function createHeroMetrics(
  strategy: BacktestStrategySummary | undefined,
): HeroMetric[] {
  if (!strategy) {
    return [];
  }

  return [
    {
      label: 'ROI',
      value: `${strategy.roi_percent >= 0 ? '+' : ''}${strategy.roi_percent.toFixed(1)}%`,
      bar: asciiBar(strategy.roi_percent, 200, 10),
      color: 'text-emerald-400',
    },
    {
      label: 'CALMAR',
      value: strategy.calmar_ratio?.toFixed(2) ?? 'N/A',
      bar: asciiBar(strategy.calmar_ratio ?? 0, 5, 10),
      color: 'text-cyan-400',
    },
    {
      label: 'MAX DRAWDOWN',
      value:
        strategy.max_drawdown_percent != null
          ? `${Math.abs(strategy.max_drawdown_percent).toFixed(1)}%`
          : 'N/A',
      bar: asciiBar(Math.abs(strategy.max_drawdown_percent ?? 0), 30, 10),
      color: 'text-rose-400',
    },
  ];
}

/**
 * Computes a human-readable trade frequency label.
 *
 * @param tradeCount - Total number of trades in the backtest period
 * @param actualDays - Number of simulated days
 * @returns A label like "1 trade every 42 days", or null if inputs are invalid
 *
 * @example
 * ```ts
 * formatTradeFrequency(12, 500) // "1 trade every 42 days"
 * ```
 */
export function formatTradeFrequency(
  tradeCount: number,
  actualDays: number,
): string | null {
  if (tradeCount <= 0 || actualDays <= 0) return null;
  const daysPerTrade = Math.round(actualDays / tradeCount);
  if (daysPerTrade <= 1) return '1+ trades per day';
  return `1 trade every ${daysPerTrade} days`;
}
