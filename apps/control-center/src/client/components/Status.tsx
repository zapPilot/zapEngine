import type {
  OperationalStatus,
  OperationsResponse,
} from '../../shared/types.js';
import { integer, statusLabel } from '../format.js';

export function StatusPill(props: {
  compact?: boolean;
  status: OperationalStatus | undefined;
}) {
  const status = props.status ?? 'unknown';
  return (
    <span className={`status-pill ${status}${props.compact ? ' compact' : ''}`}>
      {statusLabel(props.status)}
    </span>
  );
}

export function StatusDot({ status }: { status: OperationalStatus }) {
  return <span aria-hidden="true" className={`status-dot ${status}`} />;
}

/**
 * The first thing on the page, on both Home and Reliability. It answers "is
 * anything wrong" before any number does, so the two views must never be able
 * to disagree about the answer.
 */
export function StatusBanner({ data }: { data: OperationsResponse | null }) {
  const status = data?.status ?? 'unknown';
  return (
    <section
      aria-label="Overall operational status"
      className={`status-banner ${status}`}
    >
      <strong className="status-word">{statusLabel(data?.status)}</strong>
      <span className="status-note">{note(data)}</span>
    </section>
  );
}

function note(data: OperationsResponse | null): string {
  if (!data) {
    return 'Waiting for data';
  }
  const decisions = data.priorities.length
    ? `${integer(data.priorities.length)} need a decision`
    : 'Nothing is asking for a decision';
  return `${decisions} · ${integer(data.signals.length)} signals across ${integer(data.domains.length)} domains`;
}
