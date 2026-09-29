import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
  getVisualRepository: vi.fn(),
}));

vi.mock('./video-jobs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./video-jobs.js')>()),
  getVideoJobRepository: mocks.getRepository,
  getVideoVisualJobRepository: mocks.getVisualRepository,
}));

import type { VideoJobRepository, VisualJobRepository } from './video-jobs.js';
import { createVideoWorker } from './video-worker.js';

function repository(): VideoJobRepository {
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

function visualRepository(): VisualJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(null),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    saveCheckpoint: vi.fn().mockResolvedValue(true),
    recordFailureDiagnostics: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(null),
    loadSource: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRepository.mockReturnValue(repository());
  mocks.getVisualRepository.mockReturnValue(visualRepository());
});

describe('video worker default repository coverage', () => {
  it('uses both default repositories when callers omit them', async () => {
    const worker = createVideoWorker({
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      leaseOwner: 'worker-defaults',
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(mocks.getRepository).toHaveBeenCalledOnce();
    expect(mocks.getVisualRepository).toHaveBeenCalledOnce();
  });
});
