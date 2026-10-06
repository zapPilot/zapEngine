import { StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

const METRIC_VALUE_CLASS: Record<string, string> = {
  accent: 'zp-metric-value zp-metric-value-accent',
  good: 'zp-metric-value zp-metric-value-good',
  default: 'zp-metric-value',
};

export function BacktestProof() {
  const { backtest } = MESSAGES;
  return (
    <section
      id="proof"
      className="zp-section zp-section-alt"
      aria-labelledby="proof-title"
    >
      <div className="zp-container">
        <p className="zp-kicker">{backtest.kicker}</p>
        <h2 id="proof-title" className="zp-h2">
          {backtest.title}
        </h2>
        <p className="zp-lede">{backtest.subtitle}</p>
        <div className="zp-metrics">
          {backtest.stats.map((metric) => (
            <div key={metric.label} className="zp-metric">
              <p className="zp-metric-label">{metric.label}</p>
              <p className={METRIC_VALUE_CLASS[metric.tone]!}>{metric.value}</p>
              <p className="zp-metric-sub">{metric.sublabel}</p>
            </div>
          ))}
        </div>
        <div className="zp-table">
          <div className="zp-table-head">
            <span>{backtest.table.strategy}</span>
            <span>{backtest.table.roi}</span>
            <span>{backtest.table.maxDrawdown}</span>
            <span>{backtest.table.trades}</span>
          </div>
          {backtest.comparison.map((row) => (
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
        <p className="zp-proof-note">
          <StatusNote note={backtest.sleeveNote} />
        </p>
        <p className="zp-footnote">{backtest.disclaimer}</p>
        <ul className="zp-proof-links">
          <li>
            <a href={backtest.methodLink.href}>
              {backtest.methodLink.label} <span aria-hidden>→</span>
            </a>
          </li>
          <li>
            <a href={backtest.verifyLink.href}>
              {backtest.verifyLink.label} <span aria-hidden>→</span>
            </a>{' '}
            <StatusNote note={backtest.verifyLink} />
          </li>
        </ul>
      </div>
    </section>
  );
}
