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

describe('social daemon loop coverage', () => {
  it('logs a complete idle tick, refreshes strategy, and sleeps for one minute', async () => {
    const log = vi.fn();
    const sleep = vi.fn(async (milliseconds: number) => {
      expect(milliseconds).toBe(60_000);
      throw new StopDaemon('stop after one tick');
    });

    await expect(
      runSocialDaemon({
        now: () => NOW,
        log,
        sleep,
      }),
    ).rejects.toBeInstanceOf(StopDaemon);

    const messages = log.mock.calls.map(([message]) => String(message));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'discovery begins at 2026-08-16T08:00:00.000Z',
        ),
        '[social-daemon] checking discovery, publishing, metrics, and strategy...',
        '[social-daemon] check complete; next check in 60s.',
      ]),
    );
    expect(mocks.refreshSocialStrategies).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
