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
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
  skipOverdueSocialPublishJobs: vi.fn().mockResolvedValue(0),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn(),
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
  listSocialPublishCandidatesForEpisodes:
    mocks.listSocialPublishCandidatesForEpisodes,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
  releaseSocialPublishJobLease: mocks.releaseSocialPublishJobLease,
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

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174020';
const STARTED_AT = '2026-08-19T03:00:00.000Z';
const times = [
  new Date('2026-08-19T04:30:00.000Z'),
  new Date('2026-08-19T04:40:00.000Z'),
  new Date('2026-08-19T04:50:00.000Z'),
];

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
  mocks.listSocialPostsByEpisode.mockResolvedValue([
    { id: 'post-existing-three-tick' },
  ]);
  mocks.createMetricCollectors.mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  });
});

describe('social daemon repeated reconciliation lease loss recovery', () => {
  it('never republishes when two retry completions lose their lease before third-tick reconciliation succeeds', async () => {
    const job = {
      id: 'job-three-tick-recovery',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'failed',
      attempt_count: 7,
      strategy_version_id: null,
    };
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([job]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      {
        id: 'post-existing-three-tick',
        episode_id: EPISODE_ID,
        platform: 'threads',
      },
    ]);
    mocks.reconcileSocialPublishJob
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.claimSocialPublishBatch
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    mocks.completeSocialPublishJob
      .mockRejectedValueOnce(new Error('first lease lost'))
      .mockRejectedValueOnce(new Error('second lease lost'));
    mocks.failSocialPublishJob.mockResolvedValue(undefined);

    for (const now of times)
      await runSocialDaemonTick({
        now,
        firstStartedAt: STARTED_AT,
        log: vi.fn(),
      });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledTimes(3);
    expect(mocks.reconcileSocialPublishJob).toHaveBeenNthCalledWith(3, {
      jobId: job.id,
      socialPostId: 'post-existing-three-tick',
      completedAt: times[2],
    });
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledTimes(2);
    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(2);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(3);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });
});
