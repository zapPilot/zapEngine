import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PipelineSupabaseClient } from './supabase-client.js';
import {
  markPodcastPipelineRelease,
  startPodcastReleaseHeartbeat,
} from './podcast-release-heartbeat.js';

function clientWithRpc(
  rpc: ReturnType<typeof vi.fn>,
): PipelineSupabaseClient {
  return { rpc } as unknown as PipelineSupabaseClient;
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

  it('fails startup when the initial release marker cannot be written', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'missing release marker RPC' },
    });

    await expect(
      startPodcastReleaseHeartbeat({ client: clientWithRpc(rpc) }),
    ).rejects.toThrow('missing release marker RPC');
  });

  it('refreshes the marker and keeps later heartbeat failures non-fatal', async () => {
    vi.useFakeTimers();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000', message: 'temporary write failure' },
      });
    const logger = { info: vi.fn(), error: vi.fn() };

    const stop = await startPodcastReleaseHeartbeat({
      client: clientWithRpc(rpc),
      intervalMs: 1_000,
      logger,
    });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
