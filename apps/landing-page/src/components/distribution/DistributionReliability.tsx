import {
  formatCount,
  formatSnapshotDate,
  type DistributionSnapshot,
} from '@/data/distribution';

interface ReliabilityItem {
  value: string;
  claim: string;
}

function reliabilityItems(snapshot: DistributionSnapshot): ReliabilityItem[] {
  const { reliability } = snapshot;
  return [
    {
      value: formatCount(reliability.publishJobsCompleted),
      claim:
        'publish jobs completed. Each one claims a lease, publishes, and records the permalink it got back.',
    },
    {
      value: formatCount(reliability.publishJobsFailed),
      claim:
        'jobs left in a failed state. Transport errors are retried inside the queue up to a hard attempt ceiling, so a bad night does not need a human.',
    },
    {
      value: `${formatCount(reliability.metricSnapshotsCollected)} / ${formatCount(reliability.metricSnapshots)}`,
      claim:
        'metric snapshots successfully collected. A reading that could not be taken is recorded as unavailable rather than as zero.',
    },
    {
      value: formatCount(reliability.strategyVersions),
      claim:
        'versions of the publishing strategy, one per platform and language, each derived from the measurements above.',
    },
  ];
}

export function DistributionReliability({
  snapshot,
}: {
  snapshot: DistributionSnapshot;
}) {
  return (
    <section className="zp-section zp-section-alt" id="reliability">
      <div className="zp-container">
        <p className="zp-kicker">Why it keeps running</p>
        <h2 className="zp-h2">A queue, not a demo.</h2>
        <p className="zp-lede">
          The reason this produces numbers every day is that no step depends on
          somebody remembering to run it. Work is claimed from a durable queue,
          leased, retried, and reconciled against what is already live.
        </p>
        <dl className="dist-reliability">
          {reliabilityItems(snapshot).map((item) => (
            <div className="dist-reliability-item" key={item.claim}>
              <dt>{item.value}</dt>
              <dd>{item.claim}</dd>
            </div>
          ))}
        </dl>
        <p className="dist-method">
          How these numbers are made: a script in the pipeline reads its own
          tables and writes{' '}
          <code>apps/landing-page/src/data/distribution-snapshot.json</code>,
          which this page imports at build time. It is refreshed daily and keyed
          to the newest row it describes — currently{' '}
          {formatSnapshotDate(snapshot.asOf)} — so an unchanged corpus produces
          an identical file. Reach counts one reading per post, the most recent
          successful one, and is a lifetime total rather than a rolling window.
        </p>
      </div>
    </section>
  );
}
