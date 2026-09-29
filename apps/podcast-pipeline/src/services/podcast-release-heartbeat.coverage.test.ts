import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFlyMachinesConfig: vi.fn(),
  createFlyMachinesClient: vi.fn(),
  flyImageRefsMatch: vi.fn(),
  getPipelineSupabase: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/env.js', () => ({
  readFlyMachinesConfig: mocks.readFlyMachinesConfig,
}));

vi.mock('./fly-machines.js', () => ({
  createFlyMachinesClient: mocks.createFlyMachinesClient,
  flyImageRefsMatch: mocks.flyImageRefsMatch,
}));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: mocks.getPipelineSupabase,
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));

import {
  PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS,
  podcastReleaseCanRender,
  startPodcastReleaseHeartbeat,
} from './podcast-release-heartbeat.js';

const config = {
  appName: 'podcast',
  token: 'token',
  currentImageRef: 'image:v1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPipelineSupabase.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.readFlyMachinesConfig.mockReturnValue(null);
  mocks.flyImageRefsMatch.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('podcast release heartbeat coverage', () => {
  it('uses the environment Fly config and default client when options are omitted', async () => {
    const listMachines = vi
      .fn()
      .mockResolvedValue([{ processGroup: 'render', image: 'image:v1' }]);
    mocks.readFlyMachinesConfig.mockReturnValue(config);
    mocks.createFlyMachinesClient.mockReturnValue({ listMachines });

    await expect(podcastReleaseCanRender()).resolves.toBe(true);

    expect(mocks.createFlyMachinesClient).toHaveBeenCalledWith({
      appName: 'podcast',
      token: 'token',
    });
    expect(listMachines).toHaveBeenCalledOnce();
  });

  it('treats an absent environment Fly config as locally renderable', async () => {
    mocks.readFlyMachinesConfig.mockReturnValue(null);

    await expect(podcastReleaseCanRender()).resolves.toBe(true);

    expect(mocks.createFlyMachinesClient).not.toHaveBeenCalled();
  });

  it('uses the default interval, logger, and Supabase client', async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.readFlyMachinesConfig.mockReturnValue(null);

    const stop = await startPodcastReleaseHeartbeat();

    expect(mocks.getPipelineSupabase).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    stop();
  });

  it('re-announces after the render fleet becomes inactive and recovers', async () => {
    vi.useFakeTimers();
    const listMachines = vi
      .fn()
      .mockResolvedValueOnce([{ processGroup: 'render', image: 'match' }])
      .mockResolvedValueOnce([{ processGroup: 'render', image: 'stale' }])
      .mockResolvedValue([{ processGroup: 'render', image: 'match' }]);
    mocks.flyImageRefsMatch.mockImplementation(
      (image: string) => image === 'match',
    );
    const logger = { info: vi.fn(), error: vi.fn() };

    const stop = await startPodcastReleaseHeartbeat({
      flyConfig: config,
      machines: { listMachines } as never,
      client: { rpc: mocks.rpc } as never,
      intervalMs: 100,
      logger,
    });

    expect(logger.info).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(logger.info).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(logger.info).toHaveBeenCalledTimes(2);
    stop();
  });

  it('logs a later heartbeat failure without rejecting the timer callback', async () => {
    vi.useFakeTimers();
    const listMachines = vi
      .fn()
      .mockResolvedValueOnce([{ processGroup: 'render', image: 'match' }])
      .mockRejectedValueOnce(new Error('fly unavailable'));
    const logger = { info: vi.fn(), error: vi.fn() };

    const stop = await startPodcastReleaseHeartbeat({
      flyConfig: config,
      machines: { listMachines } as never,
      client: { rpc: mocks.rpc } as never,
      intervalMs: 100,
      logger,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(logger.error).toHaveBeenCalledWith(
      '[podcast-release] heartbeat failed',
      expect.objectContaining({ message: 'fly unavailable' }),
    );
    stop();
  });
});
