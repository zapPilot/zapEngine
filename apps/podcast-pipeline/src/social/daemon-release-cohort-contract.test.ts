import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  claimReleaseCohortJobs: vi.fn().mockResolvedValue([]),
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
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
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

vi.mock('./release-cohort-store.js', () => ({
  alignPendingSocialReleaseCohorts: mocks.alignPendingSocialReleaseCohorts,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  claimReleaseCohortJobs: mocks.claimReleaseCohortJobs,
}));

vi.mock('./daemon-store.js', () => ({
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listDueSocialPublishPlatforms: mocks.listDueSocialPublishPlatforms,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialEpisodeLocalizationTitles:
    mocks.listSocialEpisodeLocalizationTitles,
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

const NOW = new Date('2026-09-02T01:00:00.000Z'); // 10:00 JST
const FIRST_STARTED_AT = '2026-09-01T00:00:00.000Z';
const ARTICLE_A = '123e4567-e89b-42d3-a456-426614174000';
const ARTICLE_B = '123e4567-e89b-42d3-a456-426614174111';
const ARTICLE_C = '123e4567-e89b-42d3-a456-426614174222';
const ARTICLE_D = '123e4567-e89b-42d3-a456-426614174333';
const CREATED_AT = '2026-09-02T00:10:00.000Z';

function candidate(episodeId: string, language_code: 'zh-Hant' | 'ja' | 'en') {
  return {
    episode_id: episodeId,
    ready_at: '2026-09-02T00:30:00.000Z',
    language_code,
    episode_created_at: CREATED_AT,
  };
}

function readyEpisode(episodeId: string) {
  return (['zh-Hant', 'ja', 'en'] as const).map((language) =>
    candidate(episodeId, language),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alignPendingSocialReleaseCohorts.mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  });
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.claimReleaseCohortJobs.mockResolvedValue([]);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.listSocialEpisodeLocalizationTitles.mockResolvedValue([]);
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
        variant: 'en',
        assigned_at: CREATED_AT,
      }),
  );
});

describe('NON-NEGOTIABLE episode release cohort contract', () => {
  it('enqueues the slot-balanced language profile at exactly one timestamp', async () => {
    const candidates = readyEpisode(ARTICLE_A);
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    const lanes = mocks.enqueueSocialPublishJob.mock.calls.map(([input]) => ({
      platform: input.platform,
      language: input.languageCode,
      experimentKey: input.experimentKey,
      experimentVariant: input.experimentVariant,
      scheduledAt: input.scheduledAt,
    }));
    // At 10:00 JST the next slot is 12:00. Day 1 / slot 2 is profile B:
    // X=ja, Threads=zh-Hant, YouTube=en; Rednote remains zh-Hant.
    expect(lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'rednote', language: 'zh-Hant' }),
        expect.objectContaining({
          platform: 'threads',
          language: 'zh-Hant',
          experimentKey: 'threads-language-v1',
          experimentVariant: 'zh-Hant',
        }),
        expect.objectContaining({
          platform: 'x',
          language: 'ja',
          experimentKey: 'x-language-v2',
          experimentVariant: 'ja',
        }),
        expect.objectContaining({
          platform: 'youtube',
          language: 'en',
          experimentKey: 'youtube-language-v1',
          experimentVariant: 'en',
        }),
      ]),
    );
    expect(lanes).toHaveLength(4);
    expect(new Set(lanes.map((lane) => lane.language))).toEqual(
      new Set(['zh-Hant', 'ja', 'en']),
    );
    expect(new Set(lanes.map((lane) => lane.scheduledAt)).size).toBe(1);
  });

  it('enqueues zero jobs until every required language media is ready', async () => {
    const incomplete = [
      candidate(ARTICLE_A, 'zh-Hant'),
      candidate(ARTICLE_A, 'ja'),
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(incomplete);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(incomplete);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
  });

  it('gives each article its own slot and rolls over once the day is full', async () => {
    const candidates = [
      ...readyEpisode(ARTICLE_A),
      ...readyEpisode(ARTICLE_B),
      ...readyEpisode(ARTICLE_C),
      ...readyEpisode(ARTICLE_D),
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    const byEpisode = new Map<string, Set<string>>();
    for (const [input] of mocks.enqueueSocialPublishJob.mock.calls) {
      const set = byEpisode.get(input.episodeId) ?? new Set<string>();
      set.add(input.scheduledAt);
      byEpisode.set(input.episodeId, set);
    }
    const slotOf = (episodeId: string) => {
      const times = byEpisode.get(episodeId) ?? new Set<string>();
      expect(times.size).toBe(1);
      return [...times][0];
    };

    // NOW is 10:00 JST, so 09-02 has only its 12:00 and 16:00 slots left; the
    // third and fourth articles roll into the next JST day rather than sharing.
    expect(slotOf(ARTICLE_A)).toBe('2026-09-02T03:00:00.000Z');
    expect(slotOf(ARTICLE_B)).toBe('2026-09-02T07:00:00.000Z');
    expect(slotOf(ARTICLE_C)).toBe('2026-09-03T00:30:00.000Z');
    expect(slotOf(ARTICLE_D)).toBe('2026-09-03T03:00:00.000Z');
  });

  it('fences fresh episodes behind a partial publish recovery cohort', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([ARTICLE_A]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.claimReleaseCohortJobs).toHaveBeenCalledTimes(1);
    expect(mocks.claimReleaseCohortJobs).toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
      episodeId: ARTICLE_A,
    });
    expect(mocks.claimReleaseCohortJobs).not.toHaveBeenCalledWith({
      owner: expect.any(String),
      now: NOW,
    });
  });

  it('says so when a partial release holds the queue with nothing due', async () => {
    mocks.listPartiallyPublishedCohorts.mockResolvedValue([ARTICLE_A]);
    mocks.claimReleaseCohortJobs.mockResolvedValue([]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('partial release holds the queue'),
    );
  });

  it('repairs the durable queue before discovering any new article', async () => {
    const candidates = readyEpisode(ARTICLE_A);
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(
      mocks.alignPendingSocialReleaseCohorts.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.listSocialPublishCandidates.mock.invocationCallOrder[0]!,
    );
  });

  it('uses the zh-Hant title as the article title even when another lane is discovered first', async () => {
    const candidates = [
      candidate(ARTICLE_A, 'ja'),
      candidate(ARTICLE_A, 'en'),
      candidate(ARTICLE_A, 'zh-Hant'),
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
    mocks.listSocialEpisodeLocalizationTitles.mockResolvedValue([
      { episode_id: ARTICLE_A, language_code: 'ja', title: '日本語タイトル' },
      { episode_id: ARTICLE_A, language_code: 'zh-Hant', title: '繁中標題' },
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('“繁中標題”'));
  });
});
