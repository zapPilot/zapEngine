import type {
  OperationalSignal,
  OperationsResponse,
  OperationsSocialResponse,
  OperationsSource,
} from '../../shared/types.js';
import {
  Activity,
  BarChart3,
  Bug,
  Database,
  Github,
  RadioTower,
  Server,
  Users,
  Wallet,
} from 'lucide-react';
import { integer, relativeTime } from '../format.js';
import { PriorityQueue } from './PriorityQueue.js';
import { ReliabilityTopology } from './ReliabilityTopology.js';
import { StatusPill } from './Status.js';

export function ReliabilityView(props: {
  data: OperationsResponse | null;
  social: OperationsSocialResponse | null;
}) {
  const data = props.data;
  const problemSignals = (data?.signals ?? []).filter(
    (signal) => signal.status !== 'healthy',
  );
  return (
    <div className="view-stack">
      <ReliabilityTopology data={data} social={props.social} />

      <section className="panel queue-panel reliability-action-panel">
        <div className="panel-head">
          <h2>Do this first</h2>
        </div>
        <PriorityQueue
          emptyMessage="Nothing needs action."
          priorities={data?.priorities}
        />
      </section>

      <details className="panel signal-evidence">
        <summary className="signal-evidence-summary">
          <strong>Details</strong>
          <span>
            {data
              ? `${integer(problemSignals.length)} issues · ${integer(data.signals.length)} signals`
              : 'Waiting for signals'}
          </span>
        </summary>
        <div className="signal-evidence-body">
          <SignalAudit signals={data?.signals ?? []} waiting={!data} />
        </div>
      </details>
    </div>
  );
}

function SignalAudit({
  signals,
  waiting,
}: {
  signals: OperationalSignal[];
  waiting: boolean;
}) {
  if (waiting) {
    return <div className="empty-inline">Waiting for data.</div>;
  }
  if (signals.length === 0) {
    return <div className="empty-inline">No signals collected.</div>;
  }
  return (
    <div className="signal-audit-list">
      {signals.map((signal) => (
        <article className="signal-audit-row" key={signal.fingerprint}>
          <StatusPill compact status={signal.status} />
          <div className="signal-audit-title">
            <strong>{signal.title}</strong>
            <small>{signal.fingerprint}</small>
          </div>
          <div className="signal-source signal-audit-domain">
            <SourceIcon source={signal.source} />
            <span>
              <strong>{sourceLabel(signal.source)}</strong>
              <small>{signal.domain}</small>
            </span>
          </div>
          <span className="signal-audit-evidence">
            {formatEvidence(signal.evidence)}
          </span>
          <time>{relativeTime(signal.observedAt)}</time>
        </article>
      ))}
    </div>
  );
}

function SourceIcon({ source }: { source: OperationsSource }) {
  const Icon =
    {
      'customer-economics': Users,
      'product-health': Activity,
      'cost-ledger': Wallet,
      'social-queue': RadioTower,
      'social-daemon': RadioTower,
      'github-actions': Github,
      fly: Server,
      sentry: Bug,
      posthog: BarChart3,
    }[source] ?? Database;
  return (
    <span aria-hidden="true" className={`source-icon source-${source}`}>
      <Icon />
    </span>
  );
}

function sourceLabel(source: OperationsSource): string {
  return {
    'customer-economics': 'Customer data',
    'product-health': 'Product data',
    'cost-ledger': 'Cost ledger',
    'social-queue': 'Social queue',
    'social-daemon': 'Social daemon',
    'github-actions': 'GitHub Actions',
    fly: 'Fly.io',
    sentry: 'Sentry',
    posthog: 'PostHog',
  }[source];
}

function formatEvidence(evidence: OperationalSignal['evidence']): string {
  const entries = Object.entries(evidence).filter(
    ([, value]) => value !== null && value !== '',
  );
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join(' · ')
    : '—';
}
