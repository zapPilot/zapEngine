import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn().mockResolvedValue(true),
  releaseSocialPublishJobLease: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  publishSocialBatch: vi.fn(),
  prepareSocialBatchCopy: vi.fn().mockResolvedValue({}),
  createMetricCollectors: vi.fn().mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  }),
  refreshSocialStrategies: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./daemon-store.js', () => ({
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
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
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
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

import { runSocialDaemon } from './daemon.js';

const NOW = new Date('2026-08-16T10:00:00.000Z');

class StopDaemon extends Error {}

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
});
