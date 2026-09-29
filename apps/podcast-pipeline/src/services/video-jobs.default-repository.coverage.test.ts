import { beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineSupabase = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('./supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase-client.js')>()),
  getPipelineSupabase: () => pipelineSupabase,
}));

import {
  enqueueEpisodeVideoJob,
  enqueueEpisodeVideoVisualJob,
  EPISODE_VIDEO_VISUAL_VERSION,
  findEpisodeVideoJob,
  findEpisodeVideoVisualJob,
} from './video-jobs.js';

describe('default video job repository wrappers', () => {
  beforeEach(() => {
    pipelineSupabase.rpc.mockReset();
    pipelineSupabase.from.mockReset();
  });

  it('finds localization and visual jobs through the default repositories', async () => {
    const localizationJob = {
      episode_localization_id: 'localization-1',
      status: 'queued',
    };
    const visualJob = {
      episode_id: 'episode-1',
      status: 'queued',
    };
    const localizationQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: localizationJob,
        error: null,
      }),
    };
    localizationQuery.select.mockReturnValue(localizationQuery);
    localizationQuery.eq.mockReturnValue(localizationQuery);
    const visualQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: visualJob,
        error: null,
      }),
    };
    visualQuery.select.mockReturnValue(visualQuery);
    visualQuery.eq.mockReturnValue(visualQuery);
    pipelineSupabase.from
      .mockReturnValueOnce(visualQuery)
      .mockReturnValueOnce(localizationQuery);

    await expect(findEpisodeVideoVisualJob('episode-1')).resolves.toEqual(
      visualJob,
    );
    await expect(findEpisodeVideoJob('localization-1')).resolves.toEqual(
      localizationJob,
    );
  });

  it('enqueues localization and visual jobs through the lazily-created default repositories', async () => {
    const localizationJob = {
      episode_localization_id: 'localization-1',
      status: 'queued',
    };
    const visualJob = {
      episode_id: 'episode-1',
      status: 'queued',
    };
    pipelineSupabase.rpc
      .mockResolvedValueOnce({ data: [localizationJob], error: null })
      .mockResolvedValueOnce({ data: [visualJob], error: null });

    await expect(
      enqueueEpisodeVideoJob('localization-1', 'chat-1'),
    ).resolves.toEqual(localizationJob);
    await expect(
      enqueueEpisodeVideoVisualJob('episode-1', {
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: 'source-hash',
        telegramChatId: 'chat-1',
      }),
    ).resolves.toEqual(visualJob);

    expect(pipelineSupabase.rpc).toHaveBeenNthCalledWith(
      1,
      'enqueue_episode_video',
      {
        p_episode_localization_id: 'localization-1',
        p_telegram_chat_id: 'chat-1',
      },
    );
    expect(pipelineSupabase.rpc).toHaveBeenNthCalledWith(
      2,
      'enqueue_episode_video_visual',
      {
        p_episode_id: 'episode-1',
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        p_source_hash: 'source-hash',
        p_telegram_chat_id: 'chat-1',
      },
    );
  });
});
