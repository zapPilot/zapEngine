import type {
  OperationalPriority,
  OperationalSignal,
  OperationsDomainSummary,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import { integer, relativeTime, statusLabel } from '../format.js';

export function OperationsView(props: {
  data: OperationsResponse | null;
  social: OperationsSocialResponse | null;
}) {
  const data = props.data;
  return (
    <div className="view-stack">
      <section
        className="status-banner"
        aria-label="Overall operational status"
      >
        <span className={`status-pill ${data?.status ?? 'unknown'}`}>
          {statusLabel(data?.status)}
        </span>
        <span className="status-banner-note">
          {data
            ? `${data.priorities.length} need a decision · ${data.signals.length} signals`
            : 'Waiting for data'}
        </span>
      </section>

      <section className="domain-strip" aria-label="Domain status">
        {(data?.domains ?? []).map((domain) => (
          <DomainChip domain={domain} key={domain.domain} />
        ))}
      </section>

      <div className="operations-lower">
        <section className="open-panel priority-panel">
          <div className="section-heading">
            <h2>Do this first</h2>
            <small className="decision-note">
              Ranked by status, blast radius and evidence — not by recency
            </small>
          </div>
          <div className="decision-list">
            {(data?.priorities ?? []).map((priority) => (
              <PriorityRow
                key={priority.signal.fingerprint}
                priority={priority}
              />
            ))}
            {data && data.priorities.length === 0 ? (
              <div className="empty-inline">
                Nothing above the action threshold.
              </div>
            ) : null}
          </div>
        </section>

        <section className="open-panel social-ops-panel">
          <div className="section-heading">
            <h2>Social daemon</h2>
            <small className="decision-note">
              Runs on a laptop — nothing else notices when it stops
            </small>
          </div>
          <SocialOpsPanel social={props.social} />
        </section>
      </div>

      <section className="open-panel signal-panel">
        <div className="section-heading">
          <h2>All signals</h2>
        </div>
        <div className="ledger-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Domain</th>
                <th>Signal</th>
                <th>Evidence</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {(data?.signals ?? []).map((signal) => (
                <SignalRow key={signal.fingerprint} signal={signal} />
              ))}
            </tbody>
          </table>
          {data && data.signals.length === 0 ? (
            <div className="empty-inline">No signals collected.</div>
          ) : null}
        </div>
      </section>
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

function PriorityRow({ priority }: { priority: OperationalPriority }) {
  const { signal } = priority;
  return (
    <div className="decision-row priority-row">
      <span>
        <span className={`status-dot ${signal.status}`} aria-hidden="true" />
        {signal.source} · {signal.domain}
      </span>
      <strong>
        {signal.url ? (
          <a href={signal.url} rel="noreferrer" target="_blank">
            {signal.title}
          </a>
        ) : (
          signal.title
        )}
      </strong>
      {signal.detail ? <small>{signal.detail}</small> : null}
      <small className="priority-reasons">
        score {priority.score} · {priority.reasons.join(' · ')}
      </small>
    </div>
  );
}

function SignalRow({ signal }: { signal: OperationalSignal }) {
  return (
    <tr>
      <td>
        <span className={`status-pill compact ${signal.status}`}>
          {statusLabel(signal.status)}
        </span>
      </td>
      <td>{signal.domain}</td>
      <td>
        <span className="provider-name">{signal.title}</span>
        <small className="signal-fingerprint">{signal.fingerprint}</small>
      </td>
      <td className="mono signal-evidence">
        {formatEvidence(signal.evidence)}
      </td>
      <td>{relativeTime(signal.observedAt)}</td>
    </tr>
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
    <div className="decision-list">
      <div className="decision-row">
        <span>
          <span
            className={`status-dot ${social.daemon.status}`}
            aria-hidden="true"
          />
          Heartbeat
        </span>
        <strong>
          {social.daemon.lastTickStartedAt
            ? relativeTime(social.daemon.lastTickStartedAt)
            : 'Never reported'}
        </strong>
        <small>
          {social.daemon.owner
            ? `Owner ${social.daemon.owner}`
            : 'No owner recorded'}
          {social.daemon.daemonVersion
            ? ` · ${social.daemon.daemonVersion}`
            : ''}
        </small>
        {social.daemon.lastError ? (
          <small className="signal-error">{social.daemon.lastError}</small>
        ) : null}
      </div>
      <div className="decision-row">
        <span>Publish queue</span>
        <strong>
          {integer(social.jobs.length)} pending · {integer(overdue.length)}{' '}
          overdue
        </strong>
        <small>
          {integer(social.waitingMediaLanes)} lane(s) waiting on media
        </small>
      </div>
      {overdue.slice(0, 4).map((job) => (
        <div className="decision-row" key={`${job.episodeId}-${job.platform}`}>
          <span>
            {job.platform}
            {job.languageCode ? ` · ${job.languageCode}` : ''}
          </span>
          <strong>{Math.round(job.overdueMinutes ?? 0)} min overdue</strong>
          <small>
            attempt {job.attemptCount}
            {job.attemptsExhausted ? ' · retries exhausted' : ''}
          </small>
        </div>
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
