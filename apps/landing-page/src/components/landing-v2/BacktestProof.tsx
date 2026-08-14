import {
  backtestDisclaimer,
  backtestSubtitle,
  buildBacktestStats,
  buildComparisonRows,
} from '@/data/backtest-stats';

const METRICS = buildBacktestStats();
const TABLE_ROWS = buildComparisonRows();

const METRIC_VALUE_CLASS: Record<string, string> = {
  accent: 'zp-metric-value zp-metric-value-accent',
  good: 'zp-metric-value zp-metric-value-good',
  default: 'zp-metric-value',
};

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
          {backtestSubtitle()} Yield is not the strategy — the trades are.
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
              <p className="zp-metric-sub">{metric.sublabel}</p>
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
              key={row.label}
              className={
                row.highlighted
                  ? 'zp-table-row'
                  : 'zp-table-row zp-table-row-muted'
              }
            >
              <span
                className={row.highlighted ? 'zp-table-strategy' : undefined}
              >
                {row.label}
              </span>
              <span className="zp-table-num">{row.roi}</span>
              <span className="zp-table-num">{row.maxDrawdown}</span>
              <span className="zp-table-num">{row.trades}</span>
            </div>
          ))}
        </div>
        <p className="zp-footnote">{backtestDisclaimer()}</p>
      </div>
    </section>
  );
}
