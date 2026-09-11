import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
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
  refundSocialPublishJobAttempt: vi.fn().mockResolvedValue(undefined),
  releaseSocialPublishJobLease: vi.fn().mockResolvedValue(undefined),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  publishSocialBatch: vi.fn(),
  prepareSocialBatchCopy: vi.fn().mockResolvedValue({}),
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
  getExperimentAssignment: vi.fn(),
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
  refundSocialPublishJobAttempt: mocks.refundSocialPublishJobAttempt,
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
  prepareSocialBatchCopy: mocks.prepareSocialBatchCopy,
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
  getExperimentAssignment: mocks.getExperimentAssignment,
  getOrCreateExperimentAssignment: mocks.getOrCreateExperimentAssignment,
}));

import { runSocialDaemonTick } from './daemon.js';
import { SocialCopyGenerationError } from './publish-error.js';

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

function claimedLane(
  episodeId: string,
  platform: string,
  language_code: 'zh-Hant' | 'ja' | 'en',
  id: string,
) {
  return {
    id,
    episode_id: episodeId,
    platform,
    language_code,
    experiment_key: null,
    experiment_variant: null,
    status: 'processing' as const,
    scheduled_at: '2026-09-02T01:00:00.000Z',
    next_attempt_at: '2026-09-02T01:00:00.000Z',
    strategy_version_id: null,
    social_post_id: null,
    attempt_count: 1,
    lease_owner: 'owner',
    lease_expires_at: '2026-09-02T02:00:00.000Z',
    last_error: null,
    completed_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

function claimedCohort(episodeId: string) {
  return [
    claimedLane(episodeId, 'rednote', 'zh-Hant', `${episodeId}-rednote`),
    claimedLane(episodeId, 'x', 'ja', `${episodeId}-x`),
    claimedLane(episodeId, 'youtube', 'en', `${episodeId}-youtube`),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepareSocialBatchCopy.mockResolvedValue({});
  mocks.alignPendingSocialReleaseCohorts.mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
  });
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.claimReleaseCohortJobs.mockResolvedValue([]);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.listSocialEpisodeLocalizationTitles.mockResolvedValue([]);
  mocks.getExperimentAssignment.mockResolvedValue(null);
  mocks.getOrCreateExperimentAssignment.mockImplementation(
    ({
      experimentKey,
      episodeId,
      variants,
    }: {
      experimentKey: string;
      episodeId: string;
      variants?: readonly [string, ...string[]];
    }) =>
      Promise.resolve({
        experiment_key: experimentKey,
        episode_id: episodeId,
        variant: variants?.[0] ?? 'en',
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

  it('holds the whole article when a claimed lane lost its video before transport', async () => {
    mocks.claimReleaseCohortJobs.mockResolvedValue(claimedCohort(ARTICLE_A));
    // A force re-plan between enqueue and this tick requeued the ja render, so
    // its completed video is gone from the readiness view.
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate(ARTICLE_A, 'zh-Hant'),
      candidate(ARTICLE_A, 'en'),
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(3);
    for (const [input] of mocks.failSocialPublishJob.mock.calls) {
      expect(input.error).toContain('Release held');
      expect(input.error).toContain('ja');
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining('release held'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ja'));
  });

  it('requires every durable lane language, not only the lanes claimed this tick', async () => {
    // Only the zh-Hant lane is due, but the episode's durable cohort also owns
    // a ja lane whose video is missing: publishing zh-Hant now would ship a
    // permanently partial article.
    mocks.claimReleaseCohortJobs.mockResolvedValue([
      claimedLane(ARTICLE_A, 'rednote', 'zh-Hant', 'job-zh'),
    ]);
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: ARTICLE_A,
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: '2026-09-02T01:00:00.000Z',
        completed_at: null,
        status: 'processing',
      },
      {
        episode_id: ARTICLE_A,
        platform: 'x',
        language_code: 'ja',
        scheduled_at: '2026-09-02T01:00:00.000Z',
        completed_at: null,
        status: 'queued',
      },
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate(ARTICLE_A, 'zh-Hant'),
    ]);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-zh' }),
    );
  });

  it('holds only the episode that lost media and still publishes the others', async () => {
    mocks.claimReleaseCohortJobs.mockResolvedValue([
      ...claimedCohort(ARTICLE_A),
      claimedLane(ARTICLE_B, 'rednote', 'zh-Hant', 'b-rednote'),
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate(ARTICLE_A, 'zh-Hant'),
      candidate(ARTICLE_A, 'en'),
      candidate(ARTICLE_B, 'zh-Hant'),
    ]);
    // No social_posts row exists until transport actually runs, so
    // reconciliation cannot mistake an unpublished lane for a published one.
    let transportRan = false;
    mocks.publishSocialBatch.mockImplementation(async () => {
      transportRan = true;
      return [
        { platform: 'rednote', status: 'published', url: 'https://xhs/1' },
      ];
    });
    mocks.listSocialPostsByEpisode.mockImplementation(async () =>
      transportRan ? [{ id: 'post-b', post_url: 'https://xhs/1' }] : [],
    );

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.publishSocialBatch).toHaveBeenCalledOnce();
    expect(mocks.publishSocialBatch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: ARTICLE_B }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'b-rednote' }),
    );
    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(3);
    for (const [input] of mocks.failSocialPublishJob.mock.calls) {
      expect(input.jobId).toContain(ARTICLE_A);
    }
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

  it('does not reshape an ambiguous partial legacy cohort created after activation', async () => {
    const legacyScheduledAt = '2026-09-02T03:00:00.000Z';
    mocks.getExperimentAssignment.mockResolvedValue({
      experiment_key: 'x-language-v1',
      episode_id: ARTICLE_A,
      variant: 'en',
      assigned_at: CREATED_AT,
    });
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: ARTICLE_A,
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: legacyScheduledAt,
        completed_at: null,
        status: 'queued',
      },
      {
        episode_id: ARTICLE_A,
        platform: 'youtube',
        language_code: 'en',
        scheduled_at: legacyScheduledAt,
        completed_at: null,
        status: 'queued',
      },
    ]);
    const candidates = readyEpisode(ARTICLE_A);
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    const enqueued = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => `${input.platform}|${input.languageCode}`,
    );
    expect(enqueued).not.toContain('threads|zh-Hant');
    expect(enqueued).not.toContain('x|ja');
    expect(enqueued).toEqual(
      expect.arrayContaining([
        'rednote|zh-Hant',
        'threads|ja',
        'x|en',
        'youtube|en',
      ]),
    );
  });

  it('completes an interrupted v2 enqueue without reshaping', async () => {
    const scheduledAt = '2026-09-02T03:00:00.000Z';
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: ARTICLE_A,
        platform: 'x',
        language_code: 'ja',
        scheduled_at: scheduledAt,
        completed_at: null,
        status: 'queued',
        experiment_key: 'x-language-v2',
        experiment_variant: 'ja',
      },
      {
        episode_id: ARTICLE_A,
        platform: 'threads',
        language_code: 'zh-Hant',
        scheduled_at: scheduledAt,
        completed_at: null,
        status: 'queued',
        experiment_key: 'threads-language-v1',
        experiment_variant: 'zh-Hant',
      },
    ]);
    const candidates = readyEpisode(ARTICLE_A);
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    const enqueued = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => `${input.platform}|${input.languageCode}`,
    );
    expect(enqueued).toEqual(
      expect.arrayContaining(['youtube|en', 'rednote|zh-Hant']),
    );
    expect(enqueued).not.toContain('threads|ja');
    expect(enqueued).not.toContain('x|en');
  });

  it('holds the whole article when one language cannot produce copy', async () => {
    // zh-Hant is claimed last on purpose: the red-line judge only runs on it,
    // and generating copy inside the publish loop would have shipped ja and en
    // before the rejection was even known.
    mocks.claimReleaseCohortJobs.mockResolvedValue([
      claimedLane(ARTICLE_A, 'x', 'ja', `${ARTICLE_A}-x`),
      claimedLane(ARTICLE_A, 'youtube', 'en', `${ARTICLE_A}-youtube`),
      claimedLane(ARTICLE_A, 'rednote', 'zh-Hant', `${ARTICLE_A}-rednote`),
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(
      readyEpisode(ARTICLE_A),
    );
    mocks.prepareSocialBatchCopy.mockImplementation(
      async ({ languageCode }: { languageCode: string }) => {
        if (languageCode !== 'zh-Hant') return {};
        throw new SocialCopyGenerationError({
          episodeId: ARTICLE_A,
          languageCode: 'zh-Hant',
          attempts: 3,
          reason:
            'Rednote copy breaks investment-direction red lines (asset_allocation_advice)',
          cause: undefined,
        });
      },
    );
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).toHaveBeenCalledTimes(3);
    for (const [input] of mocks.failSocialPublishJob.mock.calls) {
      expect(input.error).toContain('Release held:');
      expect(input.error).toContain('zh-Hant social copy generation failed');
      expect(input.error).toContain('asset_allocation_advice');
    }
    // A hold spends the attempt and serves retry backoff; handing the lease
    // back instead is what made this an unbounded restart loop.
    expect(mocks.releaseSocialPublishJobLease).not.toHaveBeenCalled();
    expect(mocks.refundSocialPublishJobAttempt).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('release held · copy generation failed'),
    );
  });

  it('stops generating copy for the rest of a held article', async () => {
    mocks.claimReleaseCohortJobs.mockResolvedValue(claimedCohort(ARTICLE_A));
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(
      readyEpisode(ARTICLE_A),
    );
    mocks.prepareSocialBatchCopy.mockRejectedValue(
      new SocialCopyGenerationError({
        episodeId: ARTICLE_A,
        languageCode: 'zh-Hant',
        attempts: 3,
        reason: 'Rednote copy breaks investment-direction red lines',
        cause: undefined,
      }),
    );

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    // zh-Hant is claimed first here, so the ja and en lanes of the same held
    // article must not pay for an LLM call they can never use.
    expect(mocks.prepareSocialBatchCopy).toHaveBeenCalledTimes(1);
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });
});
