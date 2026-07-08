import { formatPercentagePoint, getBacktestSnapshot } from '@/data/snapshot';
import strategySnapshot from '@/data/strategy-snapshot.json';

const MINUS = '\u2212';

function signedPercent(value: number): string {
  const sign = value < 0 ? MINUS : '+';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function displayRatio(value: number): string {
  if (value < 0) {
    return `${MINUS}${Math.abs(value).toFixed(2)}`;
  }
  return value.toFixed(2);
}

const SNAPSHOT = getBacktestSnapshot();
const DCA = strategySnapshot.strategies.dca_classic;
const ROI_VS_DCA_PP = formatPercentagePoint(
  SNAPSHOT.raw.roiPercent - DCA.roi_percent,
);

const METRICS = [
  {
    label: 'ROI vs DCA',
    value: ROI_VS_DCA_PP,
    sub: `${signedPercent(SNAPSHOT.raw.roiPercent)} vs ${signedPercent(DCA.roi_percent)}`,
    tone: 'accent',
  },
  {
    label: 'Strategy ROI',
    value: signedPercent(SNAPSHOT.raw.roiPercent),
    sub: `${SNAPSHOT.windowDays}-day window`,
    tone: 'default',
  },
  {
    label: 'Calmar ratio',
    value: displayRatio(SNAPSHOT.raw.calmarRatio),
    sub: `vs DCA: ${displayRatio(DCA.calmar_ratio)}`,
    tone: 'default',
  },
  {
    label: 'Sharpe ratio',
    value: displayRatio(SNAPSHOT.raw.sharpeRatio),
    sub: `vs DCA: ${displayRatio(DCA.sharpe_ratio)}`,
    tone: 'default',
  },
  {
    label: 'Max drawdown',
    value: signedPercent(SNAPSHOT.raw.maxDrawdownPercent),
    sub: `vs DCA: ${signedPercent(DCA.max_drawdown_percent)}`,
    tone: 'good',
  },
];

const METRIC_VALUE_CLASS: Record<string, string> = {
  accent: 'zp-metric-value zp-metric-value-accent',
  good: 'zp-metric-value zp-metric-value-good',
  default: 'zp-metric-value',
};

const TABLE_ROWS = [
  {
    strategy: SNAPSHOT.displayName,
    roi: signedPercent(SNAPSHOT.raw.roiPercent),
    maxDrawdown: signedPercent(SNAPSHOT.raw.maxDrawdownPercent),
    trades: `${SNAPSHOT.raw.tradeCount}`,
    highlighted: true,
  },
  {
    strategy: DCA.display_name,
    roi: signedPercent(DCA.roi_percent),
    maxDrawdown: signedPercent(DCA.max_drawdown_percent),
    trades: `${DCA.trade_count}`,
    highlighted: false,
  },
];

export function BacktestProof() {
  return (
    <section
      id="proof"
      className="zp-section zp-section-alt"
      aria-label="Backtest proof"
    >
      <div className="zp-container">
        <p className="zp-kicker">Backtest proof</p>
        <h2 className="zp-h2">Trades drove the return.</h2>
        <p className="zp-lede">
          {SNAPSHOT.windowDays}-day strategy snapshot pinned to{' '}
          {SNAPSHOT.referenceDate}. {SNAPSHOT.displayName} vs {DCA.display_name}
          , daily signal evaluation, {SNAPSHOT.raw.tradeCount} executed trades.
          Yield is not the strategy — the trades are.
        </p>
        <div className="zp-metrics">
          {METRICS.map((metric) => (
            <div key={metric.label} className="zp-metric">
              <p className="zp-metric-label">{metric.label}</p>
              <p
                className={METRIC_VALUE_CLASS[metric.tone] ?? 'zp-metric-value'}
              >
                {metric.value}
              </p>
              <p className="zp-metric-sub">{metric.sub}</p>
            </div>
          ))}
        </div>
        <div className="zp-table">
          <div className="zp-table-head">
            <span>Strategy</span>
            <span>ROI</span>
            <span>Max drawdown</span>
            <span>Trades</span>
          </div>
          {TABLE_ROWS.map((row) => (
            <div
              key={row.strategy}
              className={
                row.highlighted
                  ? 'zp-table-row'
                  : 'zp-table-row zp-table-row-muted'
              }
            >
              <span
                className={row.highlighted ? 'zp-table-strategy' : undefined}
              >
                {row.strategy}
              </span>
              <span className="zp-table-num">{row.roi}</span>
              <span className="zp-table-num">{row.maxDrawdown}</span>
              <span className="zp-table-num">{row.trades}</span>
            </div>
          ))}
        </div>
        <p className="zp-footnote">
          Past performance does not guarantee future results. Backtest window:{' '}
          {SNAPSHOT.windowStart} to {SNAPSHOT.windowEnd}, reference date pinned
          to {SNAPSHOT.referenceDate}.
        </p>
      </div>
    </section>
  );
}
