import { describe, expect, it, vi } from 'vitest';

import {
  createVideoJobRepository,
  type EpisodeVideoJobRow,
} from './video-jobs.js';

function jobRow(
  overrides: Partial<EpisodeVideoJobRow> = {},
): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    status: 'queued',
    manifest: null,
    manifest_hash: null,
    renderer_version: null,
    storyboard_provider: null,
    storyboard_model: null,
    storyboard_prompt_version: null,
    script_hash: null,
    mp4_url: null,
    thumbnail_url: null,
    manifest_url: null,
    captions_ass_url: null,
    r2_prefix: null,
    duration_seconds: null,
    telegram_chat_id: null,
    attempt_count: 0,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    failure_notified_at: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeSupabase() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(),
  };
  return {
    rpc: vi.fn(),
    from: vi.fn(() => query),
    query,
  };
}

describe('createVideoJobRepository', () => {
  it('maps lifecycle RPC parameters and rows', async () => {
    const supabase = makeSupabase();
    const processing = jobRow({
      status: 'processing',
      attempt_count: 1,
      lease_owner: 'worker-1',
    });
    supabase.rpc
      .mockResolvedValueOnce({ data: [jobRow()], error: null })
      .mockResolvedValueOnce({ data: [processing], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [jobRow({ status: 'failed', attempt_count: 3 })],
        error: null,
      });
    const repository = createVideoJobRepository(supabase as never);

    await expect(repository.enqueue('localization-1', '123')).resolves.toEqual(
      jobRow(),
    );
    await expect(repository.claim('worker-1')).resolves.toEqual(processing);
    await expect(
      repository.renewLease('localization-1', 'worker-1'),
    ).resolves.toBe(true);
    await expect(
      repository.saveManifest('localization-1', 'worker-1', {
        manifest: { schemaVersion: 'v1' },
        manifestHash: 'manifest-hash',
        rendererVersion: 'renderer-v1',
        storyboardProvider: 'nvidia',
        storyboardModel: 'model',
        storyboardPromptVersion: 'prompt-v1',
        scriptHash: 'script-hash',
      }),
    ).resolves.toBe(true);
    await expect(
      repository.complete('localization-1', 'worker-1', {
        mp4Url: 'https://cdn.example.com/video.mp4',
        thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
        manifestUrl: 'https://cdn.example.com/manifest.json',
        captionsAssUrl: 'https://cdn.example.com/captions.ass',
        r2Prefix: 'episodes/1/video',
        durationSeconds: 90,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.fail('localization-1', 'worker-1', 'render failed'),
    ).resolves.toEqual(jobRow({ status: 'failed', attempt_count: 3 }));

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'enqueue_episode_video', {
      p_episode_localization_id: 'localization-1',
      p_telegram_chat_id: '123',
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'claim_episode_video', {
      p_lease_owner: 'worker-1',
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(6, 'fail_episode_video', {
      p_episode_localization_id: 'localization-1',
      p_lease_owner: 'worker-1',
      p_last_error: 'render failed',
    });
  });

  it('loads a completed canonical source for the processor', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'localization-1',
          episode_id: 'episode-1',
          language_code: 'zh-Hant',
          title: 'Episode',
          script: 'Canonical script',
          hls_url: 'https://cdn.example.com/audio.m3u8',
          status: 'completed',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'episode-1',
          source_url: 'https://example.com/article',
          source_title: 'Article',
        },
        error: null,
      });
    const repository = createVideoJobRepository(supabase as never);

    await expect(repository.loadSource('localization-1')).resolves.toEqual({
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'zh-Hant',
      title: 'Episode',
      script: 'Canonical script',
      hlsUrl: 'https://cdn.example.com/audio.m3u8',
      sourceUrl: 'https://example.com/article',
      sourceTitle: 'Article',
    });
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'episode_localizations');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'episodes');
  });

  it('rejects a non-renderable localization', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle.mockResolvedValue({
      data: {
        id: 'localization-1',
        episode_id: 'episode-1',
        language_code: 'en',
        title: 'Episode',
        script: 'Script',
        hls_url: 'https://cdn.example.com/audio.m3u8',
        status: 'completed',
      },
      error: null,
    });

    await expect(
      createVideoJobRepository(supabase as never).loadSource('localization-1'),
    ).rejects.toThrow('not renderable');
  });

  it('surfaces RPC errors and missing enqueue rows', async () => {
    const supabase = makeSupabase();
    const repository = createVideoJobRepository(supabase as never);
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(repository.enqueue('localization-1')).rejects.toThrow(
      'returned no job',
    );

    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });
    await expect(repository.claim('worker-1')).rejects.toThrow(
      'database unavailable',
    );
  });
});
