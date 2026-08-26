import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialPublishSchedules: vi.fn().mockResolvedValue(0),
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
  listPartiallyPublishedCohorts: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn().mockResolvedValue(undefined),
  skipOverdueSocialPublishJobs: vi.fn().mockResolvedValue(0),
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
  captureDueAccountSnapshots: vi.fn().mockResolvedValue(0),
  refreshSocialStrategies: vi.fn(),
  getOrCreateExperimentAssignment: vi.fn(),
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
  latestPendingSocialPublishSchedule: vi.fn().mockResolvedValue(null),
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes:
    mocks.listSocialPublishCandidatesForEpisodes,
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
  updateSocialPostReviewStatus: mocks.updateSocialPostReviewStatus,
}));
vi.mock('./account-snapshots.js', () => ({
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
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

const NOW = new Date('2026-08-16T10:00:00.000Z');
const FIRST_STARTED_AT = '2026-08-16T08:00:00.000Z';
const PARTIAL_EPISODE = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.ensureSocialDaemonStart.mockResolvedValue(FIRST_STARTED_AT);
});

describe('release cohort serialization', () => {
  it('claims only the partially published episode while it still has pending lanes', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([PARTIAL_EPISODE]);
    mocks.claimSocialPublishBatch.mockResolvedValue([]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
      episodeId: PARTIAL_EPISODE,
    });
  });

  it('publishes nothing this tick when the partial cohort has nothing due yet, even if other work is unrestricted', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([PARTIAL_EPISODE]);
    mocks.claimSocialPublishBatch.mockResolvedValue([]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    // Only the scoped claim ran; there is no unrestricted fallback claim in
    // the same tick that could start a fresh episode ahead of this one.
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });

  it('finishes the partial cohort before an unrestricted claim can start a fresh episode', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([PARTIAL_EPISODE]);
    const pendingLane = {
      id: 'job-pending-lane',
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
    };
    mocks.claimSocialPublishBatch.mockResolvedValue([pendingLane]);
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'youtube', status: 'published' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-1' }]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: PARTIAL_EPISODE }),
    );
    expect(mocks.publishSocialBatch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: PARTIAL_EPISODE }),
    );
    // No unrestricted claim happened in the same tick.
    expect(mocks.claimSocialPublishBatch).not.toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
    });
  });

  it('falls back to an unrestricted claim once no cohort is partial', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
    mocks.claimSocialPublishBatch.mockResolvedValue([]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledTimes(1);
    expect(mocks.claimSocialPublishBatch).toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
    });
  });
});
