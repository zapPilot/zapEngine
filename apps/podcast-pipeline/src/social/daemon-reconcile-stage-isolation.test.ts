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
  listLearningSocialPosts: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  skipOverdueSocialPublishJobs: vi.fn().mockResolvedValue(0),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  runSocialCli: vi.fn(),
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
  listLearningSocialPosts: mocks.listLearningSocialPosts,
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

vi.mock('./cli.js', () => ({ runSocialCli: mocks.runSocialCli }));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));

import { runSocialDaemonTick } from './daemon.js';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const RECONCILE_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174010';
const PUBLISH_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174011';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.latestPendingSocialPublishSchedule.mockResolvedValue(null);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.createMetricCollectors.mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  });
});

describe('social daemon reconcile stage isolation', () => {
  it('continues publishing when reconciliation throws', async () => {
    const reconcileError = new Error('reconcile database unavailable');
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-reconcile',
        episode_id: RECONCILE_EPISODE_ID,
        platform: 'x',
        status: 'failed',
      },
    ]);
    mocks.reconcileSocialPublishJob.mockRejectedValue(reconcileError);
    mocks.claimSocialPublishBatch.mockResolvedValue([
      {
        id: 'job-publish',
        episode_id: PUBLISH_EPISODE_ID,
        platform: 'threads',
        status: 'processing',
        scheduled_at: NOW.toISOString(),
        next_attempt_at: NOW.toISOString(),
        strategy_version_id: null,
        social_post_id: null,
        attempt_count: 1,
        lease_owner: 'owner',
        lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
        last_error: null,
        completed_at: null,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-reconcile', episode_id: RECONCILE_EPISODE_ID, platform: 'x' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-publish' }]);
    mocks.runSocialCli.mockResolvedValue([
      {
        platform: 'threads',
        status: 'published',
        url: 'https://www.threads.net/@zap/post/1',
      },
    ]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-reconcile',
      socialPostId: 'post-reconcile',
      completedAt: NOW,
    });
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconcile failed: ${reconcileError.message}`,
    );
    expect(mocks.runSocialCli).toHaveBeenCalledWith(
      [PUBLISH_EPISODE_ID, '--yes', '--platform', 'threads'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-publish',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-publish',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
  });

  it('continues reconciling later jobs when one reconciliation throws', async () => {
    const reconcileError = new Error('first reconciliation failed');
    const secondEpisodeId = '123e4567-e89b-42d3-a456-426614174012';
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-reconcile-1',
        episode_id: RECONCILE_EPISODE_ID,
        platform: 'x',
        status: 'failed',
      },
      {
        id: 'job-reconcile-2',
        episode_id: secondEpisodeId,
        platform: 'threads',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      {
        id: 'post-reconcile-1',
        episode_id: RECONCILE_EPISODE_ID,
        platform: 'x',
      },
      {
        id: 'post-reconcile-2',
        episode_id: secondEpisodeId,
        platform: 'threads',
      },
    ]);
    mocks.reconcileSocialPublishJob
      .mockRejectedValueOnce(reconcileError)
      .mockResolvedValueOnce(true);
    mocks.claimSocialPublishBatch.mockResolvedValue([]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenNthCalledWith(2, {
      jobId: 'job-reconcile-2',
      socialPostId: 'post-reconcile-2',
      completedAt: NOW,
    });
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconciled threads for ${secondEpisodeId} - already published (post-reconcile-2).`,
    );
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconcile failed: ${reconcileError.message}`,
    );
    expect(mocks.runSocialCli).not.toHaveBeenCalled();
  });

  it('reports a failed sweep lookup and still publishes due jobs', async () => {
    const lookupError = new Error('social post lookup unavailable');
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-lookup-fails',
        episode_id: RECONCILE_EPISODE_ID,
        platform: 'x',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockRejectedValue(lookupError);
    mocks.reconcileSocialPublishJob.mockResolvedValue(true);
    mocks.claimSocialPublishBatch.mockResolvedValue([
      {
        id: 'job-publish',
        episode_id: PUBLISH_EPISODE_ID,
        platform: 'threads',
        status: 'processing',
        scheduled_at: NOW.toISOString(),
        next_attempt_at: NOW.toISOString(),
        strategy_version_id: null,
        social_post_id: null,
        attempt_count: 1,
        lease_owner: 'owner',
        lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
        last_error: null,
        completed_at: null,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-publish' }]);
    mocks.runSocialCli.mockResolvedValue([
      {
        platform: 'threads',
        status: 'published',
        url: 'https://www.threads.net/@zap/post/1',
      },
    ]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });

    expect(mocks.reconcileSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconcile failed: ${lookupError.message}`,
    );
    expect(mocks.runSocialCli).toHaveBeenCalledWith(
      [PUBLISH_EPISODE_ID, '--yes', '--platform', 'threads'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-publish',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-publish',
    });
  });

  it('fences duplicate publishing when the unfinished-job lookup fails', async () => {
    const lookupError = new Error('unfinished jobs lookup unavailable');
    mocks.listUnfinishedSocialPublishJobs.mockRejectedValue(lookupError);
    mocks.claimSocialPublishBatch.mockResolvedValue([
      {
        id: 'job-claimed-after-reconcile-failure',
        episode_id: RECONCILE_EPISODE_ID,
        platform: 'x',
        status: 'processing',
        scheduled_at: NOW.toISOString(),
        next_attempt_at: NOW.toISOString(),
        strategy_version_id: null,
        social_post_id: null,
        attempt_count: 2,
        lease_owner: 'owner',
        lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
        last_error: 'previous persistence failure',
        completed_at: null,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      },
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      { id: 'post-existing-after-reconcile-failure' },
    ]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });

    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconcile failed: ${lookupError.message}`,
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-claimed-after-reconcile-failure',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-existing-after-reconcile-failure',
    });
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconciled x for ${RECONCILE_EPISODE_ID} - already published (post-existing-after-reconcile-failure).`,
    );
    expect(mocks.runSocialCli).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
  });

  it('recovers on the next tick when existing-post completion loses its lease', async () => {
    const lookupError = new Error('unfinished jobs lookup unavailable');
    const leaseError = new Error('publish job lease lost');
    const jobId = 'job-recover-after-lease-loss';
    const postId = 'post-existing-after-lease-loss';
    const unfinishedJob = {
      id: jobId,
      episode_id: RECONCILE_EPISODE_ID,
      platform: 'x' as const,
      status: 'failed' as const,
    };
    const claimedJob = {
      ...unfinishedJob,
      status: 'processing' as const,
      scheduled_at: NOW.toISOString(),
      next_attempt_at: NOW.toISOString(),
      strategy_version_id: null,
      social_post_id: null,
      attempt_count: 2,
      lease_owner: 'owner',
      lease_expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
      last_error: 'previous persistence failure',
      completed_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    };

    mocks.listUnfinishedSocialPublishJobs
      .mockRejectedValueOnce(lookupError)
      .mockResolvedValueOnce([unfinishedJob]);
    mocks.claimSocialPublishBatch
      .mockResolvedValueOnce([claimedJob])
      .mockResolvedValueOnce([]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: postId, episode_id: RECONCILE_EPISODE_ID, platform: 'x' },
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([{ id: postId }]);
    mocks.completeSocialPublishJob.mockRejectedValueOnce(leaseError);
    mocks.failSocialPublishJob.mockResolvedValue(undefined);
    mocks.reconcileSocialPublishJob.mockResolvedValue(true);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });
    await runSocialDaemonTick({
      now: new Date(NOW.getTime() + 60_000),
      firstStartedAt: '2026-08-18T23:00:00.000Z',
      log,
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
      jobId,
      owner: expect.any(String),
      now: NOW,
      attemptCount: 2,
      error: leaseError.message,
    });
    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId,
      socialPostId: postId,
      completedAt: new Date(NOW.getTime() + 60_000),
    });
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconciled x for ${RECONCILE_EPISODE_ID} - already published (${postId}).`,
    );
    expect(mocks.runSocialCli).not.toHaveBeenCalled();
  });
});
