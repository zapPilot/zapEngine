import type {
  OperationalSignal,
  OperationalStatus,
  OperationsResponse,
  OperationsSocialResponse,
  OperationsSource,
} from '../../shared/types.js';
import { integer, statusLabel } from '../format.js';
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

  return (
    <section className="domain-visualization reliability-topology">
      <div className="domain-visualization-head">
        <div>
          <span className="domain-visualization-kicker">Operational topology</span>
          <h2>What is reporting trouble, and what it blocks</h2>
        </div>
        <p>
          Live evidence topology. Arrows mean “reports into this operating domain”,
          not an inferred runtime call graph.
        </p>
      </div>

      <div className="topology-grid">
        <div className="topology-column topology-sources">
          <span className="topology-column-label">Evidence source</span>
          {sources.map((source) => (
            <article className={`topology-node ${source.status}`} key={source.source}>
              <div>
                <StatusDot status={source.status} />
                <strong>{sourceLabel(source.source)}</strong>
              </div>
              <small>{source.summary}</small>
            </article>
          ))}
          {sources.length === 0 ? (
            <div className="domain-visualization-empty compact">
              Waiting for operational signals.
            </div>
          ) : null}
        </div>

        <div className="topology-connectors" aria-hidden="true">
          <span>→</span>
        </div>

        <div className="topology-column topology-domains">
          <span className="topology-column-label">Operating domain</span>
          {(props.data?.domains ?? []).map((domain) => (
            <article className={`topology-domain ${domain.status}`} key={domain.domain}>
              <div>
                <strong>{domain.domain}</strong>
                <span>{statusLabel(domain.status)}</span>
              </div>
              <small>
                {integer(domain.signalCount)} signal{domain.signalCount === 1 ? '' : 's'}
              </small>
            </article>
          ))}
        </div>
      </div>

      <SocialFlow social={props.social} />
    </section>
  );
}

function SocialFlow({ social }: { social: OperationsSocialResponse | null }) {
  if (!social) return null;
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
    <div className="social-flow" aria-label="Social publishing flow">
      <span className="topology-column-label">Social publishing flow</span>
      <div className={`social-flow-node ${mediaStatus}`}>
        <StatusDot status={mediaStatus} />
        <span>
          <strong>Rendered media</strong>
          <small>{integer(social.waitingMediaLanes)} lane(s) waiting</small>
        </span>
      </div>
      <b aria-hidden="true">→</b>
      <div className={`social-flow-node ${queueStatus}`}>
        <StatusDot status={queueStatus} />
        <span>
          <strong>Publish queue</strong>
          <small>{integer(social.jobs.length)} active · {integer(blocked)} blocked</small>
        </span>
      </div>
      <b aria-hidden="true">→</b>
      <div className={`social-flow-node ${social.daemon.status}`}>
        <StatusDot status={social.daemon.status} />
        <span>
          <strong>Social daemon</strong>
          <small>{statusLabel(social.daemon.status)}</small>
        </span>
      </div>
      <b aria-hidden="true">→</b>
      <div className="social-flow-node healthy">
        <StatusDot status="healthy" />
        <span>
          <strong>Platforms</strong>
          <small>Threads · X · Rednote · YouTube</small>
        </span>
      </div>
    </div>
  );
}

interface SourceNode {
  source: OperationsSource;
  status: OperationalStatus;
  summary: string;
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
      const worst = [...sourceSignals].sort(
        (left, right) => STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status],
      )[0]!;
      return {
        source,
        status: worst.status,
        summary:
          worst.status === 'healthy'
            ? `${integer(sourceSignals.length)} healthy signal${sourceSignals.length === 1 ? '' : 's'}`
            : worst.title,
      };
    })
    .sort(
      (left, right) =>
        STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status] ||
        sourceLabel(left.source).localeCompare(sourceLabel(right.source)),
    );
}

function sourceLabel(source: OperationsSource): string {
  return {
    'customer-economics': 'Customer data',
    'product-health': 'Product health',
    'cost-ledger': 'Cost ledger',
    'social-queue': 'Social queue',
    'social-daemon': 'Social daemon',
    'github-actions': 'GitHub Actions',
    fly: 'Fly.io',
    sentry: 'Sentry',
    posthog: 'PostHog',
  }[source];
}
