import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlyMachinesConfig } from '../lib/env.js';
import type { FlyMachinesClient } from './fly-machines.js';
import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  markPodcastPipelineRelease,
  podcastReleaseCanRender,
  startPodcastReleaseHeartbeat,
} from './podcast-release-heartbeat.js';

function clientWithRpc(
  rpc: ReturnType<typeof vi.fn>,
): PipelineSupabaseClient {
  return { rpc } as unknown as PipelineSupabaseClient;
}

function machinesWithList(
  listMachines: ReturnType<typeof vi.fn>,
): FlyMachinesClient {
  return {
    listMachines,
    startMachine: vi.fn(),
  } as unknown as FlyMachinesClient;
}

const flyConfig: FlyMachinesConfig = {
  appName: 'from-fed-to-chain-api',
  token: 'fly-token',
  currentImageRef: 'registry.fly.io/from-fed-to-chain-api:deployment-v10',
};

function renderMachine(image: string) {
  return {
    id: 'render-1',
    state: 'stopped',
    processGroup: 'render',
    image,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('podcast release heartbeat', () => {
  it('publishes the exact visual version the worker claims', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await markPodcastPipelineRelease(clientWithRpc(rpc));

    expect(rpc).toHaveBeenCalledWith('mark_podcast_pipeline_release', {
      p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    });
  });

  it('does not authorize retries while the render Machine is still on the previous image', async () => {
    const listMachines = vi.fn().mockResolvedValue([
      renderMachine('registry.fly.io/from-fed-to-chain-api:deployment-v9'),
    ]);

    await expect(
      podcastReleaseCanRender({
        flyConfig,
        machines: machinesWithList(listMachines),
      }),
    ).resolves.toBe(false);
  });

  it('starts publishing only after the render Machine reaches the app image', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const listMachines = vi
      .fn()
      .mockResolvedValueOnce([
        renderMachine('registry.fly.io/from-fed-to-chain-api:deployment-v9'),
      ])
      .mockResolvedValue([
        renderMachine(
          'registry.fly.io/from-fed-to-chain-api:deployment-v10@sha256:render',
        ),
      ]);
    const logger = { info: vi.fn(), error: vi.fn() };

    const stop = await startPodcastReleaseHeartbeat({
      client: clientWithRpc(rpc),
      flyConfig,
      machines: machinesWithList(listMachines),
      intervalMs: 1_000,
      logger,
    });

    expect(rpc).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      `[podcast-release] active visual_version=${EPISODE_VIDEO_VISUAL_VERSION}`,
    );

    stop();
  });

  it('keeps heartbeat failures non-fatal so stale state blocks retries instead of taking down HTTP', async () => {
    vi.useFakeTimers();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000', message: 'temporary write failure' },
      })
      .mockResolvedValue({ data: null, error: null });
    const logger = { info: vi.fn(), error: vi.fn() };

    const stop = await startPodcastReleaseHeartbeat({
      client: clientWithRpc(rpc),
      flyConfig: null,
      intervalMs: 1_000,
      logger,
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);

    stop();
  });
});
