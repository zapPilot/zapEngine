import { describe, expect, it, vi } from 'vitest';

import type { VideoJobRepository, VisualJobRepository } from './video-jobs.js';
import { createVideoWorker } from './video-worker.js';

const failedNotification = {
  episodeLocalizationId: 'localization-1',
  telegramChatId: 'chat-1',
  episodeId: 'episode-1',
  lastError: 'render failed',
};

function makeRepository(): VideoJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(null),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    saveManifest: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(null),
    loadSource: vi.fn(),
    reapFailedNotifications: vi.fn().mockResolvedValue([failedNotification]),
    markFailureNotified: vi
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(true),
  };
}

function makeVisualRepository(): VisualJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(null),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(null),
    loadSource: vi.fn(),
  };
}

describe('video worker failure notification retry', () => {
  it('re-sends after delivery succeeds but stamping the notification fails', async () => {
    const repository = makeRepository();
    const notify = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository,
      visualRepository: makeVisualRepository(),
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      notify,
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('原因：render failed'),
    );
    expect(repository.markFailureNotified).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to record failure notification',
      expect.objectContaining({ message: 'database unavailable' }),
    );

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(notify).toHaveBeenCalledTimes(2);
    expect(repository.markFailureNotified).toHaveBeenCalledTimes(2);
    expect(repository.markFailureNotified).toHaveBeenLastCalledWith(
      'localization-1',
    );
  });

  it('continues polling jobs when the failure notification sweep cannot read the database', async () => {
    const repository = makeRepository();
    const visualRepository = makeVisualRepository();
    const notify = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn(), error: vi.fn() };
    vi.mocked(repository.reapFailedNotifications).mockRejectedValue(
      new Error('reap unavailable'),
    );
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      notify,
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(visualRepository.claim).toHaveBeenCalledWith('worker-1');
    expect(repository.claim).toHaveBeenCalledWith('worker-1');
    expect(notify).not.toHaveBeenCalled();
    expect(repository.markFailureNotified).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to reap video failure notifications',
      expect.objectContaining({ message: 'reap unavailable' }),
    );
  });

  it('does not claim or fail a localization job when visual queue claiming fails', async () => {
    const repository = makeRepository();
    const visualRepository = makeVisualRepository();
    vi.mocked(repository.reapFailedNotifications).mockResolvedValue([]);
    vi.mocked(visualRepository.claim).mockRejectedValue(
      new Error('visual queue unavailable'),
    );
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).rejects.toThrow('visual queue unavailable');
    expect(repository.claim).not.toHaveBeenCalled();
    expect(visualRepository.fail).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });
});
