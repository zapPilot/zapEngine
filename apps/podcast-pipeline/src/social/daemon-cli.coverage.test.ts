import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  recoverLeases: vi.fn(),
  reportHistory: vi.fn(),
  ensureStart: vi.fn(),
  listUnfinished: vi.fn(),
  listDuePlatforms: vi.fn(),
  listCandidates: vi.fn(),
  listCandidateEpisodes: vi.fn(),
  listPendingSchedules: vi.fn(),
  queueSnapshot: vi.fn(),
  activeStrategies: vi.fn(),
  claimCohort: vi.fn(),
  capture: vi.fn(),
  flush: vi.fn(),
  send: vi.fn(),
  lockRelease: vi.fn(),
}));

vi.mock('../observability/sentry-init.js', () => ({}));
vi.mock('../lib/is-main-module.js', () => ({
  isMainModule: () => true,
}));
vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
  getAllowedTelegramUserIds: () => [],
}));
vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capture,
  flushSentry: mocks.flush,
}));
vi.mock('./daemon-lock.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daemon-lock.js')>()),
  acquireSocialDaemonLock: mocks.acquire,
}));
vi.mock('./daemon-lease-recovery.js', () => ({
  recoverOrphanedSocialLeases: mocks.recoverLeases,
}));
vi.mock('./local-publish-history.js', () => ({
  reportLocalPublicationHistory: mocks.reportHistory,
}));
vi.mock('./daemon-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daemon-store.js')>()),
  ensureSocialDaemonStart: mocks.ensureStart,
  listUnfinishedSocialPublishJobs: mocks.listUnfinished,
  listDueSocialPublishPlatforms: mocks.listDuePlatforms,
  listSocialPublishCandidates: mocks.listCandidates,
  listSocialPublishCandidatesForEpisodes: mocks.listCandidateEpisodes,
  listPendingSocialPublishSchedules: mocks.listPendingSchedules,
  getSocialQueueSnapshot: mocks.queueSnapshot,
  getActiveSocialStrategies: mocks.activeStrategies,
}));
vi.mock('./release-cohort-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./release-cohort-store.js')>()),
  claimReleaseCohortJobs: mocks.claimCohort,
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/telegram.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/telegram.js')>()),
  sendTelegramNotification: mocks.send,
}));

const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = ['node', 'daemon'];
  mocks.acquire.mockResolvedValue({ release: mocks.lockRelease });
  mocks.recoverLeases.mockResolvedValue(undefined);
  mocks.reportHistory.mockResolvedValue(undefined);
  mocks.ensureStart.mockResolvedValue('2026-09-28T00:00:00.000Z');
  mocks.listUnfinished.mockResolvedValue([]);
  mocks.listDuePlatforms.mockResolvedValue([]);
  mocks.listCandidates.mockResolvedValue([]);
  mocks.listCandidateEpisodes.mockResolvedValue([]);
  mocks.listPendingSchedules.mockResolvedValue([]);
  mocks.queueSnapshot.mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByLane: {},
    waitingVideos: [],
  });
  mocks.activeStrategies.mockResolvedValue([]);
  mocks.claimCohort.mockResolvedValue([]);
  mocks.flush.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue(undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe('social daemon CLI main coverage', () => {
  it('runs --once in compact mode, filters history logs, and releases the lock', async () => {
    process.argv = ['node', 'daemon', '--once'];
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.reportHistory.mockImplementation(
      async (log: (message: string) => void) => {
        log('ordinary history detail');
        log('⚠️ warning history detail');
        log('❌ failed history detail');
      },
    );

    await import('./daemon.js');

    expect(mocks.recoverLeases).toHaveBeenCalledOnce();
    expect(mocks.reportHistory).toHaveBeenCalledOnce();
    expect(consoleLog).not.toHaveBeenCalledWith('ordinary history detail');
    expect(consoleLog).toHaveBeenCalledWith('⚠️ warning history detail');
    expect(consoleLog).toHaveBeenCalledWith('❌ failed history detail');
    expect(mocks.lockRelease).toHaveBeenCalledOnce();
  });

  it('passes verbose history through unchanged in one-shot mode', async () => {
    process.argv = ['node', 'daemon', '--once', '--verbose'];
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.reportHistory.mockImplementation(
      async (log: (message: string) => void) => {
        log('ordinary verbose history detail');
      },
    );

    await import('./daemon.js');

    expect(consoleLog).toHaveBeenCalledWith('ordinary verbose history detail');
    expect(mocks.lockRelease).toHaveBeenCalledOnce();
  });

  it('enters the long-running daemon branch and performs fatal cleanup when startup fails', async () => {
    mocks.ensureStart.mockRejectedValue(new Error('daemon start failed'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    await import('./daemon.js');

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('FATAL: daemon start failed'),
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'social-daemon',
        tags: { operation: 'fatal' },
      }),
    );
    expect(mocks.lockRelease).toHaveBeenCalledOnce();
    expect(mocks.flush).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('tags a fatal release failure with its release phase', async () => {
    const { SocialReleaseFailureError } = await import('./publish-error.js');
    const releaseFailure = new SocialReleaseFailureError({
      episodeId: 'episode-fatal',
      languageCode: 'ja',
      platform: 'x',
      phase: 'transport',
      cause: new Error('publish state unknown'),
    });
    mocks.recoverLeases.mockRejectedValue(releaseFailure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('./daemon.js');

    expect(mocks.capture).toHaveBeenCalledWith(
      releaseFailure,
      expect.objectContaining({
        component: 'social-daemon',
        tags: { operation: 'transport' },
      }),
    );
  });

  it('reports an already-running lock and exits immediately', async () => {
    const { SocialDaemonAlreadyRunningError } =
      await import('./daemon-lock.js');
    mocks.acquire.mockRejectedValue(
      new SocialDaemonAlreadyRunningError(1234, join(tmpdir(), 'social.pid')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitError = new Error('exit');
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });

    await expect(import('./daemon.js')).rejects.toBe(exitError);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('another social daemon already holds the lock'),
    );
  });

  it('rethrows unexpected lock acquisition failures', async () => {
    mocks.acquire.mockRejectedValue(new Error('lock io failed'));
    await expect(import('./daemon.js')).rejects.toThrow('lock io failed');
  });
});
