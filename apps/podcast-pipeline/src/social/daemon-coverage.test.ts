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
  latestScheduledSocialJobs: vi.fn().mockResolvedValue({}),
  listDueMetricPosts: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  insertSocialPostMetric: vi.fn(),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  runSocialCli: vi.fn(),
  createMetricCollectors: vi.fn().mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  }),
  refreshSocialStrategies: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishJob: mocks.claimSocialPublishJob,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
  latestScheduledSocialJobs: mocks.latestScheduledSocialJobs,
  listDueMetricPosts: mocks.listDueMetricPosts,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
}));
vi.mock('./cli.js', () => ({ runSocialCli: mocks.runSocialCli }));
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
  it('formats singular queues, fallback titles, invalid dates, and near/far publish times', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 1,
      episodeQueue: [
        {
          episodeId: 'episode-fallback-title',
          title: null,
          nextAt: 'not-a-date',
        },
      ],
      nextByPlatform: {
        x: {
          episodeId: 'episode-x',
          title:
            'A very long social article title that should be truncated for compact daemon logs',
          nextAt: '2026-08-16T10:30:00.000Z',
          status: 'queued',
        },
        threads: {
          episodeId: 'episode-threads',
          title: '',
          nextAt: '2026-08-16T12:00:00.000Z',
          status: 'retrying',
        },
        rednote: {
          episodeId: 'episode-rednote',
          title: 'Short title',
          nextAt: '2026-08-16T12:05:00.000Z',
          status: 'queued',
        },
        youtube: {
          episodeId: 'episode-youtube',
          title: 'Already due',
          nextAt: 'invalid',
          status: 'queued',
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
        expect.stringContaining('1 publish job pending across 1 article.'),
        expect.stringContaining('“episode-fallback-title”'),
        expect.stringContaining('first publish not-a-date (due now)'),
        expect.stringContaining('in 30m'),
        expect.stringContaining('in 2h'),
        expect.stringContaining('in 2h 5m'),
        expect.stringContaining('at invalid (due now'),
      ]),
    );
    expect(messages.some((message) => message.includes('…'))).toBe(true);
  });
});
