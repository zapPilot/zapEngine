import { describe, expect, it, vi } from 'vitest';

import {
  createVideoJobRepository,
  createVideoVisualJobRepository,
  EPISODE_VIDEO_VISUAL_VERSION,
} from './video-jobs.js';

function makeSupabase() {
  return {
    rpc: vi.fn(),
  };
}

describe('version-fenced video job claims', () => {
  it.each([
    {
      name: 'visual',
      rpcName: 'claim_episode_video_visual_v2',
      createRepository: createVideoVisualJobRepository,
    },
    {
      name: 'localization',
      rpcName: 'claim_episode_video_v2',
      createRepository: createVideoJobRepository,
    },
  ])(
    'returns null when the $name queue has no compatible job',
    async ({ rpcName, createRepository }) => {
      const supabase = makeSupabase();
      supabase.rpc.mockResolvedValue({ data: [], error: null });

      await expect(
        createRepository(supabase as never).claim('worker-1'),
      ).resolves.toBeNull();
      expect(supabase.rpc).toHaveBeenCalledWith(rpcName, {
        p_lease_owner: 'worker-1',
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
      });
    },
  );

  it.each([
    {
      name: 'visual',
      createRepository: createVideoVisualJobRepository,
    },
    {
      name: 'localization',
      createRepository: createVideoJobRepository,
    },
  ])(
    'surfaces database failures while claiming a $name job',
    async ({ createRepository }) => {
      const supabase = makeSupabase();
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'claim database unavailable' },
      });

      await expect(
        createRepository(supabase as never).claim('worker-1'),
      ).rejects.toThrow('claim database unavailable');
    },
  );
});
