import { beforeEach, describe, expect, it, vi } from 'vitest';

import { feedRow } from '../__fixtures__/index-test.js';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: () => ({ rpc: mockRpc }),
  throwSupabaseError: (error: unknown): never => {
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  },
}));

const { listHydratedEpisodeFeedPage } = await import('./episode-feed-page.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listHydratedEpisodeFeedPage coverage', () => {
  it('returns an empty page when the RPC returns no rows', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listHydratedEpisodeFeedPage(10, null, 'zh-Hant');

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('drops a non-array classroom payload and a row without video status', async () => {
    const row = feedRow({
      id: '00000000-0000-4000-8000-000000000001',
      episode_id: '00000000-0000-4000-8000-000000000001',
      localization_id: '00000000-0000-4000-8000-000000000011',
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          ...row,
          video_status: 'bogus',
          video_progress_percent: null,
          video_progress_stage: null,
          video_updated_at: null,
          video_mp4_url: null,
          video_thumbnail_url: null,
          video_duration_seconds: null,
          visual_status: null,
          visual_progress_percent: null,
          visual_progress_stage: null,
          visual_updated_at: null,
          classroom_audio: { unexpected: 'shape' },
        },
      ],
      error: null,
    });

    const result = await listHydratedEpisodeFeedPage(10, null, 'zh-Hant');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.video).toBeNull();
    expect(result.items[0]?.videoGeneration).toBeNull();
    expect(result.nextCursor).toBeNull();
  });
});
