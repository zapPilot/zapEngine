import type {
  OperationsSocialJob,
  OperationsSocialResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { integer, relativeTime } from '../format.js';
import { platformLabel } from '../platform.js';

const PLATFORM_ORDER = ['threads', 'x', 'rednote', 'youtube'];

export function GrowthDistributionBoard(props: {
  performance: SocialPerformanceResponse | null;
  social: OperationsSocialResponse | null;
}) {
  const batches = buildBatches(props.performance, props.social);

  return (
    <section className="domain-visualization distribution-board">
      <div className="domain-visualization-head compact-domain-head">
        <div>
          <span className="domain-visualization-kicker">Distribution</span>
          <h2>Publishing now</h2>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="domain-visualization-empty compact">
          {props.social?.message ?? 'No active publish batch.'}
        </div>
      ) : (
        <div className="distribution-batches">
          {batches.map((batch) => (
            <article className="distribution-batch" key={batch.episodeId}>
              <header>
                <div>
                  <strong>{batch.title ?? batch.episodeId}</strong>
                  {batch.title ? <small>{batch.episodeId}</small> : null}
                </div>
                <div className="distribution-batch-summary">
                  <span>{relativeTime(batch.targetAt)}</span>
                  <strong>
                    {integer(batch.blocked)} blocked · {integer(batch.lanes.length)} active
                  </strong>
                </div>
              </header>
              <div className="distribution-lanes">
                {batch.lanes.map((lane) => (
                  <div
                    className={`distribution-lane state-${lane.state}`}
                    key={`${batch.episodeId}:${lane.platform}:${lane.languageCode ?? 'published'}`}
                  >
                    <div className="distribution-lane-name">
                      <strong>{platformLabel(lane.platform)}</strong>
                      <span>{lane.languageCode ?? 'published'}</span>
                    </div>
                    <div className="distribution-track" aria-hidden="true">
                      <span className="distribution-track-ready">Ready</span>
                      <i />
                      <span className="distribution-track-scheduled">Scheduled</span>
                      <i />
                      <span className="distribution-track-posted">Posted</span>
                    </div>
                    <div className="distribution-lane-state">
                      <strong>{lane.label}</strong>
                      <small>{lane.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type LaneState = 'queued' | 'processing' | 'failed' | 'published';

interface DistributionLane {
  platform: string;
  languageCode: string | null;
  state: LaneState;
  label: string;
  detail: string;
}

interface DistributionBatch {
  episodeId: string;
  title: string | null;
  targetAt: string;
  blocked: number;
  lanes: DistributionLane[];
}

function buildBatches(
  performance: SocialPerformanceResponse | null,
  social: OperationsSocialResponse | null,
): DistributionBatch[] {
  const titleByEpisode = new Map(
    (performance?.episodes ?? []).map((episode) => [episode.episodeId, episode.title]),
  );
  const jobsByEpisode = new Map<string, OperationsSocialJob[]>();
  for (const job of social?.jobs ?? []) {
    const jobs = jobsByEpisode.get(job.episodeId) ?? [];
    jobs.push(job);
    jobsByEpisode.set(job.episodeId, jobs);
  }

  return [...jobsByEpisode.entries()]
    .map(([episodeId, jobs]) => {
      const targetAt = jobs
        .map((job) => job.scheduledAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0]!;
      const lanes = jobs.map(jobLane).sort(laneOrder);
      return {
        episodeId,
        title: titleByEpisode.get(episodeId) ?? null,
        targetAt,
        blocked: jobs.filter(
          (job) => job.attemptsExhausted || job.overdueMinutes !== null,
        ).length,
        lanes,
      };
    })
    .sort((left, right) => Date.parse(left.targetAt) - Date.parse(right.targetAt));
}

function jobLane(job: OperationsSocialJob): DistributionLane {
  const state: LaneState =
    job.attemptsExhausted || job.status === 'failed'
      ? 'failed'
      : job.status === 'processing'
        ? 'processing'
        : 'queued';
  const overdue =
    job.overdueMinutes === null
      ? null
      : `${integer(Math.round(job.overdueMinutes))} min overdue`;
  return {
    platform: job.platform,
    languageCode: job.languageCode,
    state,
    label:
      state === 'failed'
        ? job.attemptsExhausted
          ? 'Retries exhausted'
          : 'Retrying'
        : state === 'processing'
          ? 'Publishing now'
          : overdue
            ? 'Overdue'
            : 'Scheduled',
    detail:
      overdue ??
      (state === 'processing'
        ? `attempt ${integer(job.attemptCount + 1)}`
        : `attempt ${integer(job.attemptCount)} · ${relativeTime(job.nextAttemptAt)}`),
  };
}

function laneOrder(left: DistributionLane, right: DistributionLane): number {
  return (
    PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform) ||
    (left.languageCode ?? '').localeCompare(right.languageCode ?? '')
  );
}
