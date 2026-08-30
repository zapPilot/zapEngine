import type { OperationalPriority } from '../../shared/types.js';
import { relativeTime, statusLabel } from '../format.js';

/**
 * The ranked action list, shared by Home (top slice) and Reliability (all of
 * it). The ordering is the server's — see `services/operations/prioritize.ts`
 * — and is deliberately not re-sorted here: two views showing the same signals
 * in a different order is how a founder stops trusting either one.
 */
export function PriorityQueue(props: {
  emptyMessage: string;
  limit?: number;
  priorities: OperationalPriority[] | undefined;
}) {
  if (!props.priorities) {
    return <div className="empty-inline">Waiting for data.</div>;
  }
  const shown = props.limit
    ? props.priorities.slice(0, props.limit)
    : props.priorities;
  if (shown.length === 0) {
    return <div className="empty-inline">{props.emptyMessage}</div>;
  }
  return (
    <ol className="queue">
      {shown.map((priority) => (
        <QueueRow key={priority.signal.fingerprint} priority={priority} />
      ))}
    </ol>
  );
}

function QueueRow({ priority }: { priority: OperationalPriority }) {
  const { signal } = priority;
  return (
    <li className={`queue-row ${signal.status}`}>
      <div className="queue-score">
        <strong>{priority.score}</strong>
        <span>{statusLabel(signal.status)}</span>
      </div>
      <div className="queue-body">
        <p className="queue-title">
          {signal.url ? (
            <a href={signal.url} rel="noreferrer" target="_blank">
              {signal.title}
            </a>
          ) : (
            signal.title
          )}
        </p>
        {signal.detail ? <p className="queue-detail">{signal.detail}</p> : null}
        <p className="queue-meta">
          {signal.source} · seen {relativeTime(signal.observedAt)}
        </p>
        <div className="queue-reasons">
          {priority.reasons.map((reason) => (
            <span className="reason-chip" key={reason}>
              {reason}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
