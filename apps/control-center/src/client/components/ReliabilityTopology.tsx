import type {
  OperationalSignal,
  OperationalStatus,
  OperationsResponse,
  OperationsSocialResponse,
  OperationsSource,
} from '../../shared/types.js';
import { integer, relativeTime, statusLabel } from '../format.js';
import { StatusDot } from './Status.js';

const STATUS_WEIGHT: Record<OperationalStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  critical: 3,
};

export function ReliabilityTopology(props: {
  data: OperationsResponse | null;
  social: OperationsSocialResponse | null;
}) {
  const sources = sourceNodes(props.data?.signals ?? []);
  const attention = sources.filter(
    (source) => source.status === 'critical' || source.status === 'degraded',
  ).length;

  return (
    <section className="domain-visualization reliability-activity">
      <div className="reliability-activity-head">
        <span>Reliability</span>
        <strong>
          {attention === 0
            ? 'All clear'
            : `${integer(attention)} need attention`}
        </strong>
      </div>

      <div className="source-activity-grid">
        {sources.map((source) => (
          <article
            className={`source-activity-card ${source.status}`}
            key={source.source}
          >
            <header>
              <span>
                <StatusDot status={source.status} />
                <strong>{sourceLabel(source.source)}</strong>
              </span>
              <small>{statusLabel(source.status)}</small>
            </header>
            <div className="source-event-list">
              {source.events.map((event) => (
                <SourceEvent event={event} key={event.fingerprint} />
              ))}
            </div>
          </article>
        ))}
        {sources.length === 0 ? (
          <div className="domain-visualization-empty compact">
            Waiting for signals.
          </div>
        ) : null}
      </div>

      <SocialFlow social={props.social} />
    </section>
  );
}

function SourceEvent({ event }: { event: OperationalSignal }) {
  const content = (
    <>
      <time>{relativeTime(event.observedAt)}</time>
      <strong>{event.title}</strong>
      <small>{eventMeta(event)}</small>
    </>
  );

  return event.url ? (
    <a
      className="source-event"
      href={event.url}
      rel="noreferrer"
      target="_blank"
    >
      {content}
      <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <div className="source-event">{content}</div>
  );
}

function SocialFlow({ social }: { social: OperationsSocialResponse | null }) {
  if (!social) {
    return null;
  }
  const blocked = social.jobs.filter(
    (job) => job.attemptsExhausted || job.overdueMinutes !== null,
  ).length;
  const queueStatus: OperationalStatus = blocked
    ? social.jobs.some((job) => job.attemptsExhausted)
      ? 'critical'
      : 'degraded'
    : 'healthy';
  const mediaStatus: OperationalStatus =
    (social.waitingMediaLanes ?? 0) >= 3 ? 'degraded' : 'healthy';

  return (
    <div
      className="social-flow compact-social-flow"
      aria-label="Social publishing flow"
    >
      <SocialFlowNode
        status={mediaStatus}
        label="Media"
        detail={`${integer(social.waitingMediaLanes)} waiting`}
      />
      <b aria-hidden="true">→</b>
      <SocialFlowNode
        status={queueStatus}
        label="Queue"
        detail={`${integer(blocked)} blocked`}
      />
      <b aria-hidden="true">→</b>
      <SocialFlowNode
        status={social.daemon.status}
        label="Daemon"
        detail={statusLabel(social.daemon.status)}
      />
      <b aria-hidden="true">→</b>
      <SocialFlowNode
        status="unknown"
        label="Platforms"
        detail="not verified"
      />
    </div>
  );
}

function SocialFlowNode(props: {
  status: OperationalStatus;
  label: string;
  detail: string;
}) {
  return (
    <div className={`social-flow-node ${props.status}`}>
      <StatusDot status={props.status} />
      <span>
        <strong>{props.label}</strong>
        <small>{props.detail}</small>
      </span>
    </div>
  );
}

interface SourceNode {
  source: OperationsSource;
  status: OperationalStatus;
  events: OperationalSignal[];
}

function sourceNodes(signals: OperationalSignal[]): SourceNode[] {
  const grouped = new Map<OperationsSource, OperationalSignal[]>();
  for (const signal of signals) {
    const current = grouped.get(signal.source) ?? [];
    current.push(signal);
    grouped.set(signal.source, current);
  }
  return [...grouped.entries()]
    .map(([source, sourceSignals]) => {
      const ordered = [...sourceSignals].sort(
        (left, right) =>
          STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status] ||
          observedAtWeight(right.observedAt) -
            observedAtWeight(left.observedAt),
      );
      return {
        source,
        status: ordered[0]?.status ?? 'unknown',
        events: ordered.slice(0, 2),
      };
    })
    .sort(
      (left, right) =>
        STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status] ||
        sourceLabel(left.source).localeCompare(sourceLabel(right.source)),
    );
}

function observedAtWeight(observedAt: string): number {
  const parsed = Date.parse(observedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function eventMeta(signal: OperationalSignal): string {
  if (signal.source === 'github-actions') {
    return compactEvidence(signal, ['conclusion', 'event', 'branch']);
  }
  if (signal.source === 'sentry') {
    return compactEvidence(signal, ['eventCount', 'topIssue']);
  }
  if (signal.source === 'fly') {
    return compactEvidence(signal, [
      'startedMachines',
      'stoppedMachines',
      'machines',
    ]);
  }
  if (signal.source === 'social-queue') {
    return compactEvidence(signal, ['overdueJobs', 'waitingMediaLanes']);
  }
  return compactEvidence(signal, Object.keys(signal.evidence).slice(0, 2));
}

function compactEvidence(signal: OperationalSignal, keys: string[]): string {
  const values = keys.flatMap((key) => {
    const value = signal.evidence[key];
    return value === null || value === undefined || value === ''
      ? []
      : [`${humanKey(key)} ${String(value)}`];
  });
  return values.length
    ? values.join(' · ')
    : (signal.detail ?? 'No extra detail');
}

function humanKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function sourceLabel(source: OperationsSource): string {
  return {
    'customer-economics': 'Customers',
    'product-health': 'Product',
    'cost-ledger': 'Costs',
    'social-queue': 'Social queue',
    'social-daemon': 'Social daemon',
    'github-actions': 'GitHub',
    fly: 'Fly',
    sentry: 'Sentry',
    posthog: 'PostHog',
  }[source];
}
