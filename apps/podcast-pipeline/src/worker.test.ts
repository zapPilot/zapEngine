import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/episode-video-processor.js', () => ({
  processEpisodeVideoJob: vi.fn(),
}));

vi.mock('./services/episode-video-visual-processor.js', () => ({
  processEpisodeVideoVisualJob: vi.fn(),
}));

import { startVideoWorkerProcess } from './worker.js';

function makeWorker() {
  return {
    start: vi.fn(),
    runOnce: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('startVideoWorkerProcess', () => {
  it('starts the worker and stops it on a signal-driven shutdown', async () => {
    const videoWorker = makeWorker();

    const handle = startVideoWorkerProcess({ videoWorker });

    expect(handle.videoWorker).toBe(videoWorker);
    expect(videoWorker.start).toHaveBeenCalled();

    await handle.shutdown('SIGTERM');
    expect(videoWorker.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('SIGTERM'),
      }),
    );
  });

  it('holds the event loop open with a liveness timer and releases it on shutdown', async () => {
    vi.useFakeTimers();
    const videoWorker = makeWorker();
    const logger = { info: vi.fn() };

    // The worker's own poll timer is unref'd, so without this handle a
    // render-only process would exit as soon as bootstrap returned.
    const handle = startVideoWorkerProcess({
      videoWorker,
      logger,
      livenessIntervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenLastCalledWith('[video-worker] alive');

    await handle.shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });
});
