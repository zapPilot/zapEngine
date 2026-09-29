import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  installTeardown: null as null | ((reason: string) => Promise<void>),
  invokeDuringInstall: false,
  assertRuntime: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
  createNotifier: vi.fn(),
  createWorker: vi.fn(),
  notifier: {
    start: vi.fn(),
    sweep: vi.fn(),
    stop: vi.fn(),
  },
  worker: {
    start: vi.fn(),
    runOnce: vi.fn(),
    drain: vi.fn(),
    stop: vi.fn(),
  },
  workerOptions: null as null | { onPollResult?: (result: string) => void },
}));

vi.mock('./lib/process-shutdown.js', () => ({
  installProcessShutdown: vi.fn(
    (teardown: (reason: string) => Promise<void>) => {
      mocks.installTeardown = teardown;
      if (mocks.invokeDuringInstall) void teardown('during install');
      return {
        shutdown: (reason = 'test') => teardown(reason),
      };
    },
  ),
}));

vi.mock('./observability/sentry-init.js', () => ({}));

vi.mock('./observability/sentry.js', () => ({
  capturePipelineException: mocks.captureException,
  flushSentry: mocks.flush,
}));

vi.mock('./services/video/runtime-preflight.js', () => ({
  assertVideoRenderRuntime: mocks.assertRuntime,
}));

vi.mock('./services/video-visual-failure-notifier.js', () => ({
  createVideoVisualFailureNotifier: mocks.createNotifier,
}));

vi.mock('./services/video-worker.js', () => ({
  createVideoWorker: mocks.createWorker,
}));

vi.mock('./services/episode-video-processor.js', () => ({
  processEpisodeVideoJob: vi.fn(),
}));

vi.mock('./services/episode-video-visual-processor.js', () => ({
  processEpisodeVideoVisualJob: vi.fn(),
}));

vi.mock('./services/visual-cost.js', () => ({
  recordVisualPipelineCost: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.installTeardown = null;
  mocks.invokeDuringInstall = false;
  mocks.workerOptions = null;
  mocks.assertRuntime.mockResolvedValue({
    ffmpegPath: '/usr/bin/ffmpeg',
    fontsDirectory: '/fonts',
  });
  mocks.flush.mockResolvedValue(true);
  mocks.worker.drain.mockResolvedValue(undefined);
  mocks.worker.stop.mockResolvedValue(undefined);
  mocks.createNotifier.mockReturnValue(mocks.notifier);
  mocks.createWorker.mockImplementation((options) => {
    mocks.workerOptions = options;
    return mocks.worker;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('video worker default wiring coverage', () => {
  it('uses the default worker/notifier/exit factories and invokes the process exit callback after idle shutdown', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { startVideoWorkerProcess } = await import('./worker.js');

    startVideoWorkerProcess({ idleShutdownMs: 0 });
    expect(mocks.createNotifier).toHaveBeenCalledOnce();
    expect(mocks.createWorker).toHaveBeenCalledOnce();

    mocks.workerOptions?.onPollResult?.('empty');
    mocks.workerOptions?.onPollResult?.('empty');
    vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.notifier.stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    expect(info).toHaveBeenCalled();
  });

  it('allows teardown to begin before worker timers have been installed', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.invokeDuringInstall = true;
    const { startVideoWorkerProcess } = await import('./worker.js');

    const handle = startVideoWorkerProcess({
      exit: vi.fn(),
      logger: { info: vi.fn() },
    });
    vi.runAllTicks();
    expect(mocks.notifier.stop).toHaveBeenCalled();
    expect(mocks.flush).toHaveBeenCalled();
    await handle.shutdown('cleanup');
  });

  it('ignores a stale uptime callback after shutdown has already started', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    let uptimeCallback: (() => void) | undefined;
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
      ) => {
        if (delay === 123_456) uptimeCallback = () => callback();
        return 999 as never;
      }) as unknown as typeof setTimeout);
    const { startVideoWorkerProcess } = await import('./worker.js');
    startVideoWorkerProcess({
      idleShutdownMs: 0,
      maxUptimeMs: 123_456,
      exit: vi.fn(),
      logger: { info: vi.fn() },
    });

    mocks.workerOptions?.onPollResult?.('empty');
    vi.runAllTicks();
    uptimeCallback?.();

    expect(mocks.worker.drain).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('uses all default preflight dependencies on success and failure', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { preflightVideoWorkerRuntime } = await import('./worker.js');

    await expect(preflightVideoWorkerRuntime()).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      '[video-worker] runtime:ready ffmpeg=/usr/bin/ffmpeg fonts=/fonts',
    );

    const failure = new Error('runtime unavailable');
    mocks.assertRuntime.mockRejectedValueOnce(failure);
    await expect(preflightVideoWorkerRuntime()).rejects.toBe(failure);
    expect(mocks.captureException).toHaveBeenCalledWith(failure, {
      component: 'video-worker',
      tags: { phase: 'runtime-preflight' },
    });
    expect(mocks.flush).toHaveBeenCalled();
  });

  it('runs the production module entrypoint', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await import('./worker.js');
    vi.runAllTicks();

    expect(mocks.assertRuntime).toHaveBeenCalled();
    expect(mocks.createWorker).toHaveBeenCalled();
    expect(mocks.worker.start).toHaveBeenCalled();
  });
});
