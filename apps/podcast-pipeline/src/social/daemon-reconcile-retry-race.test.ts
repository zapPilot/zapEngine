import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  listSocialPostIdentitiesByEpisodes: vi.fn(),
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

import { runSocialDaemonTick } from './daemon.js';

const NOW = new Date('2026-08-19T04:30:00.000Z');
const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174020';

function existingPost(id: string) {
  return { id, episode_id: EPISODE_ID, platform: 'threads' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.latestPendingSocialPublishSchedule.mockResolvedValue(null);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.createMetricCollectors.mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  });
});

describe('social daemon reconciliation versus retry race', () => {
  it('does not let an existing YouTube language reconcile its sibling language', async () => {
    const englishJob = {
      id: 'youtube-en-job',
      episode_id: EPISODE_ID,
      platform: 'youtube',
      language_code: 'en',
      status: 'failed',
      attempt_count: 2,
      strategy_version_id: null,
    };
    const japaneseJob = {
      ...englishJob,
      id: 'youtube-ja-job',
      language_code: 'ja',
    };
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      englishJob,
      japaneseJob,
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      {
        id: 'youtube-en-post',
        episode_id: EPISODE_ID,
        platform: 'youtube',
        language_code: 'en',
      },
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(true);
    mocks.claimSocialPublishBatch.mockResolvedValue([japaneseJob]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'youtube-ja-post' }]);
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'youtube', status: 'published' },
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: englishJob.id,
      socialPostId: 'youtube-en-post',
      completedAt: NOW,
    });
    expect(mocks.publishSocialBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: EPISODE_ID,
        languageCode: 'ja',
        platforms: [expect.objectContaining({ platform: 'youtube' })],
      }),
    );
  });

  it('reconciles an already-published failed job before the retry claim stage', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-failed-but-published',
        episode_id: EPISODE_ID,
        platform: 'threads',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      existingPost('post-existing-before-retry'),
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(true);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.listSocialPostIdentitiesByEpisodes).toHaveBeenCalledWith([
      EPISODE_ID,
    ]);
    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-failed-but-published',
      socialPostId: 'post-existing-before-retry',
      completedAt: NOW,
    });
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(
      mocks.reconcileSocialPublishJob.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.claimSocialPublishBatch.mock.invocationCallOrder[0]!);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
  });

  it('fences a retry publish when reconciliation loses its CAS race', async () => {
    const job = {
      id: 'job-cas-race',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'failed',
      attempt_count: 3,
      strategy_version_id: null,
    };

    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([job]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      existingPost('post-existing-cas-race'),
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      { id: 'post-existing-cas-race' },
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(false);
    mocks.claimSocialPublishBatch.mockResolvedValue([job]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: job.id,
      socialPostId: 'post-existing-cas-race',
      completedAt: NOW,
    });
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        completedAt: NOW,
        socialPostId: 'post-existing-cas-race',
      }),
    );
    expect(mocks.listSocialPostIdentitiesByEpisodes).toHaveBeenCalledTimes(1);
    expect(mocks.listSocialPostsByEpisode).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
  });

  it('never republishes when retry completion loses the lease after a reconciliation CAS miss', async () => {
    const job = {
      id: 'job-double-cas-loss',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'failed',
      attempt_count: 4,
      strategy_version_id: null,
    };

    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([job]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      existingPost('post-existing-double-cas'),
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      { id: 'post-existing-double-cas' },
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(false);
    mocks.claimSocialPublishBatch.mockResolvedValue([job]);
    mocks.completeSocialPublishJob.mockRejectedValueOnce(
      new Error('publish job lease lost'),
    );

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: job.id,
      socialPostId: 'post-existing-double-cas',
      completedAt: NOW,
    });
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        completedAt: NOW,
        socialPostId: 'post-existing-double-cas',
      }),
    );
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        attemptCount: 4,
        error: 'publish job lease lost',
      }),
    );
    expect(mocks.listSocialPostsByEpisode).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });

  it('recovers on the next tick when double CAS loss cannot persist the failure state', async () => {
    const job = {
      id: 'job-double-cas-persistence-loss',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'failed',
      attempt_count: 5,
      strategy_version_id: null,
    };
    const later = new Date(NOW.getTime() + 10 * 60_000);
    const log = vi.fn();

    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([job]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      existingPost('post-existing-persistence-loss'),
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      { id: 'post-existing-persistence-loss' },
    ]);
    mocks.reconcileSocialPublishJob
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.claimSocialPublishBatch
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);
    mocks.completeSocialPublishJob.mockRejectedValueOnce(
      new Error('publish job lease lost'),
    );
    mocks.failSocialPublishJob.mockRejectedValueOnce(
      new Error('failure state write failed'),
    );

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log,
    });
    await runSocialDaemonTick({
      now: later,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log,
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        attemptCount: 5,
        error: 'publish job lease lost',
      }),
    );
    expect(mocks.reconcileSocialPublishJob).toHaveBeenNthCalledWith(2, {
      jobId: job.id,
      socialPostId: 'post-existing-persistence-loss',
      completedAt: later,
    });
    expect(mocks.listSocialPostIdentitiesByEpisodes).toHaveBeenCalledTimes(2);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(2);
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/failed to persist.*publish failure/),
    );
  });

  it('still fences publish when the next tick loses reconciliation CAS again before reclaim', async () => {
    const job = {
      id: 'job-second-tick-cas-miss',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'failed',
      attempt_count: 6,
      strategy_version_id: null,
    };
    const later = new Date(NOW.getTime() + 10 * 60_000);

    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([job]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      existingPost('post-existing-second-tick-cas'),
    ]);
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      { id: 'post-existing-second-tick-cas' },
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(false);
    mocks.claimSocialPublishBatch.mockResolvedValue([job]);
    mocks.completeSocialPublishJob
      .mockRejectedValueOnce(new Error('publish job lease lost'))
      .mockResolvedValueOnce(undefined);
    mocks.failSocialPublishJob.mockRejectedValueOnce(
      new Error('failure state write failed'),
    );

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });
    await runSocialDaemonTick({
      now: later,
      firstStartedAt: '2026-08-19T03:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenNthCalledWith(2, {
      jobId: job.id,
      socialPostId: 'post-existing-second-tick-cas',
      completedAt: later,
    });
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(2);
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledTimes(2);
    expect(mocks.completeSocialPublishJob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        jobId: job.id,
        completedAt: later,
        socialPostId: 'post-existing-second-tick-cas',
      }),
    );
    expect(mocks.listSocialPostsByEpisode).toHaveBeenCalledTimes(2);
    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });
});
