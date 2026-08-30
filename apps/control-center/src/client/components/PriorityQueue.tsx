import { useState } from 'react';

import type { OperationalPriority } from '../../shared/types.js';
import { relativeTime, statusLabel } from '../format.js';

/**
 * The ranked action list, shared by Home (top slice) and Reliability (all of
 * it). The ordering is the server's — see `services/operations/prioritize.ts`
 * — and is deliberately not re-sorted here. Evidence is collapsed by default
 * so the ranking can be scanned before a reader opts into the detail.
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
  const [open, setOpen] = useState(false);
  return (
    <li className={`queue-row ${signal.status}`}>
      <div className="queue-score">
        <strong>{priority.score}</strong>
        <span>{statusLabel(signal.status)}</span>
      </div>
      <details className="queue-body" open={open}>
        <summary
          className="queue-summary"
          onClick={(event) => {
            event.preventDefault();
            setOpen((value) => !value);
          }}
        >
          <span className="queue-title">{signal.title}</span>
          <span aria-hidden="true" className="queue-toggle">
            Details
          </span>
        </summary>
        <div className="queue-expanded">
          {signal.detail ? (
            <p className="queue-detail">{signal.detail}</p>
          ) : null}
          <p className="queue-meta">
            {signal.source} · seen {relativeTime(signal.observedAt)}
          </p>
          {priority.reasons.length ? (
            <div className="queue-reasons">
              {priority.reasons.map((reason) => (
                <span className="reason-chip" key={reason}>
                  {reason}
                </span>
              ))}
            </div>
          ) : null}
          {signal.url && open ? (
            <a
              className="queue-source-link"
              href={signal.url}
              rel="noreferrer"
              target="_blank"
            >
              Open source
            </a>
          ) : null}
        </div>
      </details>
    </li>
  );
}
