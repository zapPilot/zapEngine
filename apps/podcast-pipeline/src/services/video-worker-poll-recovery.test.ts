import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VideoJobRepository, VisualJobRepository } from './video-jobs.js';
import { createVideoWorker } from './video-worker.js';

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
    reapFailedNotifications: vi.fn().mockResolvedValue([]),
    markFailureNotified: vi.fn().mockResolvedValue(true),
  };
}

function makeVisualRepository(): VisualJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi
      .fn()
      .mockRejectedValueOnce(new Error('visual queue unavailable'))
      .mockResolvedValue(null),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(null),
    loadSource: vi.fn(),
  };
}

describe('video worker scheduled polling recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs a claim error and continues polling on the next interval', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    const visualRepository = makeVisualRepository();
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
      pollIntervalMs: 15_000,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] poll failed',
      expect.objectContaining({ message: 'visual queue unavailable' }),
    );
    expect(visualRepository.claim).toHaveBeenCalledTimes(1);
    expect(repository.claim).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(visualRepository.claim).toHaveBeenCalledTimes(2);
    expect(repository.claim).toHaveBeenCalledWith('worker-1');
    expect(visualRepository.fail).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();

    await worker.stop();
  });
});
