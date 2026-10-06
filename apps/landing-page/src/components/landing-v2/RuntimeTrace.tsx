import { StatusBadge, StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

/**
 * Static replay of one recorded backtest decision moving through the runtime
 * stages. Each stage carries the status of the capability behind it, so the
 * trace shows which steps run today without inventing an account or amounts.
 */
export function RuntimeTrace() {
  const { trace } = MESSAGES;
  return (
    <figure className="zp-trace" aria-label={trace.ariaLabel}>
      <div className="zp-trace-head">
        <span className="zp-trace-title">{trace.title}</span>
        <span className="zp-trace-replay">{trace.replay}</span>
      </div>
      <p className="zp-trace-strategy">{trace.strategy}</p>
      <ol className="zp-trace-rows">
        {trace.rows.map((row) => (
          <li key={row.stage} className="zp-trace-row">
            <span className="zp-trace-stage">{row.stage}</span>
            <span className="zp-trace-text">
              {'href' in row ? (
                <a href={row.href}>
                  {row.text} <span aria-hidden>→</span>
                </a>
              ) : (
                row.text
              )}
              {'note' in row ? (
                <StatusNote note={row.note} className="zp-trace-note" />
              ) : null}
            </span>
            <StatusBadge capability={row.capability} />
          </li>
        ))}
      </ol>
      <figcaption className="zp-trace-footnote">{trace.footnote}</figcaption>
    </figure>
  );
}
