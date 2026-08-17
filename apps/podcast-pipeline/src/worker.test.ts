import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/episode-video-processor.js', () => ({
  processEpisodeVideoJob: vi.fn(),
}));

vi.mock('./services/episode-video-visual-processor.js', () => ({
  processEpisodeVideoVisualJob: vi.fn(),
}));

import type { VideoWorkerPollResult } from './services/video-worker.js';
import {
  startVideoWorkerProcess,
  type VideoWorkerProcessHandle,
  type VideoWorkerProcessOptions,
} from './worker.js';

const IDLE_SHUTDOWN_MS = 60_000;

const openHandles: VideoWorkerProcessHandle[] = [];

function makeHarness(overrides: Partial<VideoWorkerProcessOptions> = {}) {
  const videoWorker = {
    start: vi.fn(),
    runOnce: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  let onPollResult: ((result: VideoWorkerPollResult) => void) | undefined;
  const exit = vi.fn();
  const logger = { info: vi.fn() };

  const handle = startVideoWorkerProcess({
    createWorker: (options) => {
      onPollResult = options.onPollResult;
      return videoWorker;
    },
    exit,
    logger,
    ...overrides,
  });
  openHandles.push(handle);

  return {
    handle,
    videoWorker,
    exit,
    logger,
    poll: (result: VideoWorkerPollResult) => onPollResult?.(result),
  };
}

afterEach(async () => {
  // installProcessShutdown registers process listeners that only detach on
  // shutdown; leaving them attached leaks across tests.
  while (openHandles.length > 0) {
    await openHandles.pop()?.shutdown('test cleanup');
  }
  vi.useRealTimers();
});

describe('startVideoWorkerProcess', () => {
  it('starts the worker and stops it on a signal-driven shutdown', async () => {
    const { handle, videoWorker } = makeHarness();

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
    const { handle, logger } = makeHarness({ livenessIntervalMs: 1_000 });
    logger.info.mockClear();

    // The worker's own poll timer is unref'd, so without this handle a
    // render-only process would exit as soon as bootstrap returned.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenLastCalledWith('[video-worker] alive');

    await handle.shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('creates the default process-exit callback without invoking it in always-on mode', async () => {
    const { handle, videoWorker } = makeHarness({
      exit: undefined,
      onDemand: false,
    });

    expect(videoWorker.start).toHaveBeenCalledOnce();
    await handle.shutdown('default exit callback test');
  });

  it('uses the default console logger when none is injected', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { handle } = makeHarness({ logger: undefined });

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('[video-worker]'),
    );
    await handle.shutdown('logger test');
    info.mockRestore();
  });

  it('explains when configured on-demand mode is explicitly disabled by the caller', async () => {
    vi.stubEnv('PIPELINE_RENDER_ON_DEMAND', 'true');
    vi.stubEnv('PIPELINE_FLY_API_TOKEN', 'test-token');
    vi.stubEnv('FLY_APP_NAME', 'podcast-test');
    const { logger } = makeHarness({ onDemand: false });

    expect(logger.info).toHaveBeenCalledWith(
      '[video-worker] always-on: disabled by caller',
    );
    vi.unstubAllEnvs();
  });

  it('stays alive on an empty queue when on-demand mode is off', async () => {
    vi.useFakeTimers();
    const { exit, videoWorker, poll, logger } = makeHarness({
      onDemand: false,
      idleShutdownMs: IDLE_SHUTDOWN_MS,
    });

    poll('empty');
    await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS * 5);
    poll('empty');
    await vi.advanceTimersByTimeAsync(0);

    expect(exit).not.toHaveBeenCalled();
    expect(videoWorker.stop).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('always-on'),
    );
  });

  it('exits 0 once the queue has stayed empty past the idle window', async () => {
    vi.useFakeTimers();
    const { exit, videoWorker, poll, logger } = makeHarness({
      onDemand: true,
      idleShutdownMs: IDLE_SHUTDOWN_MS,
    });

    poll('empty');
    await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS - 1_000);
    poll('empty');
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    poll('empty');
    await vi.advanceTimersByTimeAsync(0);

    expect(videoWorker.stop).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('idle:shutdown'),
    );
  });

  it('restarts the idle window whenever a poll finds work', async () => {
    vi.useFakeTimers();
    const { exit, poll } = makeHarness({
      onDemand: true,
      idleShutdownMs: IDLE_SHUTDOWN_MS,
    });

    poll('empty');
    await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS * 2);
    poll('completed');
    poll('empty');
    await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS - 1_000);
    poll('empty');
    await vi.advanceTimersByTimeAsync(0);

    expect(exit).not.toHaveBeenCalled();
  });

  it('shuts down only once even if further empty polls land', async () => {
    vi.useFakeTimers();
    const { exit, videoWorker, poll } = makeHarness({
      onDemand: true,
      idleShutdownMs: IDLE_SHUTDOWN_MS,
    });

    poll('empty');
    await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS + 1_000);
    poll('empty');
    poll('empty');
    await vi.advanceTimersByTimeAsync(0);

    expect(videoWorker.stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
