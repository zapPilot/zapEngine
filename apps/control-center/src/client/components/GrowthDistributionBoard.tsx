import { useEffect, useState } from 'react';

import type {
  OperationsSocialJob,
  OperationsSocialResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { integer, relativeTime } from '../format.js';
import { platformLabel } from '../platform.js';

const PLATFORM_ORDER = ['threads', 'x', 'rednote', 'youtube'];

interface ReleaseEvidencePost {
  episodeId: string;
  platform: string;
  languageCode: string | null;
  postUrl: string | null;
  publishedAt: string;
}

interface ReleaseEvidenceResponse {
  posts: ReleaseEvidencePost[];
  message: string | null;
}

export function GrowthDistributionBoard(props: {
  performance: SocialPerformanceResponse | null;
  social: OperationsSocialResponse | null;
}) {
  const [evidence, setEvidence] = useState<ReleaseEvidencePost[]>([]);
  const [closingEpisodeId, setClosingEpisodeId] = useState<string | null>(null);
  const [closedEpisodeIds, setClosedEpisodeIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    let cancelled = false;
    void fetch('/api/operations/social/release-evidence')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as ReleaseEvidenceResponse;
      })
      .then((response) => {
        if (!cancelled) setEvidence(response.posts ?? []);
      })
      .catch(() => {
        // Evidence is additive. Losing it must not blank the operational queue.
      });
    return () => {
      cancelled = true;
    };
  }, [props.social?.generatedAt]);

  const batches = buildBatches(props.performance, props.social, evidence).filter(
    (batch) => !closedEpisodeIds.includes(batch.episodeId),
  );

  async function markComplete(episodeId: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Keep posts that already went live and permanently skip every remaining platform for this episode?',
      )
    ) {
      return;
    }
    setClosingEpisodeId(episodeId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/operations/social/${encodeURIComponent(episodeId)}/complete`,
        { method: 'POST' },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setClosedEpisodeIds((current) => [...current, episodeId]);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not close social release',
      );
    } finally {
      setClosingEpisodeId(null);
    }
  }

  return (
    <section className="domain-visualization distribution-board">
      <div className="domain-visualization-head compact-domain-head">
        <div>
          <span className="domain-visualization-kicker">Distribution</span>
          <h2>Publishing now</h2>
        </div>
      </div>

      {actionError ? <small className="panel-note">{actionError}</small> : null}

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
                    {integer(batch.published)} published ·{' '}
                    {integer(batch.remaining)} remaining
                  </strong>
                </div>
                <button
                  className="refresh-button pipeline-retry"
                  disabled={closingEpisodeId === batch.episodeId}
                  onClick={() => void markComplete(batch.episodeId)}
                  type="button"
                >
                  {closingEpisodeId === batch.episodeId
                    ? 'Closing…'
                    : 'Mark complete'}
                </button>
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
                      <span className="distribution-track-scheduled">
                        Scheduled
                      </span>
                      <i />
                      <span className="distribution-track-posted">Posted</span>
                    </div>
                    <div className="distribution-lane-state">
                      <strong>{lane.label}</strong>
                      <small>
                        {lane.detail}
                        {lane.postUrl ? (
                          <>
                            {' · '}
                            <a
                              href={lane.postUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open ↗
                            </a>
                          </>
                        ) : null}
                      </small>
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
  postUrl?: string | null;
}

interface DistributionBatch {
  episodeId: string;
  title: string | null;
  targetAt: string;
  published: number;
  remaining: number;
  lanes: DistributionLane[];
}

function buildBatches(
  performance: SocialPerformanceResponse | null,
  social: OperationsSocialResponse | null,
  evidence: ReleaseEvidencePost[],
): DistributionBatch[] {
  const titleByEpisode = new Map(
    (performance?.episodes ?? []).map((episode) => [
      episode.episodeId,
      episode.title,
    ]),
  );
  const jobsByEpisode = new Map<string, OperationsSocialJob[]>();
  for (const job of social?.jobs ?? []) {
    const jobs = jobsByEpisode.get(job.episodeId) ?? [];
    jobs.push(job);
    jobsByEpisode.set(job.episodeId, jobs);
  }
  const postsByEpisode = new Map<string, ReleaseEvidencePost[]>();
  for (const post of evidence) {
    if (!jobsByEpisode.has(post.episodeId)) continue;
    const posts = postsByEpisode.get(post.episodeId) ?? [];
    posts.push(post);
    postsByEpisode.set(post.episodeId, posts);
  }

  return [...jobsByEpisode.entries()]
    .map(([episodeId, jobs]) => {
      const targetAt = jobs
        .map((job) => job.scheduledAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0]!;
      const latestPosts = latestPostByLane(postsByEpisode.get(episodeId) ?? []);
      const publishedKeys = new Set(latestPosts.map((post) => laneKey(post)));
      const remainingJobs = jobs.filter(
        (job) => !publishedKeys.has(laneKey(job)),
      );
      const lanes = [
        ...latestPosts.map(postLane),
        ...remainingJobs.map(jobLane),
      ].sort(laneOrder);
      return {
        episodeId,
        title: titleByEpisode.get(episodeId) ?? null,
        targetAt,
        published: latestPosts.length,
        remaining: remainingJobs.length,
        lanes,
      };
    })
    .sort(
      (left, right) => Date.parse(left.targetAt) - Date.parse(right.targetAt),
    );
}

function latestPostByLane(posts: ReleaseEvidencePost[]): ReleaseEvidencePost[] {
  const latest = new Map<string, ReleaseEvidencePost>();
  for (const post of [...posts].sort(
    (left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  )) {
    const key = laneKey(post);
    if (!latest.has(key)) latest.set(key, post);
  }
  return [...latest.values()];
}

function laneKey(lane: {
  platform: string;
  languageCode: string | null;
}): string {
  return `${lane.platform}:${lane.languageCode ?? ''}`;
}

function postLane(post: ReleaseEvidencePost): DistributionLane {
  return {
    platform: post.platform,
    languageCode: post.languageCode,
    state: 'published',
    label: 'Published',
    detail: relativeTime(post.publishedAt),
    postUrl: post.postUrl,
  };
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
    PLATFORM_ORDER.indexOf(left.platform) -
      PLATFORM_ORDER.indexOf(right.platform) ||
    (left.languageCode ?? '').localeCompare(right.languageCode ?? '')
  );
}
