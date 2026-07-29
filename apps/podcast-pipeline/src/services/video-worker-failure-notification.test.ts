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
    expect(repository.markFailureNotified).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to record failure notification',
      expect.objectContaining({ message: 'database unavailable' }),
    );

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(notify).toHaveBeenCalledTimes(2);
    expect(repository.markFailureNotified).toHaveBeenCalledTimes(2);
    expect(repository.markFailureNotified).toHaveBeenLastCalledWith('localization-1');
  });
});
