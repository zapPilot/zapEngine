import { describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../__fixtures__/index-test.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';

describe('createHeavyWorkCoordinator', () => {
  it('does not let the worker claim while ingest is active', async () => {
    const coordinator = createHeavyWorkCoordinator();
    const ingest = createDeferred<void>();
    const started = createDeferred<void>();
    const runningIngest = coordinator.runIngest(() => {
      started.resolve();
      return ingest.promise;
    });

    await started.promise;
    const work = vi.fn().mockResolvedValue('video');
    await expect(coordinator.tryRunVideo(work)).resolves.toEqual({
      acquired: false,
    });
    expect(work).not.toHaveBeenCalled();

    ingest.resolve();
    await runningIngest;
    await expect(coordinator.tryRunVideo(work)).resolves.toEqual({
      acquired: true,
      value: 'video',
    });
  });

  it('makes a new ingest wait for the active renderer', async () => {
    const coordinator = createHeavyWorkCoordinator();
    const video = createDeferred<void>();
    const runningVideo = coordinator.tryRunVideo(() => video.promise);
    const ingestWork = vi.fn().mockResolvedValue('audio');

    const runningIngest = coordinator.runIngest(ingestWork);
    await Promise.resolve();
    expect(ingestWork).not.toHaveBeenCalled();

    video.resolve();
    await runningVideo;
    await expect(runningIngest).resolves.toBe('audio');
  });

  it('wraps a non-Error abort reason while an ingest waits for video', async () => {
    const coordinator = createHeavyWorkCoordinator();
    const video = createDeferred<void>();
    const runningVideo = coordinator.tryRunVideo(() => video.promise);
    const controller = new AbortController();
    const ingestWork = vi.fn();
    const runningIngest = coordinator.runIngest(ingestWork, controller.signal);

    controller.abort('shutdown string');
    await expect(runningIngest).rejects.toMatchObject({
      message: 'Aborted while waiting for video idle',
      cause: 'shutdown string',
    });
    expect(ingestWork).not.toHaveBeenCalled();

    video.resolve();
    await runningVideo;
  });

  it('aborts an ingest waiting for video without running it', async () => {
    const coordinator = createHeavyWorkCoordinator();
    const video = createDeferred<void>();
    const runningVideo = coordinator.tryRunVideo(() => video.promise);
    const controller = new AbortController();
    const ingestWork = vi.fn().mockResolvedValue('audio');
    const runningIngest = coordinator.runIngest(ingestWork, controller.signal);

    controller.abort(new Error('shutdown'));
    await expect(runningIngest).rejects.toThrow('shutdown');
    expect(ingestWork).not.toHaveBeenCalled();
    video.resolve();
    await runningVideo;
  });
});
