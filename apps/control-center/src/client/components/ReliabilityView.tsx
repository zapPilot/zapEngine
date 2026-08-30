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
              Runs on a laptop — nothing else notices when it stops
            </small>
          </div>
          <SocialOpsPanel social={props.social} />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>All signals</h2>
          <small className="panel-note">
            Every source, including the ones reporting nothing wrong
          </small>
        </div>
        <div className="table-wrap">
          <table className="data-table">
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
          {data ? null : <div className="empty-inline">Waiting for data.</div>}
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

function SignalRow({ signal }: { signal: OperationalSignal }) {
  return (
    <tr>
      <td>
        <StatusPill compact status={signal.status} />
      </td>
      <td className="cell-domain">{signal.domain}</td>
      <td>
        <span className="cell-title">{signal.title}</span>
        <small className="cell-fingerprint">{signal.fingerprint}</small>
      </td>
      <td className="cell-evidence">{formatEvidence(signal.evidence)}</td>
      <td className="cell-nowrap">{relativeTime(signal.observedAt)}</td>
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
          {social.daemon.owner
            ? `Owner ${social.daemon.owner}`
            : 'No owner recorded'}
          {social.daemon.daemonVersion
            ? ` · ${social.daemon.daemonVersion}`
            : ''}
        </small>
        {social.daemon.lastError ? (
          <small className="info-note error-text">
            {social.daemon.lastError}
          </small>
        ) : null}
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
