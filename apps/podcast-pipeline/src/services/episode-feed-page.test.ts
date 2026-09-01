import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { feedRow } from '../__fixtures__/index-test.js';
import { encodeCursor } from './db.js';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: () => ({ rpc: mockRpc }),
  throwSupabaseError: (error: unknown): never => {
    if (error instanceof Error) throw error;
    throw new Error(
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error),
    );
  },
}));

const { listHydratedEpisodeFeedPage } = await import('./episode-feed-page.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('listHydratedEpisodeFeedPage', () => {
  it('hydrates the feed, video and classroom audio through one RPC', async () => {
    const first = feedRow({
      id: '00000000-0000-4000-8000-000000000001',
      episode_id: '00000000-0000-4000-8000-000000000001',
      localization_id: '00000000-0000-4000-8000-000000000011',
    });
    const second = feedRow({
      id: '00000000-0000-4000-8000-000000000002',
      episode_id: '00000000-0000-4000-8000-000000000002',
      localization_id: '00000000-0000-4000-8000-000000000012',
      created_at: '2024-01-01T00:00:00.000Z',
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          ...first,
          video_status: 'completed',
          video_progress_percent: 100,
          video_progress_stage: null,
          video_updated_at: '2026-07-24T00:00:00.000Z',
          video_mp4_url: ' https://cdn.example.com/video.mp4 ',
          video_thumbnail_url: ' https://cdn.example.com/thumb.png ',
          video_duration_seconds: 90.5,
          visual_status: null,
          visual_progress_percent: null,
          visual_progress_stage: null,
          visual_updated_at: null,
          classroom_audio: [
            {
              languageCode: 'en',
              hlsUrl: 'https://cdn.example.com/classroom/en/playlist.m3u8',
            },
            { languageCode: 'ja', hlsUrl: '   ' },
          ],
        },
        {
          ...second,
          video_status: null,
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
          classroom_audio: [],
        },
      ],
      error: null,
    });

    const result = await listHydratedEpisodeFeedPage(1, null, 'zh-Hant');

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith('list_episode_feed_page_v1', {
      p_limit: 2,
      p_language_code: 'zh-Hant',
      p_cursor_created_at: null,
      p_cursor_id: null,
    });
    expect(result).toEqual({
      items: [
        {
          id: first.episode_id,
          localizationId: first.localization_id,
          title: first.title,
          languageCode: first.language_code,
          hlsUrl: first.hls_url,
          audioTracks: [
            {
              languageCode: first.language_code,
              title: first.title,
              hlsUrl: first.hls_url,
              classroomHlsUrl: first.classroom_hls_url,
              classrooms: [
                {
                  languageCode: 'en',
                  hlsUrl: 'https://cdn.example.com/classroom/en/playlist.m3u8',
                },
              ],
            },
          ],
          createdAt: first.created_at,
          llmModel: first.llm_model,
          llmThinkingModel: first.llm_thinking_model,
          llmProvider: first.llm_provider,
          status: first.status,
          video: {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: 'https://cdn.example.com/thumb.png',
            durationSeconds: 90.5,
          },
          videoGeneration: {
            status: 'completed',
            updatedAt: '2026-07-24T00:00:00.000Z',
            progressPercent: 100,
            stage: null,
          },
        },
      ],
      nextCursor: encodeCursor({ t: first.created_at, i: first.id }),
    });
  });

  it('uses the shared visual row while a render is still queued', async () => {
    const row = feedRow({
      id: '00000000-0000-4000-8000-000000000001',
      episode_id: '00000000-0000-4000-8000-000000000001',
      localization_id: '00000000-0000-4000-8000-000000000011',
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          ...row,
          video_status: 'queued',
          video_progress_percent: null,
          video_progress_stage: null,
          video_updated_at: '2026-07-24T02:00:00.000Z',
          video_mp4_url: null,
          video_thumbnail_url: null,
          video_duration_seconds: null,
          visual_status: 'processing',
          visual_progress_percent: 52,
          visual_progress_stage: 'selecting-images',
          visual_updated_at: '2026-07-24T02:30:00.000Z',
          classroom_audio: [],
        },
      ],
      error: null,
    });

    const result = await listHydratedEpisodeFeedPage(30, null, 'zh-Hant');

    expect(result?.items[0]?.videoGeneration).toEqual({
      status: 'queued',
      updatedAt: '2026-07-24T02:30:00.000Z',
      progressPercent: 22,
      stage: 'selecting-images',
    });
  });

  it('returns null only when the RPC migration is not available yet', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    });

    await expect(
      listHydratedEpisodeFeedPage(30, null, 'zh-Hant'),
    ).resolves.toBeNull();
  });

  it('does not hide real RPC failures behind the legacy path', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('feed RPC timed out'),
    });

    await expect(
      listHydratedEpisodeFeedPage(30, null, 'zh-Hant'),
    ).rejects.toThrow('feed RPC timed out');
  });
});
