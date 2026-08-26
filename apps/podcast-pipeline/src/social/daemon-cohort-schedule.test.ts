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
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
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
  mocks.ensureSocialDaemonStart.mockResolvedValue('2026-08-16T08:00:00.000Z');
});

describe('release cohort scheduling', () => {
  it('gives every lane of one episode the exact same scheduled_at, regardless of language', async () => {
    const candidates = (['zh-Hant', 'ja', 'en'] as const).map(
      (language_code) => ({
        episode_id: EPISODE_ID,
        ready_at: '2026-08-16T09:00:00.000Z',
        language_code,
        episode_created_at: EPISODE_CREATED_AT,
      }),
    );
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    const scheduledTimes = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => input.scheduledAt,
    );
    // rednote/zh-Hant, threads/ja, x/ja (exclusive assignment), youtube/en, youtube/ja.
    expect(scheduledTimes).toHaveLength(5);
    expect(new Set(scheduledTimes).size).toBe(1);

    const lanes = mocks.enqueueSocialPublishJob.mock.calls.map(([input]) => ({
      platform: input.platform,
      languageCode: input.languageCode,
    }));
    expect(lanes).toEqual(
      expect.arrayContaining([
        { platform: 'rednote', languageCode: 'zh-Hant' },
        { platform: 'threads', languageCode: 'ja' },
        { platform: 'x', languageCode: 'ja' },
        { platform: 'youtube', languageCode: 'en' },
        { platform: 'youtube', languageCode: 'ja' },
      ]),
    );
  });

  it('reuses an already-enqueued cohort slot instead of recomputing a new one', async () => {
    const candidates = (['zh-Hant', 'ja', 'en'] as const).map(
      (language_code) => ({
        episode_id: EPISODE_ID,
        ready_at: '2026-08-16T09:00:00.000Z',
        language_code,
        episode_created_at: EPISODE_CREATED_AT,
      }),
    );
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
    const existingSlot = '2026-08-17T00:30:00.000Z';
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: EPISODE_ID,
        language_code: 'zh-Hant',
        scheduled_at: existingSlot,
        completed_at: null,
        status: 'queued',
      },
    ]);
    // Only rednote/zh-Hant was inserted by a previous, interrupted tick; the
    // rest of the cohort still needs to be enqueued this tick.
    mocks.enqueueSocialPublishJob.mockImplementation(
      async (input) => input.platform !== 'rednote',
    );

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    const scheduledTimes = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => input.scheduledAt,
    );
    expect(scheduledTimes.every((value) => value === existingSlot)).toBe(true);
  });
});
