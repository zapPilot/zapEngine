import type { StatementsResponse } from '../../shared/statements.js';
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
import { DomainStrip } from './DomainStrip.js';
import { PriorityQueue } from './PriorityQueue.js';
import { ReliabilityTopology } from './ReliabilityTopology.js';
import { StatementHeader } from './StatementHeader.js';
import { StatusPill } from './Status.js';

/**
 * L0 is the statement (R1) plus every domain as one strip — replaces the
 * topology as the first thing read. Source activity, social flow and the
 * raw signal audit all move to Evidence; nothing raw sits above it.
 */
export function ReliabilityView(props: {
  data: OperationsResponse | null;
  social: OperationsSocialResponse | null;
  statements?: StatementsResponse | null;
}) {
  const data = props.data;
  const header = props.statements?.headers.find(
    (h) => h.domain === 'reliability',
  );
  const topSignal =
    data?.priorities.find((p) => p.signal.status === 'critical')?.signal ??
    data?.priorities[0]?.signal ??
    null;
  const problemSignals = (data?.signals ?? []).filter(
    (signal) => signal.status !== 'healthy',
  );

  return (
    <div className="view-stack">
      {header ? (
        <StatementHeader
          action={
            topSignal?.url ? (
              <a
                className="queue-source-link"
                href={topSignal.url}
                rel="noreferrer"
                target="_blank"
              >
                Open {sourceLabel(topSignal.source)} source
              </a>
            ) : undefined
          }
          facts={header.facts}
          sentence={header.sentence}
          status={header.status}
        />
      ) : null}

      {data ? (
        <DomainStrip domains={data.domains} />
      ) : (
        <div className="empty-inline">Waiting for data.</div>
      )}

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
          <strong>Signal evidence</strong>
          <span>
            {data
              ? `${integer(problemSignals.length)} issues · ${integer(data.signals.length)} signals`
              : 'Waiting for signals'}
          </span>
        </summary>
        <div className="signal-evidence-body">
          <div className="disclosure-section">
            <ReliabilityTopology data={data} social={props.social} />
          </div>
          <div className="disclosure-section">
            <SignalAudit signals={data?.signals ?? []} waiting={!data} />
          </div>
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
