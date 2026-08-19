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
  listDueMetricPosts: mocks.listDueMetricPosts,
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

const NOW = new Date('2026-08-19T03:00:00.000Z');
const FIRST_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174010';
const SECOND_EPISODE_ID = '123e4567-e89b-42d3-a456-426614174011';

function publishJob(id: string, episodeId: string, attemptCount: number) {
  return {
    id,
    episode_id: episodeId,
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
  mocks.listDueMetricPosts.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockResolvedValue(true);
});

describe('social daemon publish failure persistence isolation', () => {
  it('continues with later jobs when persisting an earlier failure also fails', async () => {
    const publishError = new Error('X publish failed');
    const persistenceError = new Error('failure state write failed');
    const log = vi.fn();

    mocks.claimSocialPublishBatch.mockResolvedValue([
      publishJob('job-1', FIRST_EPISODE_ID, 7),
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
    mocks.failSocialPublishJob.mockRejectedValueOnce(persistenceError);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T02:00:00.000Z',
      log,
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      now: NOW,
      attemptCount: 7,
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
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(persistenceError.message),
    );
  });
});
