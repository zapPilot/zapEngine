import type { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(
    (
      _options: unknown,
      callback?: (info: { port: number }) => void,
    ): { close: ReturnType<typeof vi.fn> } => {
      callback?.({ port: 0 });
      return { close: vi.fn() };
    },
  ),
}));

vi.mock('./services/video-worker.js', async (importOriginal) => {
  const actual = (await importOriginal<
    typeof import('./services/video-worker.js')
  >()) as Record<string, unknown>;
  return {
    ...actual,
    createVideoWorker: vi.fn(() => ({
      start: vi.fn(),
      runOnce: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('./services/episode-video-processor.js', () => ({
  processEpisodeVideoJob: vi.fn(),
}));

vi.mock('./services/episode-video-visual-processor.js', () => ({
  processEpisodeVideoVisualJob: vi.fn(),
}));

const renderCapacityMock = vi.hoisted(() => ({
  createRenderCapacityReconciler: vi.fn(),
}));

vi.mock('./services/render-capacity.js', async (importOriginal) => {
  const actual = (await importOriginal<
    typeof import('./services/render-capacity.js')
  >()) as Record<string, unknown>;
  return { ...actual, ...renderCapacityMock };
});

vi.mock('./lib/env.js', async (importOriginal) => {
  const actual = (await importOriginal<
    typeof import('./lib/env.js')
  >()) as Record<string, unknown>;
  return {
    ...actual,
    getRequiredEnv: vi.fn((key: string) => {
      const env: Record<string, string> = {
        PORT: '8081',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        PIPELINE_DB_SCHEMA: 'from_fed_to_chain',
        PIPELINE_TELEGRAM_BOT_TOKEN: 'bot-token',
        PIPELINE_TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
        ALLOWED_TELEGRAM_USER_IDS: '1,2,3',
      };
      if (key in env) return env[key]!;
      throw new Error(`Unknown env: ${key}`);
    }),
  };
});

describe('bootstrap', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('starts the server, exposes a shutdown that detaches signal handlers, and stops the video worker', async () => {
    const { bootstrap } = await import('./index.js');
    const startSigintListeners = process.listenerCount('SIGINT');
    const startSigtermListeners = process.listenerCount('SIGTERM');
    const fakeApp = { fetch: vi.fn() } as unknown as Hono;
    const providedWorker = {
      start: vi.fn(),
      runOnce: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const processJob = vi.fn().mockResolvedValue({});

    const handle = bootstrap({
      app: fakeApp,
      videoWorker: providedWorker,
      processVideoJob: processJob,
    });

    expect(handle.app).toBe(fakeApp);
    expect(handle.videoWorker).toBe(providedWorker);
    expect(handle.server).toBeDefined();
    expect(providedWorker.start).toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBeGreaterThanOrEqual(
      startSigintListeners + 1,
    );
    expect(process.listenerCount('SIGTERM')).toBeGreaterThanOrEqual(
      startSigtermListeners + 1,
    );

    await handle.shutdown('SIGTERM');
    expect(providedWorker.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('SIGTERM'),
      }),
    );

    const postRunSigintListeners = process.listenerCount('SIGINT');
    const postRunSigtermListeners = process.listenerCount('SIGTERM');
    expect(postRunSigintListeners).toBeLessThanOrEqual(startSigintListeners);
    expect(postRunSigtermListeners).toBeLessThanOrEqual(startSigtermListeners);
  });

  it('deduplicates concurrent shutdown invocations into a single promise', async () => {
    const { bootstrap } = await import('./index.js');
    const stop = vi.fn().mockResolvedValue(undefined);
    const server = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
      videoWorker: {
        start: vi.fn(),
        runOnce: vi.fn(),
        stop,
      },
    });
    await Promise.all([server.shutdown('SIGTERM'), server.shutdown('SIGINT')]);
    expect(stop).toHaveBeenCalledTimes(1);
    await server.shutdown('SIGTERM');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('creates the default Hono app when bootstrap is called without an app', async () => {
    const { bootstrap } = await import('./index.js');
    const handle = bootstrap({ renderCapacity: null });

    expect(handle.app).toBeDefined();
    expect(handle.videoWorker).toBeNull();
    await handle.shutdown();
  });

  it('does not render video by default — the render Fly process group owns that', async () => {
    const { bootstrap } = await import('./index.js');
    const { createVideoWorker } = await import('./services/video-worker.js');

    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
    });

    expect(createVideoWorker).not.toHaveBeenCalled();
    expect(handle.videoWorker).toBeNull();

    await handle.shutdown();
  });

  it('has no render machine to manage when FLY_APP_NAME says this is not Fly', async () => {
    const { bootstrap } = await import('./index.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    delete process.env['FLY_APP_NAME'];

    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
    });

    expect(handle.renderCapacity).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not on Fly'));
    expect(
      renderCapacityMock.createRenderCapacityReconciler,
    ).not.toHaveBeenCalled();

    await handle.shutdown();
    log.mockRestore();
  });

  // The render group has exactly one mode, so an unconfigured token has to stop
  // the boot. Degrading quietly here is what stalled renders for two days.
  it('fails the boot when running on Fly without a Machines API token', async () => {
    const { bootstrap } = await import('./index.js');
    vi.stubEnv('FLY_APP_NAME', 'from-fed-to-chain-api');
    vi.stubEnv('PIPELINE_FLY_API_TOKEN', '');

    expect(() =>
      bootstrap({ app: { fetch: vi.fn() } as unknown as Hono }),
    ).toThrow(/PIPELINE_FLY_API_TOKEN/);
    expect(
      renderCapacityMock.createRenderCapacityReconciler,
    ).not.toHaveBeenCalled();
  });

  it('fails the boot when Fly does not provide the current image ref', async () => {
    const { bootstrap } = await import('./index.js');
    vi.stubEnv('FLY_APP_NAME', 'from-fed-to-chain-api');
    vi.stubEnv('PIPELINE_FLY_API_TOKEN', 'fly-token');
    vi.stubEnv('FLY_IMAGE_REF', '');

    expect(() =>
      bootstrap({ app: { fetch: vi.fn() } as unknown as Hono }),
    ).toThrow(/FLY_IMAGE_REF/);
    expect(
      renderCapacityMock.createRenderCapacityReconciler,
    ).not.toHaveBeenCalled();
  });

  it('runs the reconciler whenever the Fly Machines config is complete', async () => {
    const { bootstrap } = await import('./index.js');
    const reconciler = { start: vi.fn(), runOnce: vi.fn(), stop: vi.fn() };
    renderCapacityMock.createRenderCapacityReconciler.mockReturnValue(
      reconciler,
    );
    vi.stubEnv('FLY_APP_NAME', 'from-fed-to-chain-api');
    vi.stubEnv('PIPELINE_FLY_API_TOKEN', 'fly-token');
    vi.stubEnv('FLY_IMAGE_REF', 'registry.fly.io/podcast:deployment-current');

    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
    });

    expect(handle.renderCapacity).toBe(reconciler);
    expect(reconciler.start).toHaveBeenCalled();
    expect(
      renderCapacityMock.createRenderCapacityReconciler,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currentImageRef: 'registry.fly.io/podcast:deployment-current',
      }),
    );

    await handle.shutdown('SIGTERM');
    expect(reconciler.stop).toHaveBeenCalled();
  });

  it('runs the render-capacity reconciler for the process lifetime when one is provided', async () => {
    const { bootstrap } = await import('./index.js');
    const renderCapacity = {
      start: vi.fn(),
      runOnce: vi.fn(),
      stop: vi.fn(),
    };

    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
      renderCapacity,
    });

    expect(renderCapacity.start).toHaveBeenCalled();
    expect(renderCapacity.stop).not.toHaveBeenCalled();

    await handle.shutdown('SIGTERM');
    expect(renderCapacity.stop).toHaveBeenCalled();
  });

  it('uses lazy default processors when the render worker is enabled without overrides', async () => {
    const { bootstrap } = await import('./index.js');
    const { createVideoWorker } = await import('./services/video-worker.js');
    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
      startVideoWorker: true,
      renderCapacity: null,
    });

    expect(createVideoWorker).toHaveBeenCalledWith({
      processJob: expect.any(Function),
      processVisualJob: expect.any(Function),
    });
    await handle.shutdown();
  });

  it('wires both the shared visual and localization processors into the worker', async () => {
    const { bootstrap } = await import('./index.js');
    const { createVideoWorker } = await import('./services/video-worker.js');
    const processVideoJob = vi.fn();
    const processVideoVisualJob = vi.fn();
    const handle = bootstrap({
      app: { fetch: vi.fn() } as unknown as Hono,
      processVideoJob,
      processVideoVisualJob,
      startVideoWorker: true,
    });

    expect(createVideoWorker).toHaveBeenCalledWith({
      processJob: processVideoJob,
      processVisualJob: processVideoVisualJob,
    });

    await handle.shutdown();
  });
});
