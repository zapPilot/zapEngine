import { describe, expect, it, vi } from 'vitest';

import { createHeavyWorkCoordinator } from './heavy-work.js';
import { createVideoWorker } from './video-worker.js';

describe('video worker version-fenced idle polling', () => {
  it('treats incompatible queues as empty without processing or recording failures', async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue(null),
      reapFailedNotifications: vi.fn().mockResolvedValue([]),
      markFailureNotified: vi.fn(),
      fail: vi.fn(),
    };
    const visualRepository = {
      claim: vi.fn().mockResolvedValue(null),
      fail: vi.fn(),
    };
    const processJob = vi.fn();
    const processVisualJob = vi.fn();

    const worker = createVideoWorker({
      repository: repository as never,
      visualRepository: visualRepository as never,
      coordinator: createHeavyWorkCoordinator(),
      processJob,
      processVisualJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(visualRepository.claim).toHaveBeenCalledWith('worker-1');
    expect(repository.claim).toHaveBeenCalledWith('worker-1');
    expect(processVisualJob).not.toHaveBeenCalled();
    expect(processJob).not.toHaveBeenCalled();
    expect(visualRepository.fail).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('propagates visual claim errors instead of treating them as an empty queue', async () => {
    const claimError = new Error('visual claim database unavailable');
    const repository = {
      claim: vi.fn(),
      reapFailedNotifications: vi.fn().mockResolvedValue([]),
      markFailureNotified: vi.fn(),
      fail: vi.fn(),
    };
    const visualRepository = {
      claim: vi.fn().mockRejectedValue(claimError),
      fail: vi.fn(),
    };
    const processJob = vi.fn();
    const processVisualJob = vi.fn();

    const worker = createVideoWorker({
      repository: repository as never,
      visualRepository: visualRepository as never,
      coordinator: createHeavyWorkCoordinator(),
      processJob,
      processVisualJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).rejects.toBe(claimError);
    expect(repository.claim).not.toHaveBeenCalled();
    expect(processVisualJob).not.toHaveBeenCalled();
    expect(processJob).not.toHaveBeenCalled();
    expect(visualRepository.fail).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('propagates localization claim errors after an empty visual queue', async () => {
    const claimError = new Error('localization claim database unavailable');
    const repository = {
      claim: vi.fn().mockRejectedValue(claimError),
      reapFailedNotifications: vi.fn().mockResolvedValue([]),
      markFailureNotified: vi.fn(),
      fail: vi.fn(),
    };
    const visualRepository = {
      claim: vi.fn().mockResolvedValue(null),
      fail: vi.fn(),
    };
    const processJob = vi.fn();
    const processVisualJob = vi.fn();

    const worker = createVideoWorker({
      repository: repository as never,
      visualRepository: visualRepository as never,
      coordinator: createHeavyWorkCoordinator(),
      processJob,
      processVisualJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).rejects.toBe(claimError);
    expect(visualRepository.claim).toHaveBeenCalledWith('worker-1');
    expect(processVisualJob).not.toHaveBeenCalled();
    expect(processJob).not.toHaveBeenCalled();
    expect(visualRepository.fail).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('reports scheduled poll results so an on-demand worker can notice an idle queue', async () => {
    vi.useFakeTimers();
    try {
      const repository = {
        claim: vi.fn().mockResolvedValue(null),
        reapFailedNotifications: vi.fn().mockResolvedValue([]),
        markFailureNotified: vi.fn(),
        fail: vi.fn(),
      };
      const visualRepository = {
        claim: vi.fn().mockResolvedValue(null),
        fail: vi.fn(),
      };
      const onPollResult = vi.fn();

      const worker = createVideoWorker({
        repository: repository as never,
        visualRepository: visualRepository as never,
        coordinator: createHeavyWorkCoordinator(),
        processJob: vi.fn(),
        processVisualJob: vi.fn(),
        leaseOwner: 'worker-1',
        pollIntervalMs: 1_000,
        onPollResult,
      });

      // A direct runOnce is a test/manual path and must not move the idle clock.
      await worker.runOnce();
      expect(onPollResult).not.toHaveBeenCalled();

      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(onPollResult).toHaveBeenCalledWith('empty');

      await worker.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
