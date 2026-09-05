import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services/episode-video-processor.js', () => ({
  processEpisodeVideoJob: vi.fn(),
}));

vi.mock('./services/episode-video-visual-processor.js', () => ({
  processEpisodeVideoVisualJob: vi.fn(),
}));

import type { VideoWorkerPollResult } from './services/video-worker.js';
import {
  preflightVideoWorkerRuntime,
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
  const visualFailureNotifier = {
    start: vi.fn(),
    sweep: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  };
  let onPollResult: ((result: VideoWorkerPollResult) => void) | undefined;
  const exit = vi.fn();
  const logger = { info: vi.fn() };

  const handle = startVideoWorkerProcess({
    createWorker: (options) => {
      onPollResult = options.onPollResult;
      return videoWorker;
    },
    createVisualFailureNotifier: () => visualFailureNotifier,
    exit,
    logger,
    ...overrides,
  });
  openHandles.push(handle);

  return {
    handle,
    videoWorker,
    visualFailureNotifier,
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
  it('starts the worker and visual failure notifier and stops both on shutdown', async () => {
    const { handle, videoWorker, visualFailureNotifier } = makeHarness();

    expect(handle.videoWorker).toBe(videoWorker);
    expect(videoWorker.start).toHaveBeenCalled();
    expect(visualFailureNotifier.start).toHaveBeenCalledOnce();

    await handle.shutdown('SIGTERM');
    expect(videoWorker.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('SIGTERM'),
      }),
    );
    expect(visualFailureNotifier.stop).toHaveBeenCalledOnce();
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

  // Covers the `process.exit` default without ever firing it: no empty poll
  // reaches trackIdle, so the real callback stays untouched.
  it('creates the default process-exit callback without invoking it', async () => {
    const { handle, videoWorker, poll } = makeHarness({ exit: undefined });

    poll('completed');
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

  it('exits 0 once the queue has stayed empty past the idle window', async () => {
    vi.useFakeTimers();
    const { exit, videoWorker, poll, logger } = makeHarness({
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

  // 'busy' is what a poll reports when the other render slot is still
  // occupied. Treating it as idle would exit the process out from under that
  // render.
  it.each<VideoWorkerPollResult>(['completed', 'busy'])(
    'restarts the idle window when a poll reports %s',
    async (working) => {
      vi.useFakeTimers();
      const { exit, poll } = makeHarness({
        idleShutdownMs: IDLE_SHUTDOWN_MS,
      });

      poll('empty');
      await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS * 2);
      poll(working);
      poll('empty');
      await vi.advanceTimersByTimeAsync(IDLE_SHUTDOWN_MS - 1_000);
      poll('empty');
      await vi.advanceTimersByTimeAsync(0);

      expect(exit).not.toHaveBeenCalled();
    },
  );

  it('shuts down only once even if further empty polls land', async () => {
    vi.useFakeTimers();
    const { exit, videoWorker, poll } = makeHarness({
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

describe('preflightVideoWorkerRuntime', () => {
  it('reports and flushes a runtime failure before rethrowing it', async () => {
    const failure = new Error('libass is unavailable');
    const captureException = vi.fn();
    const flush = vi.fn().mockResolvedValue(true);

    await expect(
      preflightVideoWorkerRuntime({
        assertRuntime: vi.fn().mockRejectedValue(failure),
        captureException,
        flush,
        logger: { info: vi.fn() },
      }),
    ).rejects.toBe(failure);

    expect(captureException).toHaveBeenCalledWith(failure, {
      component: 'video-worker',
      tags: { phase: 'runtime-preflight' },
    });
    expect(flush).toHaveBeenCalledOnce();
  });

  it('logs a successful runtime without reporting an exception', async () => {
    const logger = { info: vi.fn() };
    const captureException = vi.fn();
    const flush = vi.fn().mockResolvedValue(true);

    await preflightVideoWorkerRuntime({
      assertRuntime: vi.fn().mockResolvedValue({
        ffmpegPath: '/usr/bin/ffmpeg',
        fontsDirectory: '/app/assets/video/fonts',
        subtitleBurnInVerified: false,
        subtitleFrameMaxChannel: null,
      }),
      captureException,
      flush,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith(
      '[video-worker] runtime:ready ffmpeg=/usr/bin/ffmpeg fonts=/app/assets/video/fonts',
    );
    expect(captureException).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});
