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
});
