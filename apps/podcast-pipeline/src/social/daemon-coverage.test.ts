import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
  }),
  claimSocialPublishJob: vi.fn().mockResolvedValue(null),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn().mockResolvedValue(true),
  ensureSocialDaemonStart: vi
    .fn()
    .mockResolvedValue('2026-08-16T08:00:00.000Z'),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  getSocialQueueSnapshot: vi.fn(),
  getSocialStrategyById: vi.fn().mockResolvedValue(null),
  insertSocialAccountSnapshot: vi.fn().mockResolvedValue(undefined),
  latestSocialAccountSnapshots: vi.fn().mockResolvedValue({}),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn().mockResolvedValue(true),
  reconcileLocalPublishedJob: vi.fn().mockResolvedValue(false),
  refundSocialPublishJobAttempt: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
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
  refreshSocialStrategies: vi.fn().mockResolvedValue(undefined),
  buildSocialExperimentReports: vi.fn().mockReturnValue([]),
  getAllowedTelegramUserIds: vi.fn().mockReturnValue([]),
  sendTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/env.js', () => ({
  getAllowedTelegramUserIds: mocks.getAllowedTelegramUserIds,
}));

vi.mock('./daemon-store.js', () => ({
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
  insertSocialAccountSnapshot: mocks.insertSocialAccountSnapshot,
  latestSocialAccountSnapshots: mocks.latestSocialAccountSnapshots,
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

vi.mock('./release-cohort-store.js', () => ({
  alignPendingSocialReleaseCohorts: mocks.alignPendingSocialReleaseCohorts,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  claimReleaseCohortJobs: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes: mocks.listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
  updateSocialPostReviewStatus: mocks.updateSocialPostReviewStatus,
}));
vi.mock('../services/telegram.js', () => ({
  buildSocialReleaseFailedMessage: vi.fn().mockReturnValue('release failed'),
  sendTelegramNotification: mocks.sendTelegramNotification,
}));
vi.mock('./local-publish-recovery.js', () => ({
  reconcileLocalPublishedJob: mocks.reconcileLocalPublishedJob,
}));
vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
  prepareSocialBatchCopy: mocks.prepareSocialBatchCopy,
}));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));
vi.mock('./experiment-report.js', () => ({
  buildSocialExperimentReports: mocks.buildSocialExperimentReports,
}));

import {
  runSocialCatchUpOnce,
  runSocialDaemon,
  runSocialDaemonTick,
} from './daemon.js';
import {
  SocialCopyGenerationError,
  SocialReleaseFailureError,
} from './publish-error.js';

const NOW = new Date('2026-08-16T10:00:00.000Z');
const RELEASE_NOW = new Date('2026-09-02T00:00:00.000Z');
const RELEASE_CREATED_AT = '2026-09-01T00:00:00.000Z';

class StopDaemon extends Error {}

function publishJob(
  platform: 'rednote' | 'threads' | 'x' | 'youtube',
  languageCode: 'zh-Hant' | 'ja' | 'en',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `job-${platform}`,
    episode_id: 'episode-release',
    platform,
    language_code: languageCode,
    experiment_key: null,
    experiment_variant: null,
    status: 'processing',
    scheduled_at: RELEASE_NOW.toISOString(),
    next_attempt_at: RELEASE_NOW.toISOString(),
    strategy_version_id: null,
    social_post_id: null,
    attempt_count: 1,
    lease_owner: 'test-owner',
    lease_expires_at: '2026-09-02T01:00:00.000Z',
    last_error: null,
    completed_at: null,
    created_at: RELEASE_NOW.toISOString(),
    updated_at: RELEASE_NOW.toISOString(),
    ...overrides,
  };
}

function candidate(
  languageCode: 'zh-Hant' | 'ja' | 'en',
  overrides: Record<string, unknown> = {},
) {
  return {
    episode_id: 'episode-release',
    ready_at: '2026-09-01T12:00:00.000Z',
    language_code: languageCode,
    episode_created_at: RELEASE_CREATED_AT,
    ...overrides,
  };
}

function resetReleaseMocks(): void {
  mocks.alignPendingSocialReleaseCohorts.mockReset().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
  });
  mocks.claimSocialPublishJob.mockReset().mockResolvedValue(null);
  mocks.completeSocialPublishJob.mockReset().mockResolvedValue(undefined);
  mocks.enqueueSocialPublishJob.mockReset().mockResolvedValue(true);
  mocks.ensureSocialDaemonStart
    .mockReset()
    .mockResolvedValue('2026-08-16T08:00:00.000Z');
  mocks.failSocialPublishJob.mockReset().mockResolvedValue(undefined);
  mocks.getActiveSocialStrategies.mockReset().mockResolvedValue([]);
  mocks.getSocialQueueSnapshot.mockReset().mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByLane: {},
    waitingVideos: [],
  });
  mocks.insertSocialAccountSnapshot.mockReset().mockResolvedValue(undefined);
  mocks.latestSocialAccountSnapshots.mockReset().mockResolvedValue({});
  mocks.listPendingSocialPublishSchedules.mockReset().mockResolvedValue([]);
  mocks.listDueSocialPublishPlatforms.mockReset().mockResolvedValue([]);
  mocks.listLearningSocialPosts.mockReset().mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockReset().mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockReset().mockResolvedValue([]);
  mocks.listPartiallyPublishedCohorts.mockReset().mockResolvedValue([]);
  mocks.listSocialEpisodeLocalizationTitles.mockReset().mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockReset().mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes
    .mockReset()
    .mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockReset().mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockReset().mockResolvedValue(true);
  mocks.reconcileLocalPublishedJob.mockReset().mockResolvedValue(false);
  mocks.refundSocialPublishJobAttempt.mockReset().mockResolvedValue(undefined);
  mocks.releaseSocialPublishJobLease.mockReset().mockResolvedValue(undefined);
  mocks.listSocialPostIdentitiesByEpisodes.mockReset().mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockReset().mockResolvedValue([]);
  mocks.publishSocialBatch.mockReset().mockResolvedValue([]);
  mocks.prepareSocialBatchCopy.mockReset().mockResolvedValue({});
  mocks.refreshSocialStrategies.mockReset().mockResolvedValue(undefined);
  mocks.buildSocialExperimentReports.mockReset().mockReturnValue([]);
  mocks.getAllowedTelegramUserIds.mockReset().mockReturnValue([]);
  mocks.sendTelegramNotification.mockReset().mockResolvedValue(undefined);
}

describe('social daemon queue summary coverage', () => {
  it('formats the compact operator queue with media, backlog-style lists, upcoming items, and attention lanes', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 5,
      episodeQueue: [
        {
          episodeId: 'episode-1',
          title: 'First title',
          nextAt: '2026-08-16T09:00:00.000Z',
          laneCount: 2,
          lanes: [
            { platform: 'rednote', languageCode: 'zh-Hant' },
            { platform: 'x', languageCode: 'ja' },
          ],
        },
        {
          episodeId: 'episode-2',
          title: null,
          nextAt: '2026-08-16T11:30:00.000Z',
          laneCount: 1,
          lanes: [{ platform: 'threads', languageCode: 'zh-Hant' }],
        },
        {
          episodeId: 'episode-3',
          title: 'Third title',
          nextAt: '2026-08-16T12:00:00.000Z',
          laneCount: 1,
          lanes: [{ platform: 'youtube', languageCode: 'en' }],
        },
        {
          episodeId: 'episode-4',
          title: 'Fourth title',
          nextAt: '2026-08-16T13:00:00.000Z',
          laneCount: 1,
          lanes: [{ platform: 'x', languageCode: 'ja' }],
        },
      ],
      nextByLane: {
        'x|ja': {
          episodeId: 'episode-1',
          platform: 'x',
          languageCode: 'ja',
          title: 'Japanese lane',
          nextAt: '2026-08-16T09:00:00.000Z',
          status: 'failed',
          attemptCount: 2,
          attemptsExhausted: false,
          experiment: null,
        },
        'threads|zh-Hant': {
          episodeId: 'episode-2',
          platform: 'threads',
          languageCode: 'zh-Hant',
          title: null,
          nextAt: '2026-08-16T09:00:00.000Z',
          status: 'processing',
          attemptCount: 1,
          attemptsExhausted: false,
          experiment: null,
        },
        'rednote|zh-Hant': {
          episodeId: 'episode-3',
          platform: 'rednote',
          languageCode: 'zh-Hant',
          title: 'Blocked lane',
          nextAt: '2026-08-16T09:00:00.000Z',
          status: 'failed',
          attemptCount: 8,
          attemptsExhausted: true,
          experiment: null,
        },
        'youtube|en': {
          episodeId: 'episode-4',
          platform: 'youtube',
          languageCode: 'en',
          title: 'Fourth abnormal lane',
          nextAt: '2026-08-16T09:00:00.000Z',
          status: 'failed',
          attemptCount: 3,
          attemptsExhausted: false,
          experiment: null,
        },
      },
      waitingVideos: [
        {
          episodeId: 'wait-1',
          title: 'Waiting one',
          languageCodes: ['zh-Hant', 'ja'],
        },
        {
          episodeId: 'wait-2',
          title: null,
          languageCodes: ['en'],
        },
        {
          episodeId: 'wait-3',
          title: 'Waiting three',
          languageCodes: ['ja'],
        },
        {
          episodeId: 'wait-4',
          title: 'Waiting four',
          languageCodes: ['en'],
        },
      ],
    });
    const log = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        verbose: false,
        recordTick: vi.fn(),
        sleep: async () => {
          throw new StopDaemon('stop after one tick');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const text = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(text).toContain('Social Publisher');
    expect(text).toContain('Waiting for media · 4 articles');
    expect(text).toContain('+1 more');
    expect(text).toContain('Upcoming');
    expect(text).toContain('+1 more scheduled');
    expect(text).toContain('Attention · 4 lanes need review');
    expect(text).toContain('blocked after 8 attempts');
  });

  it('logs recovery after one transient network tick and suppresses an unchanged compact queue snapshot', async () => {
    mocks.listUnfinishedSocialPublishJobs
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue([]);
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 0,
      episodeQueue: [],
      nextByLane: {},
      waitingVideos: [],
    });
    const log = vi.fn();
    let sleeps = 0;

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        verbose: false,
        recordTick: vi.fn(),
        sleep: async () => {
          sleeps += 1;
          if (sleeps >= 2) throw new StopDaemon('stop after recovery');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const text = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(text).toContain('network unavailable');
    expect(text).toContain('network recovered after 1 failed tick');
    expect(text.match(/Queue · clear/g)).toHaveLength(1);
  });

  it('formats singular article queues, fallback ids, invalid dates, and abnormal lanes', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 1,
      episodeQueue: [
        {
          episodeId: 'episode-fallback-title',
          title: null,
          nextAt: 'not-a-date',
          laneCount: 1,
          lanes: [{ platform: 'x', languageCode: 'en' }],
        },
      ],
      nextByLane: {
        'x|en': {
          episodeId: 'episode-x',
          platform: 'x',
          languageCode: 'en',
          title:
            'A very long social article title that should be truncated for compact daemon logs',
          nextAt: '2026-08-16T10:30:00.000Z',
          status: 'failed',
          attemptCount: 2,
          attemptsExhausted: false,
          experiment: null,
        },
      },
      waitingVideos: [],
    });
    const log = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        recordTick: vi.fn(),
        sleep: async () => {
          throw new StopDaemon('stop after one tick');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const messages = log.mock.calls.map(([message]) => String(message));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('queue · 1 job'),
        expect.stringContaining('1 article'),
        expect.stringContaining('“episode #episode-fallback-title”'),
        expect.stringContaining('not-a-date (due now)'),
        expect.stringContaining('↳ 1 lane · 𝕏 x 🇺🇸 en'),
        expect.stringContaining('⚠️ [social-daemon]'),
        expect.stringContaining('in 30m; failed'),
      ]),
    );
    expect(messages.some((message) => message.includes('…'))).toBe(true);
  });

  it('deduplicates an unchanged compact snapshot and covers singular waiting plus exhausted-only attention', async () => {
    resetReleaseMocks();
    const calmSnapshot = {
      pendingCount: 1,
      episodeQueue: [
        {
          episodeId: 'episode-compact',
          title: 'Compact article',
          nextAt: '2026-08-16T10:30:00.000Z',
          laneCount: 1,
          lanes: [{ platform: 'x' as const, languageCode: 'ja' }],
        },
      ],
      nextByLane: {
        'x|ja': {
          episodeId: 'episode-compact',
          platform: 'x' as const,
          languageCode: 'ja',
          title: 'Compact article',
          nextAt: '2026-08-16T10:30:00.000Z',
          status: 'queued' as const,
          attemptCount: 1,
          attemptsExhausted: false,
          experiment: null,
        },
      },
      waitingVideos: [
        {
          episodeId: 'wait-one',
          title: 'Waiting one',
          languageCodes: ['en' as const],
        },
      ],
    };
    const attentionSnapshot = {
      ...calmSnapshot,
      nextByLane: {
        'x|ja': {
          ...calmSnapshot.nextByLane['x|ja'],
          attemptsExhausted: true,
        },
      },
    };
    mocks.getSocialQueueSnapshot
      .mockResolvedValueOnce(calmSnapshot)
      .mockResolvedValue(attentionSnapshot);
    const log = vi.fn();
    let sleeps = 0;

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        verbose: false,
        recordTick: vi.fn(),
        sleep: async () => {
          sleeps += 1;
          if (sleeps >= 3)
            throw new StopDaemon('stop after duplicate snapshot');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const text = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(text).toContain('Queue · 1 scheduled article · 1 lane');
    expect(text).toContain('Waiting for media · 1 article');
    expect(text).toContain('Attention · 1 lane needs review');
    expect(text.match(/Queue · 1 scheduled article · 1 lane/g)).toHaveLength(2);
  });

  it('formats verbose plural repair and queue details with same-platform lane ordering, experiments, and minute remainders', async () => {
    resetReleaseMocks();
    mocks.alignPendingSocialReleaseCohorts.mockResolvedValue({
      alignedLanes: 2,
      rescheduledEpisodes: 2,
    });
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 2,
      episodeQueue: [
        {
          episodeId: 'episode-verbose',
          title: 'Verbose article',
          nextAt: '2026-08-16T11:30:00.000Z',
          laneCount: 2,
          lanes: [
            { platform: 'x', languageCode: 'ja' },
            { platform: 'x', languageCode: 'en' },
          ],
        },
      ],
      nextByLane: {
        'x|ja': {
          episodeId: 'episode-verbose',
          platform: 'x',
          languageCode: 'ja',
          title: 'Verbose article',
          nextAt: '2026-08-16T11:30:00.000Z',
          status: 'failed',
          attemptCount: 2,
          attemptsExhausted: false,
          experiment: 'hook-v1:question',
        },
      },
      waitingVideos: [],
    });
    const log = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        verbose: true,
        recordTick: vi.fn(),
        sleep: async () => {
          throw new StopDaemon('stop after verbose snapshot');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const text = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(text).toContain('2 articles rescheduled');
    expect(text).toContain('↳ 2 lanes');
    expect(text).toContain('in 1h 30m');
    expect(text).toContain('[hook-v1:question]');
  });

  it('logs the evaluable telemetry-gapped experiment report variant', async () => {
    resetReleaseMocks();
    mocks.buildSocialExperimentReports.mockReturnValueOnce([
      {
        experimentKey: 'coverage-experiment',
        evaluable: true,
        durationDays: 2,
        telemetryComplete: false,
        arms: [
          {
            variant: 'ja',
            samples: 2,
            medianReach: 100,
            medianEngagementRate: 0.1,
            medianProfileVisitRate: 0.02,
          },
        ],
      },
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
      refreshStrategy: true,
      verbose: true,
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'coverage-experiment · evaluable · 2.0d · ⚠️ telemetry gapped',
      ),
    );
  });
});

describe('social daemon release edge coverage', () => {
  it('keeps one-shot catch-up walking reconciled rows and reports a held next cohort even when hold persistence fails', async () => {
    resetReleaseMocks();
    const reconciled = publishJob('x', 'ja', { id: 'job-reconciled' });
    const held = publishJob('rednote', 'zh-Hant', { id: 'job-held' });
    mocks.claimSocialPublishJob
      .mockResolvedValueOnce(reconciled)
      .mockResolvedValueOnce(held);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([{ id: 'post-live', post_url: null }])
      .mockResolvedValueOnce([]);
    mocks.failSocialPublishJob.mockRejectedValueOnce(
      new Error('hold write failed'),
    );
    const log = vi.fn();

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW, log }),
    ).resolves.toBe('held');

    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-reconciled',
        socialPostId: 'post-live',
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('failed to persist release hold'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('article held by release safety checks'),
    );
  });

  it('ignores an anchored episode whose ready localizations disappeared before the episode-wide reload', async () => {
    resetReleaseMocks();
    mocks.listSocialPublishCandidates.mockResolvedValue([candidate('zh-Hant')]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);

    await runSocialDaemonTick({
      now: RELEASE_NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
  });

  it('keeps an existing durable cohort held when its required language is missing', async () => {
    resetReleaseMocks();
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: 'episode-release',
        platform: 'x',
        language_code: 'ja',
        scheduled_at: RELEASE_NOW.toISOString(),
        completed_at: null,
        status: 'queued',
      },
    ]);
    mocks.listSocialPublishCandidates.mockResolvedValue([candidate('zh-Hant')]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('zh-Hant'),
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: RELEASE_NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('cohort not release-ready'),
    );
    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
  });

  it('leaves an existing durable cohort alone when its ready timestamp is invalid', async () => {
    resetReleaseMocks();
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: 'episode-release',
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: RELEASE_NOW.toISOString(),
        completed_at: null,
        status: 'queued',
      },
    ]);
    const invalid = candidate('zh-Hant', { ready_at: 'not-a-date' });
    mocks.listSocialPublishCandidates.mockResolvedValue([invalid]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([invalid]);

    await runSocialDaemonTick({
      now: RELEASE_NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
  });

  it('does not expand a partial durable cohort until every lane language needed by the current cohort is ready', async () => {
    resetReleaseMocks();
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: 'episode-release',
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: RELEASE_NOW.toISOString(),
        completed_at: null,
        status: 'queued',
      },
    ]);
    mocks.listSocialPublishCandidates.mockResolvedValue([candidate('zh-Hant')]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('zh-Hant'),
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: RELEASE_NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('🇯🇵 ja'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('🇺🇸 en'));
    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
  });

  it('reports a one-article deferred backlog after all eight scheduling days are full', async () => {
    resetReleaseMocks();
    const dayStart = Date.parse('2026-09-01T15:00:00.000Z');
    const slotOffsets = [
      9.5 * 60 * 60_000,
      12 * 60 * 60_000,
      16 * 60 * 60_000,
      21 * 60 * 60_000,
    ];
    const schedules = Array.from({ length: 8 }).flatMap((_, day) =>
      slotOffsets.map((offset, slot) => ({
        episode_id: `scheduled-${day}-${slot}`,
        platform: 'x',
        language_code: 'ja',
        scheduled_at: new Date(
          dayStart + day * 24 * 60 * 60_000 + offset,
        ).toISOString(),
        completed_at: null,
        status: 'queued',
      })),
    );
    const ready = [candidate('zh-Hant'), candidate('ja'), candidate('en')];
    mocks.listPendingSocialPublishSchedules.mockResolvedValue(schedules);
    mocks.listSocialPublishCandidates.mockResolvedValue(ready);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(ready);
    mocks.alignPendingSocialReleaseCohorts.mockResolvedValue({
      alignedLanes: 1,
      rescheduledEpisodes: 1,
    });
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 1,
      episodeQueue: [],
      nextByLane: {
        'youtube|fr': {
          episodeId: 'episode-release',
          platform: 'youtube',
          languageCode: 'fr',
          title: null,
          nextAt: RELEASE_NOW.toISOString(),
          status: 'failed',
          attemptCount: 1,
          attemptsExhausted: false,
          experiment: null,
        },
      },
      waitingVideos: [],
    });
    const log = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => RELEASE_NOW,
        log,
        verbose: false,
        recordTick: vi.fn(),
        sleep: async () => {
          throw new StopDaemon('stop after backlog snapshot');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    await runSocialDaemonTick({
      now: RELEASE_NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
      verbose: true,
    });

    const text = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(text).toContain(
      'Queue repair · 1 article rescheduled · 1 lane aligned',
    );
    expect(text).toContain(
      'Backlog · 1 article beyond the 8-day scheduling horizon',
    );
    expect(text).toContain('no article slot inside the 8-day horizon');
    expect(text).toContain('▶️ YouTube');
    expect(text).toContain('🌐 fr');

    const secondEpisodeReady = ready.map((row) => ({
      ...row,
      episode_id: 'episode-release-2',
    }));
    mocks.listSocialPublishCandidates.mockResolvedValue([
      ...ready,
      ...secondEpisodeReady,
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      ...ready,
      ...secondEpisodeReady,
    ]);
    const pluralLog = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => RELEASE_NOW,
        log: pluralLog,
        verbose: false,
        recordTick: vi.fn(),
        sleep: async () => {
          throw new StopDaemon('stop after plural backlog snapshot');
        },
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    expect(
      pluralLog.mock.calls.map(([message]) => String(message)).join('\n'),
    ).toContain('Backlog · 2 articles beyond the 8-day scheduling horizon');
  });

  it('logs publish warnings, notifies Telegram, and completes a confirmed social post', async () => {
    resetReleaseMocks();
    const job = publishJob('youtube', 'en');
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-youtube', post_url: null }]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('en'),
    ]);
    mocks.publishSocialBatch.mockResolvedValue([
      {
        platform: 'youtube',
        status: 'published',
        url: null,
        warnings: ['platform accepted the upload with a warning'],
      },
    ]);
    mocks.getAllowedTelegramUserIds.mockReturnValue(['chat-1']);
    const log = vi.fn();

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW, log, verbose: false }),
    ).resolves.toBe('released');

    expect(mocks.sendTelegramNotification).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('platform accepted the upload with a warning'),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({ socialPostId: 'post-youtube' }),
    );
  });

  it('keeps publish warnings non-fatal when no Telegram recipient is configured and preserves historical experiment semantics', async () => {
    resetReleaseMocks();
    const job = publishJob('x', 'ja', {
      experiment_key: 'x-language-v1',
      experiment_variant: 'ja',
    });
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'post-x', post_url: null }]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('ja'),
    ]);
    mocks.publishSocialBatch.mockResolvedValue([
      {
        platform: 'x',
        status: 'published',
        url: null,
        warnings: ['warning without notification recipient'],
      },
    ]);
    mocks.getAllowedTelegramUserIds.mockReturnValue([]);

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW, verbose: false }),
    ).resolves.toBe('released');

    expect(mocks.sendTelegramNotification).not.toHaveBeenCalled();
    expect(mocks.prepareSocialBatchCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: 'episode-release',
        languageCode: 'ja',
      }),
    );
  });

  it('holds a cohort on a long copy-generation rejection and ignores durable schedules from other episodes', async () => {
    resetReleaseMocks();
    const job = publishJob('rednote', 'zh-Hant');
    const reason = `unsafe copy ${'x'.repeat(240)}`;
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: 'unrelated-episode',
        platform: 'youtube',
        language_code: 'en',
        scheduled_at: RELEASE_NOW.toISOString(),
        completed_at: null,
        status: 'queued',
      },
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('zh-Hant'),
    ]);
    mocks.prepareSocialBatchCopy.mockRejectedValue(
      new SocialCopyGenerationError({
        episodeId: job.episode_id,
        languageCode: 'zh-Hant',
        attempts: 3,
        reason,
        cause: new Error(reason),
      }),
    );
    const log = vi.fn();

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW, log }),
    ).resolves.toBe('held');

    const holdLog = log.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('copy generation failed'));
    expect(holdLog).toContain('…');
    expect(holdLog).not.toContain(reason);
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        error: expect.stringContaining(
          'social copy generation failed after 3 attempts',
        ),
      }),
    );
  });

  it('fails closed when publish batch omits the claimed platform outcome', async () => {
    resetReleaseMocks();
    const job = publishJob('x', 'ja');
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('ja'),
    ]);
    mocks.publishSocialBatch.mockResolvedValue([]);

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW }),
    ).rejects.toBeInstanceOf(SocialReleaseFailureError);
  });

  it('accepts durable local evidence for a skipped publish outcome without requiring a social_posts row', async () => {
    resetReleaseMocks();
    const job = publishJob('x', 'ja');
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('ja'),
    ]);
    mocks.reconcileLocalPublishedJob
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'skipped', url: null },
    ]);

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW }),
    ).resolves.toBe('released');

    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
  });

  it('logs an attempt-refund failure without hiding the original release failure', async () => {
    resetReleaseMocks();
    const job = publishJob('youtube', 'en');
    const releaseFailure = new SocialReleaseFailureError({
      episodeId: job.episode_id,
      languageCode: 'en',
      platform: 'youtube',
      phase: 'transport',
      cause: new Error('transport outcome unknown'),
      untouchedLanes: ['youtube'],
    });
    mocks.claimSocialPublishJob.mockResolvedValueOnce(job);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      candidate('en'),
    ]);
    mocks.publishSocialBatch.mockRejectedValue(releaseFailure);
    mocks.refundSocialPublishJobAttempt.mockRejectedValue(
      new Error('refund write failed'),
    );
    const log = vi.fn();

    await expect(
      runSocialCatchUpOnce({ now: () => RELEASE_NOW, log }),
    ).rejects.toBe(releaseFailure);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('attempt refund failed'),
    );
  });
});
