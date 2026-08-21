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

const NOW = new Date('2026-08-18T01:00:00.000Z');
const FIRST_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const SECOND_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174001';

function publishJob(
  id: string,
  episodeId: string,
  attemptCount: number,
  platform: 'x' | 'threads' = 'x',
) {
  return {
    id,
    episode_id: episodeId,
    platform,
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
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockResolvedValue(true);
});

describe('social daemon publish batch isolation', () => {
  it('publishes all due platforms for one episode in a single CLI run', async () => {
    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-x', FIRST_EPISODE_ID, 1),
      publishJob('job-threads', FIRST_EPISODE_ID, 1, 'threads'),
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-x' }])
      .mockResolvedValueOnce([{ id: 'post-threads' }]);
    mocks.runSocialCli.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
      {
        platform: 'threads',
        status: 'published',
        url: 'https://threads.net/@zap/post/1',
      },
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-18T00:00:00.000Z',
    });

    expect(mocks.runSocialCli).toHaveBeenCalledTimes(1);
    expect(mocks.runSocialCli).toHaveBeenCalledWith(
      [FIRST_EPISODE_ID, '--yes', '--platform', 'x,threads'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledTimes(2);
  });

  it('continues with later jobs when an earlier completion loses its lease', async () => {
    const leaseError = new Error('Social publish job job-1 lease was lost.');
    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-1', FIRST_EPISODE_ID, 4),
      publishJob('job-2', SECOND_EPISODE_ID, 2),
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([{ id: 'post-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.completeSocialPublishJob
      .mockRejectedValueOnce(leaseError)
      .mockResolvedValueOnce(undefined);
    mocks.runSocialCli.mockResolvedValue([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/zap/status/2',
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
      attemptCount: 4,
      error: leaseError.message,
    });
    expect(mocks.runSocialCli).toHaveBeenCalledTimes(1);
    expect(mocks.runSocialCli).toHaveBeenCalledWith(
      [SECOND_EPISODE_ID, '--yes', '--platform', 'x'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenLastCalledWith({
      jobId: 'job-2',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-2' }),
    );
  });

  it('continues with later jobs when an earlier platform publish fails', async () => {
    const publishError = new Error('X publish failed');
    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-1', FIRST_EPISODE_ID, 3),
      publishJob('job-2', SECOND_EPISODE_ID, 1),
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.runSocialCli
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'failed',
          error: publishError,
        },
      ])
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/2',
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
      error: publishError.message,
    });
    expect(mocks.runSocialCli).toHaveBeenCalledTimes(2);
    expect(mocks.runSocialCli).toHaveBeenLastCalledWith(
      [SECOND_EPISODE_ID, '--yes', '--platform', 'x'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-2',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-2' }),
    );
  });

  it('continues with later jobs when an earlier published outcome has a state error', async () => {
    const stateError = new Error('published state could not be persisted');
    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-1', FIRST_EPISODE_ID, 5),
      publishJob('job-2', SECOND_EPISODE_ID, 2),
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.runSocialCli
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/1',
          stateError,
        },
      ])
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/2',
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
      attemptCount: 5,
      error: stateError.message,
    });
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1' }),
    );
    expect(mocks.runSocialCli).toHaveBeenCalledTimes(2);
    expect(mocks.runSocialCli).toHaveBeenLastCalledWith(
      [SECOND_EPISODE_ID, '--yes', '--platform', 'x'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-2',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-2' }),
    );
  });

  it('continues with later jobs when an earlier published outcome has a record error', async () => {
    const recordError = new Error('social post row could not be recorded');
    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-1', FIRST_EPISODE_ID, 6),
      publishJob('job-2', SECOND_EPISODE_ID, 2),
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-2' }]);
    mocks.runSocialCli
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/1',
          recordError,
        },
      ])
      .mockResolvedValueOnce([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/2',
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
      attemptCount: 6,
      error: recordError.message,
    });
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1' }),
    );
    expect(mocks.runSocialCli).toHaveBeenCalledTimes(2);
    expect(mocks.runSocialCli).toHaveBeenLastCalledWith(
      [SECOND_EPISODE_ID, '--yes', '--platform', 'x'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-2',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-2',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-2' }),
    );
  });
});
