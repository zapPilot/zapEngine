import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPublishState: vi.fn().mockResolvedValue({}),
  listPastDueSocialPublishJobs: vi.fn().mockResolvedValue([]),
  rescheduleSocialPublishJob: vi.fn().mockResolvedValue(true),
  claimSocialPublishBatch: vi.fn(),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn(),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn(),
  getSocialQueueSnapshot: vi.fn(),
  getSocialStrategyById: vi.fn(),
  latestPendingSocialPublishSchedule: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn(),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn(),
  refreshSocialStrategies: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  listPastDueSocialPublishJobs: mocks.listPastDueSocialPublishJobs,
  rescheduleSocialPublishJob: mocks.rescheduleSocialPublishJob,
  claimSocialPublishBatch: mocks.claimSocialPublishBatch,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
  latestPendingSocialPublishSchedule: mocks.latestPendingSocialPublishSchedule,
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listDueSocialPublishPlatforms: mocks.listDueSocialPublishPlatforms,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes:
    mocks.listSocialPublishCandidatesForEpisodes,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
  releaseSocialPublishJobLease: mocks.releaseSocialPublishJobLease,
}));

vi.mock('./release-cohort-store.js', () => ({
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  claimReleaseCohortJobs: mocks.claimSocialPublishBatch,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes: mocks.listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
}));

vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
}));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));

vi.mock('./state.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state.js')>()),
  readPublishState: mocks.readPublishState,
}));

import { runSocialDaemonTick } from './daemon.js';
import { SocialReleaseFailureError } from './publish-error.js';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';

function publishJob(attemptCount = 3) {
  return {
    id: 'job-1',
    episode_id: EPISODE_ID,
    platform: 'x',
    status: 'processing',
    scheduled_at: NOW.toISOString(),
    next_attempt_at: NOW.toISOString(),
    strategy_version_id: null,
    social_post_id: null,
    attempt_count: attemptCount,
    lease_owner: 'owner',
    lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    last_error: null,
    completed_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readPublishState.mockReset().mockResolvedValue({});
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  // Publishing re-checks media for every claimed cohort; the default is the
  // normal production state, where every claimed episode is fully ready.
  mocks.listSocialPublishCandidatesForEpisodes.mockImplementation(
    async (episodeIds: readonly string[]) =>
      episodeIds.flatMap((episodeId) =>
        (['zh-Hant', 'ja', 'en'] as const).map((language_code) => ({
          episode_id: episodeId,
          ready_at: '2026-08-16T09:00:00.000Z',
          language_code,
          episode_created_at: '2026-08-24T00:00:00.000Z',
        })),
      ),
  );
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.latestPendingSocialPublishSchedule.mockResolvedValue(null);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockResolvedValue(true);
  mocks.claimSocialPublishBatch.mockResolvedValue([publishJob()]);
});

describe('social daemon publish persistence failures', () => {
  it.each([
    ['state', new Error('failed to persist platform state')],
    ['telemetry', new Error('failed to record social post')],
  ] as const)(
    'stops the tick instead of retrying when publishSocialBatch fails with a %s error',
    async (phase, cause) => {
      mocks.listSocialPostsByEpisode.mockResolvedValueOnce([]);
      mocks.publishSocialBatch.mockRejectedValue(
        new SocialReleaseFailureError({
          episodeId: EPISODE_ID,
          languageCode: 'zh-Hant',
          platform: 'x',
          phase,
          cause,
        }),
      );

      await expect(
        runSocialDaemonTick({
          now: NOW,
          firstStartedAt: '2026-08-18T00:00:00.000Z',
        }),
      ).rejects.toThrow(cause.message);

      expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
      expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
    },
  );

  it('stops the tick when publish reports success but no social post row was recorded', async () => {
    mocks.listSocialPostsByEpisode.mockResolvedValue([]);
    mocks.publishSocialBatch.mockResolvedValue([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/zap/status/1',
      },
    ]);

    await expect(
      runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).rejects.toThrow(
      'x publish completed but no social_posts row was recorded.',
    );

    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
  });

  it('reconciles an unfinished job from social_posts before publish and never uploads it again', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        ...publishJob(4),
        status: 'retry_wait',
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'x publish completed but no social_posts row was recorded.',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-2', episode_id: EPISODE_ID, platform: 'x' },
    ]);
    mocks.claimSocialPublishBatch.mockResolvedValue([]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      socialPostId: 'post-2',
      completedAt: NOW,
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
  });

  it('does not republish when reconcile loses the CAS race and publish claims the job', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-1',
        episode_id: EPISODE_ID,
        platform: 'x',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-2', episode_id: EPISODE_ID, platform: 'x' },
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(false);
    mocks.claimSocialPublishBatch.mockResolvedValue([publishJob(4)]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      socialPostId: 'post-2',
      completedAt: NOW,
    });
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
  });

  it('does not republish an existing post when completion loses the publish lease', async () => {
    const leaseError = new Error('Social publish job job-1 lease was lost.');
    mocks.listSocialPostsByEpisode.mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.completeSocialPublishJob.mockRejectedValueOnce(leaseError);
    mocks.claimSocialPublishBatch.mockResolvedValue([publishJob(4)]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      now: NOW,
      attemptCount: 4,
      error: leaseError.message,
    });
  });

  it('recovers from lost failure persistence on the next tick without republishing an existing post', async () => {
    const leaseError = new Error('Social publish job job-1 lease was lost.');
    const persistenceError = new Error('failed to persist publish failure');
    const recoveryNow = new Date(NOW.getTime() + 16 * 60_000);

    mocks.listUnfinishedSocialPublishJobs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...publishJob(4),
          lease_owner: 'stale-owner',
          lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
        },
      ]);
    mocks.listSocialPostsByEpisode.mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-2', episode_id: EPISODE_ID, platform: 'x' },
    ]);
    mocks.completeSocialPublishJob.mockRejectedValueOnce(leaseError);
    mocks.failSocialPublishJob.mockRejectedValueOnce(persistenceError);
    mocks.claimSocialPublishBatch
      .mockResolvedValueOnce([publishJob(4)])
      .mockResolvedValueOnce([]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });
    await runSocialDaemonTick({
      now: recoveryNow,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      socialPostId: 'post-2',
      completedAt: recoveryNow,
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });
});

describe('historical local publication recovery', () => {
  it('completes all four local-only lanes without generating copy or calling transport, even after lease loss', async () => {
    const publishedAt = '2026-08-11T00:00:00.000Z';
    const platforms = ['x', 'youtube', 'rednote', 'threads'];
    mocks.readPublishState.mockResolvedValue({
      [EPISODE_ID]: {
        zh: Object.fromEntries(
          platforms.map((platform) => [
            platform,
            { published: true, publishedAt },
          ]),
        ),
      },
    });
    mocks.listSocialPostsByEpisode.mockResolvedValue([]);
    mocks.claimSocialPublishBatch.mockResolvedValue(
      platforms.map((platform) => ({
        ...publishJob(),
        id: platform,
        platform,
        language_code: 'zh-Hant',
      })),
    );
    mocks.completeSocialPublishJob.mockRejectedValueOnce(
      new Error('lease lost'),
    );
    for (let tick = 0; tick < 2; tick++) {
      await runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-18T00:00:00.000Z',
        log: vi.fn(),
      });
    }
    for (const platform of platforms)
      expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
        jobId: platform,
        owner: expect.any(String),
        completedAt: new Date(publishedAt),
        socialPostId: null,
      });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledTimes(8);
  });

  it('does not use a Chinese local post to complete a Japanese job', async () => {
    mocks.readPublishState.mockResolvedValue({
      [EPISODE_ID]: {
        zh: { x: { published: true, publishedAt: NOW.toISOString() } },
      },
    });
    mocks.claimSocialPublishBatch.mockResolvedValue([
      { ...publishJob(), language_code: 'ja' },
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([]);
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published' },
    ]);
    await expect(
      runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-18T00:00:00.000Z',
        log: vi.fn(),
      }),
    ).rejects.toThrow('no social_posts row');
    expect(mocks.publishSocialBatch).toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
  });
});
