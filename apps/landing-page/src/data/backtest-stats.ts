import { formatPercentagePoint, getBacktestSnapshot } from './snapshot';
import strategySnapshot from './strategy-snapshot.json';
import { formatPercent } from '@/lib/formatPercent';

const UNICODE_MINUS = '−';

const SNAPSHOT = getBacktestSnapshot();
const DCA = strategySnapshot.strategies.dca_classic;

export interface BacktestStat {
  label: string;
  value: string;
  sublabel: string;
  tone: 'accent' | 'good' | 'default';
}

export interface BacktestComparisonRow {
  label: string;
  roi: string;
  maxDrawdown: string;
  trades: string;
  highlighted: boolean;
}

function displayRatio(value: number): string {
  if (value < 0) {
    return `${UNICODE_MINUS}${Math.abs(value).toFixed(2)}`;
  }
  return value.toFixed(2);
}

function percent(value: number): string {
  return formatPercent(value, { scale: 1, signed: 'unicode' });
}

export function buildBacktestStats(): BacktestStat[] {
  return [
    {
      label: 'ROI vs DCA',
      value: formatPercentagePoint(SNAPSHOT.raw.roiPercent - DCA.roi_percent),
      sublabel: `${percent(SNAPSHOT.raw.roiPercent)} vs ${percent(DCA.roi_percent)}`,
      tone: 'accent',
    },
    {
      label: 'Strategy ROI',
      value: percent(SNAPSHOT.raw.roiPercent),
      sublabel: `${SNAPSHOT.windowDays}-day window`,
      tone: 'default',
    },
    {
      label: 'Calmar ratio',
      value: displayRatio(SNAPSHOT.raw.calmarRatio),
      sublabel: `vs DCA: ${displayRatio(DCA.calmar_ratio)}`,
      tone: 'default',
    },
    {
      label: 'Sharpe ratio',
      value: displayRatio(SNAPSHOT.raw.sharpeRatio),
      sublabel: `vs DCA: ${displayRatio(DCA.sharpe_ratio)}`,
      tone: 'default',
    },
    {
      label: 'Max drawdown',
      value: percent(SNAPSHOT.raw.maxDrawdownPercent),
      sublabel: `vs DCA: ${percent(DCA.max_drawdown_percent)}`,
      tone: 'good',
    },
  ];
}

export function buildComparisonRows(): BacktestComparisonRow[] {
  return [
    {
      label: SNAPSHOT.displayName,
      roi: percent(SNAPSHOT.raw.roiPercent),
      maxDrawdown: percent(SNAPSHOT.raw.maxDrawdownPercent),
      trades: `${SNAPSHOT.raw.tradeCount}`,
      highlighted: true,
    },
    {
      label: DCA.display_name,
      roi: percent(DCA.roi_percent),
      maxDrawdown: percent(DCA.max_drawdown_percent),
      trades: `${DCA.trade_count}`,
      highlighted: false,
    },
  ];
}

export function backtestSubtitle(): string {
  return `${SNAPSHOT.windowDays}-day strategy snapshot as of ${SNAPSHOT.referenceDate}. ${SNAPSHOT.displayName} vs ${DCA.display_name}, daily signal evaluation, ${SNAPSHOT.raw.tradeCount} executed trades.`;
}

export function backtestDisclaimer(): string {
  return `Past performance does not guarantee future results. Backtest window: ${SNAPSHOT.windowStart} to ${SNAPSHOT.windowEnd}, as of ${SNAPSHOT.referenceDate}.`;
}
