import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialPublishSchedules: vi.fn().mockResolvedValue(0),
  claimSocialPublishBatch: vi.fn().mockResolvedValue([]),
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
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
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

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_CREATED_AT = '2026-08-24T00:00:00.000Z';
const FIRST_STARTED_AT = '2026-08-16T08:00:00.000Z';
const NOW = new Date('2026-08-16T10:00:00.000Z');

function candidate(languageCode: 'zh-Hant' | 'ja' | 'en', readyAt: string) {
  return {
    episode_id: EPISODE_ID,
    ready_at: readyAt,
    language_code: languageCode,
    episode_created_at: EPISODE_CREATED_AT,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.getOrCreateExperimentAssignment.mockImplementation(
    ({
      experimentKey,
      episodeId,
    }: {
      experimentKey: string;
      episodeId: string;
    }) =>
      Promise.resolve({
        experiment_key: experimentKey,
        episode_id: episodeId,
        variant: 'ja',
        assigned_at: EPISODE_CREATED_AT,
      }),
  );
  mocks.ensureSocialDaemonStart.mockResolvedValue(FIRST_STARTED_AT);
});

describe('release cohort media readiness barrier', () => {
  it('enqueues nothing while only one of three required languages is ready', async () => {
    const zhOnly = [candidate('zh-Hant', '2026-08-16T09:00:00.000Z')];
    mocks.listSocialPublishCandidates.mockResolvedValue(zhOnly);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(zhOnly);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`episode ${EPISODE_ID} waiting on media for`),
    );
  });

  it('enqueues the full cohort in one tick once the last required language becomes ready', async () => {
    const allReady = [
      candidate('zh-Hant', '2026-08-16T09:00:00.000Z'),
      candidate('ja', '2026-08-16T09:00:00.000Z'),
      candidate('en', '2026-08-16T09:30:00.000Z'),
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(allReady);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(allReady);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(5);
  });

  it('still counts a language that finished ready before the discovery anchor', async () => {
    // zh-Hant finished before the anchor, so the anchor-filtered candidate
    // list only surfaces ja/en -- but the episode must still be recognized as
    // fully ready once every localization is looked up without the anchor.
    const afterAnchor = [
      candidate('ja', '2026-08-16T09:00:00.000Z'),
      candidate('en', '2026-08-16T09:30:00.000Z'),
    ];
    const fullPicture = [
      candidate('zh-Hant', '2026-08-15T00:00:00.000Z'),
      ...afterAnchor,
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(afterAnchor);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(fullPicture);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.listSocialPublishCandidatesForEpisodes).toHaveBeenCalledWith([
      EPISODE_ID,
    ]);
    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(5);
    expect(
      mocks.enqueueSocialPublishJob.mock.calls.some(
        ([input]) =>
          input.platform === 'rednote' && input.languageCode === 'zh-Hant',
      ),
    ).toBe(true);
  });
});
