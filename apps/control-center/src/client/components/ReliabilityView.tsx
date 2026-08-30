import type {
  OperationalSignal,
  OperationsDomainSummary,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import { integer, relativeTime, statusLabel } from '../format.js';
import { InfoRow } from './InfoRow.js';
import { PriorityQueue } from './PriorityQueue.js';
import { StatusBanner, StatusDot, StatusPill } from './Status.js';

const OVERDUE_PREVIEW = 4;

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
      <StatusBanner data={data} />

      <section aria-label="Domain status" className="domain-strip">
        {(data?.domains ?? []).map((domain) => (
          <DomainChip domain={domain} key={domain.domain} />
        ))}
      </section>

      <div className="reliability-lower">
        <section className="panel queue-panel">
          <div className="panel-head">
            <h2>Do this first</h2>
            <small className="panel-note">
              Ranked by status, blast radius and evidence — not by recency
            </small>
          </div>
          <PriorityQueue
            emptyMessage="Nothing above the action threshold."
            priorities={data?.priorities}
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Social daemon</h2>
            <small className="panel-note">
              Health and overdue publishing only; queue detail stays secondary
            </small>
          </div>
          <SocialOpsPanel social={props.social} />
        </section>
      </div>

      <details className="panel signal-evidence">
        <summary className="signal-evidence-summary">
          <strong>Signal evidence</strong>
          <span>
            {data
              ? `${integer(problemSignals.length)} non-healthy · ${integer(data.signals.length)} total`
              : 'Waiting for operational signals'}
          </span>
        </summary>
        <div className="signal-evidence-body">
          <p>
            Raw source evidence, including healthy checks and fingerprints. Open
            this only when a ranked decision needs auditing.
          </p>
          <SignalAudit signals={data?.signals ?? []} waiting={!data} />
        </div>
      </details>
    </div>
  );
}

function DomainChip({ domain }: { domain: OperationsDomainSummary }) {
  return (
    <div className={`domain-chip ${domain.status}`}>
      <span>{domain.domain}</span>
      <strong>{statusLabel(domain.status)}</strong>
      <small>
        {integer(domain.signalCount)} signal
        {domain.signalCount === 1 ? '' : 's'}
      </small>
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
          <span className="signal-audit-domain">{signal.domain}</span>
          <span className="signal-audit-evidence">
            {formatEvidence(signal.evidence)}
          </span>
          <time>{relativeTime(signal.observedAt)}</time>
        </article>
      ))}
    </div>
  );
}

function SocialOpsPanel({
  social,
}: {
  social: OperationsSocialResponse | null;
}) {
  if (!social) {
    return <div className="empty-inline">Waiting for data.</div>;
  }
  const overdue = social.jobs.filter(
    (job) => job.overdueMinutes !== null && job.overdueMinutes > 0,
  );
  return (
    <div className="info-list">
      <div className="info-row">
        <span className="info-label">
          <StatusDot status={social.daemon.status} />
          Heartbeat
        </span>
        <strong className="info-value">
          {social.daemon.lastTickStartedAt
            ? relativeTime(social.daemon.lastTickStartedAt)
            : 'Never reported'}
        </strong>
        <small className="info-note">
          {social.daemon.status === 'healthy'
            ? 'Daemon is reporting normally'
            : (social.daemon.lastError ?? 'Daemon needs attention')}
        </small>
      </div>
      <InfoRow
        label="Publish queue"
        notes={[
          `${integer(social.waitingMediaLanes)} lane(s) waiting on media`,
          social.invalidJobRows > 0
            ? `${integer(social.invalidJobRows)} queue row(s) unreadable`
            : null,
        ]}
        value={`${integer(social.jobs.length)} pending · ${integer(overdue.length)} overdue`}
      />
      {overdue.slice(0, OVERDUE_PREVIEW).map((job) => (
        <InfoRow
          key={`${job.episodeId}-${job.platform}-${job.languageCode ?? 'all'}`}
          label={`${job.platform}${job.languageCode ? ` · ${job.languageCode}` : ''}`}
          notes={[
            `attempt ${integer(job.attemptCount)}${job.attemptsExhausted ? ' · retries exhausted' : ''}`,
          ]}
          value={`${integer(Math.round(job.overdueMinutes ?? 0))} min overdue`}
        />
      ))}
      {social.message ? (
        <div className="empty-inline">{social.message}</div>
      ) : null}
    </div>
  );
}

function formatEvidence(evidence: OperationalSignal['evidence']): string {
  const entries = Object.entries(evidence).filter(
    ([, value]) => value !== null && value !== '',
  );
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join(' · ')
    : '—';
}
