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
  listDueMetricPosts: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  insertSocialPostMetric: vi.fn(),
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
  listDueMetricPosts: mocks.listDueMetricPosts,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
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
  mocks.listDueMetricPosts.mockResolvedValue([]);
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
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([{ id: 'post-reconcile' }])
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
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([{ id: 'post-reconcile-1' }])
      .mockResolvedValueOnce([{ id: 'post-reconcile-2' }]);
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
});
