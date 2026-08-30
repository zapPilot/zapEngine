import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPastDueSocialPublishJobs: vi.fn().mockResolvedValue([]),
  rescheduleSocialPublishJob: vi.fn().mockResolvedValue(true),
  claimSocialPublishBatch: vi.fn(),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn().mockResolvedValue(true),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  getSocialQueueSnapshot: vi.fn().mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  }),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn().mockResolvedValue(undefined),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn().mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  }),
  createMetricsBrowserSession: vi.fn().mockReturnValue({
    withPage: vi.fn(),
    close: vi.fn(),
  }),
  captureDueAccountSnapshots: vi.fn().mockResolvedValue([]),
  capturePrePublishAccountSnapshots: vi.fn().mockResolvedValue([]),
  refreshSocialStrategies: vi.fn(),
  getOrCreateExperimentAssignment: vi.fn(),
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
  latestPendingSocialPublishSchedule: vi.fn().mockResolvedValue(null),
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

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes: mocks.listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
  updateSocialPostReviewStatus: mocks.updateSocialPostReviewStatus,
}));
vi.mock('./account-snapshots.js', () => ({
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
  capturePrePublishAccountSnapshots: mocks.capturePrePublishAccountSnapshots,
}));
vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
}));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
  createMetricsBrowserSession: mocks.createMetricsBrowserSession,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));
vi.mock('./experiments.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./experiments.js')>()),
  getOrCreateExperimentAssignment: mocks.getOrCreateExperimentAssignment,
}));

import { runSocialDaemonTick } from './daemon.js';

// 10:00 JST: inside the window `publishDueJobs` will claim in.
const NOW = new Date('2026-08-16T01:00:00.000Z');
const FIRST_STARTED_AT = '2026-08-16T08:00:00.000Z';
const PARTIAL_EPISODE = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.ensureSocialDaemonStart.mockResolvedValue(FIRST_STARTED_AT);
});

describe('platform release independence', () => {
  function laneJob(overrides: Record<string, unknown>) {
    return {
      id: 'job-1',
      episode_id: PARTIAL_EPISODE,
      platform: 'youtube',
      language_code: 'en',
      status: 'processing',
      scheduled_at: NOW.toISOString(),
      next_attempt_at: NOW.toISOString(),
      strategy_version_id: null,
      social_post_id: null,
      attempt_count: 1,
      lease_owner: 'owner',
      lease_expires_at: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      last_error: null,
      completed_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      ...overrides,
    };
  }

  it('claims everything due without narrowing to one episode', async () => {
    // The cross-episode fence is gone. Under per-platform budgets a partially
    // published episode is the steady state -- Rednote at 14:30 and YouTube at
    // 17:15 are the same article, hours apart -- so fencing on it would
    // deadlock the queue against its own schedule.
    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
    });
  });

  it('publishes a lane of a half-released episode alongside a fresh one', async () => {
    const other = '123e4567-e89b-42d3-a456-426614174111';
    mocks.claimSocialPublishBatch.mockResolvedValue([
      laneJob({ id: 'job-partial' }),
      laneJob({
        id: 'job-fresh',
        episode_id: other,
        platform: 'rednote',
        language_code: 'zh-Hant',
      }),
    ]);
    mocks.publishSocialBatch.mockImplementation(
      async ({ platforms }: { platforms: { platform: string }[] }) =>
        platforms.map(({ platform }) => ({ platform, status: 'published' })),
    );
    // Reconcile asks first, for every claimed job, and finds nothing; the
    // post-publish verification asks again and has to find the row.
    mocks.listSocialPostsByEpisode.mockImplementation(async () =>
      mocks.publishSocialBatch.mock.calls.length > 0 ? [{ id: 'post-1' }] : [],
    );

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    const publishedEpisodes = mocks.publishSocialBatch.mock.calls.map(
      ([input]) => (input as { episodeId: string }).episodeId,
    );
    expect(publishedEpisodes).toEqual(
      expect.arrayContaining([PARTIAL_EPISODE, other]),
    );
  });

  it('claims nothing outside the hours someone can watch a browser fail', async () => {
    // 04:00 JST. Rednote and X publish through real browser sessions on a Mac;
    // a failure nobody sees is the case this gate exists for. The lane is not
    // lost -- reschedulePastDueJobs moves it to the next slot.
    await runSocialDaemonTick({
      now: new Date('2026-08-15T19:00:00.000Z'),
      firstStartedAt: FIRST_STARTED_AT,
    });

    expect(mocks.claimSocialPublishBatch).not.toHaveBeenCalled();
  });

  it('still claims at the last minute of the window', async () => {
    // 17:59 JST, which is when the 17:15 YouTube slot is served.
    await runSocialDaemonTick({
      now: new Date('2026-08-16T08:59:00.000Z'),
      firstStartedAt: FIRST_STARTED_AT,
    });

    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
  });
});
