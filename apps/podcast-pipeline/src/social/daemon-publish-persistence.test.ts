import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialPublishSchedules: vi.fn(),
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
  listLearningSocialPosts: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  skipOverdueSocialPublishJobs: vi.fn().mockResolvedValue(0),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn(),
  refreshSocialStrategies: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  alignPendingSocialPublishSchedules: mocks.alignPendingSocialPublishSchedules,
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
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
  skipOverdueSocialPublishJobs: mocks.skipOverdueSocialPublishJobs,
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

import { runSocialDaemonTick } from './daemon.js';

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
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
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
    ['stateError', new Error('failed to persist platform state')],
    ['recordError', new Error('failed to record social post')],
  ] as const)(
    'retries a published outcome when %s is present instead of marking the job complete',
    async (errorField, error) => {
      mocks.listSocialPostsByEpisode.mockResolvedValueOnce([]);
      mocks.publishSocialBatch.mockResolvedValue([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/1',
          [errorField]: error,
        },
      ]);

      await runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-18T00:00:00.000Z',
      });

      expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        owner: expect.any(String),
        now: NOW,
        attemptCount: 3,
        error: error.message,
      });
      expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
    },
  );

  it('retries when publish reports success but no social post row was recorded', async () => {
    mocks.listSocialPostsByEpisode.mockResolvedValue([]);
    mocks.publishSocialBatch.mockResolvedValue([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/zap/status/1',
      },
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      now: NOW,
      attemptCount: 3,
      error: 'x publish completed but no social_posts row was recorded.',
    });
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
