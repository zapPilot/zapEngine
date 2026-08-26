import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimSocialPublishJob: vi.fn().mockResolvedValue(null),
  alignPendingSocialPublishSchedules: vi.fn().mockResolvedValue(0),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn().mockResolvedValue(true),
  ensureSocialDaemonStart: vi
    .fn()
    .mockResolvedValue('2026-08-16T08:00:00.000Z'),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  getSocialQueueSnapshot: vi.fn(),
  getSocialStrategyById: vi.fn().mockResolvedValue(null),
  latestScheduledSocialJobs: vi.fn().mockResolvedValue({}),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn().mockResolvedValue(true),
  releaseSocialPublishJobLease: vi.fn(),
  skipOverdueSocialPublishJobs: vi.fn().mockResolvedValue(0),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn().mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  }),
  refreshSocialStrategies: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishBatch: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
  alignPendingSocialPublishSchedules: mocks.alignPendingSocialPublishSchedules,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
  latestPendingSocialPublishSchedule: async () => {
    const schedules = (await mocks.latestScheduledSocialJobs()) as Record<
      string,
      string
    >;
    const values = Object.values(schedules).sort();
    return values.at(-1) ?? null;
  },
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
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

import { runSocialDaemon } from './daemon.js';

const NOW = new Date('2026-08-16T10:00:00.000Z');

class StopDaemon extends Error {}

describe('social daemon queue summary coverage', () => {
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
      nextByPlatform: {
        x: {
          episodeId: 'episode-x',
          platform: 'x',
          languageCode: 'en',
          title:
            'A very long social article title that should be truncated for compact daemon logs',
          nextAt: '2026-08-16T10:30:00.000Z',
          status: 'failed',
          attemptCount: 2,
          attemptsExhausted: false,
        },
      },
    });
    const log = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
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
