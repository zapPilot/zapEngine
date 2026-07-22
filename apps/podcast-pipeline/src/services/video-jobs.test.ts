import { describe, expect, it, vi } from 'vitest';

import {
  createVideoJobRepository,
  createVideoVisualJobRepository,
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoVisualJobRow,
  hashEpisodeVideoVisualSource,
} from './video-jobs.js';

function jobRow(
  overrides: Partial<EpisodeVideoJobRow> = {},
): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    episode_id: 'episode-1',
    status: 'queued',
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
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

function visualJobRow(
  overrides: Partial<EpisodeVideoVisualJobRow> = {},
): EpisodeVideoVisualJobRow {
  return {
    episode_id: 'episode-1',
    status: 'queued',
    visual_payload: null,
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    source_hash: 'source-hash',
    r2_prefix: null,
    telegram_chat_id: null,
    attempt_count: 0,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function localizationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'localization-1',
    episode_id: 'episode-1',
    language_code: 'zh-Hant',
    title: 'Episode',
    script: 'Canonical script',
    hls_url: 'https://cdn.example.com/audio.m3u8',
    classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
    status: 'completed',
    ...overrides,
  };
}

function englishLocalizationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return localizationRow({
    id: 'localization-en',
    language_code: 'en',
    title: 'English episode',
    script: 'English script',
    hls_url: 'https://cdn.example.com/en/audio.m3u8',
    classroom_hls_url: null,
    ...overrides,
  });
}

function episodeRow(): Record<string, unknown> {
  return {
    id: 'episode-1',
    source_url: 'https://example.com/article',
    source_title: 'Article',
  };
}

function completedVisualRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    episode_id: 'episode-1',
    status: 'completed',
    visual_payload: {
      schemaVersion: EPISODE_VIDEO_VISUAL_VERSION,
      scenes: [],
    },
    visual_hash: 'visual-hash',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    source_hash: 'source-hash',
    r2_prefix: 'episodes/episode-1/video-visuals',
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
  it('maps localization lifecycle RPC parameters and rows', async () => {
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

  it('loads a canonical localization with its completed shared visuals', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle
      .mockResolvedValueOnce({
        data: localizationRow(),
        error: null,
      })
      .mockResolvedValueOnce({ data: episodeRow(), error: null })
      .mockResolvedValueOnce({ data: completedVisualRow(), error: null });

    await expect(
      createVideoJobRepository(supabase as never).loadSource('localization-1'),
    ).resolves.toEqual({
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'zh-Hant',
      title: 'Episode',
      script: 'Canonical script',
      hlsUrl: 'https://cdn.example.com/audio.m3u8',
      sourceUrl: 'https://example.com/article',
      sourceTitle: 'Article',
      canonicalLocalizationId: 'localization-1',
      canonicalScript: 'Canonical script',
      visualManifest: {
        schemaVersion: EPISODE_VIDEO_VISUAL_VERSION,
        scenes: [],
      },
      visualHash: 'visual-hash',
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      visualR2Prefix: 'episodes/episode-1/video-visuals',
    });
    expect(
      (supabase.from.mock.calls as unknown[][]).map(([table]) => table),
    ).toEqual(['episode_localizations', 'episodes', 'episode_video_visuals']);
  });

  it.each(['ja', 'en'] as const)(
    'loads a completed %s localization with canonical script and no classroom requirement',
    async (languageCode) => {
      const supabase = makeSupabase();
      supabase.query.maybeSingle
        .mockResolvedValueOnce({
          data: localizationRow({
            id: `${languageCode}-localization`,
            language_code: languageCode,
            title: `${languageCode} title`,
            script: `${languageCode} script`,
            classroom_hls_url: null,
          }),
          error: null,
        })
        .mockResolvedValueOnce({
          data: localizationRow(),
          error: null,
        })
        .mockResolvedValueOnce({ data: episodeRow(), error: null })
        .mockResolvedValueOnce({ data: completedVisualRow(), error: null });

      const source = await createVideoJobRepository(
        supabase as never,
      ).loadSource(`${languageCode}-localization`);

      expect(source.languageCode).toBe(languageCode);
      expect(source.script).toBe(`${languageCode} script`);
      expect(source.canonicalScript).toBe('Canonical script');
      expect(
        (supabase.from.mock.calls as unknown[][]).map(([table]) => table),
      ).toEqual([
        'episode_localizations',
        'episode_localizations',
        'episodes',
        'episode_video_visuals',
      ]);
    },
  );

  it('rejects unsupported or audio-ineligible localization sources', async () => {
    const unsupported = makeSupabase();
    unsupported.query.maybeSingle.mockResolvedValue({
      data: localizationRow({ language_code: 'fr' }),
      error: null,
    });
    await expect(
      createVideoJobRepository(unsupported as never).loadSource('loc'),
    ).rejects.toThrow('not renderable');

    const canonicalWithoutClassroom = makeSupabase();
    canonicalWithoutClassroom.query.maybeSingle.mockResolvedValue({
      data: localizationRow({ classroom_hls_url: ' ' }),
      error: null,
    });
    await expect(
      createVideoJobRepository(canonicalWithoutClassroom as never).loadSource(
        'loc',
      ),
    ).rejects.toThrow('not renderable');

    const secondaryWithoutMain = makeSupabase();
    secondaryWithoutMain.query.maybeSingle.mockResolvedValue({
      data: localizationRow({
        language_code: 'en',
        hls_url: ' ',
        classroom_hls_url: null,
      }),
      error: null,
    });
    await expect(
      createVideoJobRepository(secondaryWithoutMain as never).loadSource('loc'),
    ).rejects.toThrow('not renderable');
  });

  it('requires a completed, populated shared visual checkpoint', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle
      .mockResolvedValueOnce({ data: localizationRow(), error: null })
      .mockResolvedValueOnce({ data: episodeRow(), error: null })
      .mockResolvedValueOnce({
        data: completedVisualRow({ status: 'queued', visual_payload: null }),
        error: null,
      });

    await expect(
      createVideoJobRepository(supabase as never).loadSource('localization-1'),
    ).rejects.toThrow('visuals are not complete');
  });

  it('surfaces lookup errors and missing localization, episode, or visual rows', async () => {
    const localizationError = makeSupabase();
    localizationError.query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    });
    await expect(
      createVideoJobRepository(localizationError as never).loadSource('loc'),
    ).rejects.toThrow('connection refused');

    const missingLocalization = makeSupabase();
    missingLocalization.query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    await expect(
      createVideoJobRepository(missingLocalization as never).loadSource('loc'),
    ).rejects.toThrow('localization not found');

    const missingEpisode = makeSupabase();
    missingEpisode.query.maybeSingle
      .mockResolvedValueOnce({ data: localizationRow(), error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(
      createVideoJobRepository(missingEpisode as never).loadSource('loc'),
    ).rejects.toThrow('episode not found');

    const missingVisual = makeSupabase();
    missingVisual.query.maybeSingle
      .mockResolvedValueOnce({ data: localizationRow(), error: null })
      .mockResolvedValueOnce({ data: episodeRow(), error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(
      createVideoJobRepository(missingVisual as never).loadSource('loc'),
    ).rejects.toThrow('visuals are not complete');
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

  it('reaps notification rows and finds localization jobs', async () => {
    const supabase = makeSupabase();
    const repository = createVideoJobRepository(supabase as never);

    supabase.rpc.mockResolvedValueOnce({
      data: [
        {
          episode_localization_id: 'loc-1',
          telegram_chat_id: 'chat-1',
          episode_id: 'episode-1',
          last_error: 'filming failed',
        },
        {
          episode_localization_id: 'loc-2',
          telegram_chat_id: null,
          episode_id: 'episode-2',
          last_error: null,
        },
      ],
      error: null,
    });
    await expect(repository.reapFailedNotifications()).resolves.toEqual([
      {
        episodeLocalizationId: 'loc-1',
        telegramChatId: 'chat-1',
        episodeId: 'episode-1',
        lastError: 'filming failed',
      },
    ]);

    supabase.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(repository.markFailureNotified('loc-1')).resolves.toBe(true);

    supabase.query.maybeSingle.mockResolvedValueOnce({
      data: jobRow(),
      error: null,
    });
    await expect(repository.find('loc-1')).resolves.toEqual(jobRow());
    expect(supabase.from).toHaveBeenLastCalledWith('episode_videos');
  });
});

describe('createVideoVisualJobRepository', () => {
  it('maps the visual lifecycle RPC parameters and rows', async () => {
    const supabase = makeSupabase();
    const repository = createVideoVisualJobRepository(supabase as never);
    const processing = visualJobRow({
      status: 'processing',
      attempt_count: 1,
      lease_owner: 'visual-worker',
    });
    supabase.rpc
      .mockResolvedValueOnce({ data: [visualJobRow()], error: null })
      .mockResolvedValueOnce({ data: [processing], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [visualJobRow({ status: 'failed', attempt_count: 3 })],
        error: null,
      });

    await expect(
      repository.enqueue('episode-1', {
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: 'source-hash',
        telegramChatId: 'chat-1',
      }),
    ).resolves.toEqual(visualJobRow());
    await expect(repository.claim('visual-worker')).resolves.toEqual(
      processing,
    );
    await expect(
      repository.renewLease('episode-1', 'visual-worker'),
    ).resolves.toBe(true);
    await expect(
      repository.complete('episode-1', 'visual-worker', {
        visualPayload: {
          schemaVersion: EPISODE_VIDEO_VISUAL_VERSION,
          scenes: [],
        },
        visualHash: 'visual-hash',
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: 'source-hash',
        r2Prefix: 'episodes/episode-1/video-visuals',
      }),
    ).resolves.toBe(true);
    await expect(
      repository.fail('episode-1', 'visual-worker', 'visual search failed'),
    ).resolves.toEqual(visualJobRow({ status: 'failed', attempt_count: 3 }));

    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      'enqueue_episode_video_visual',
      {
        p_episode_id: 'episode-1',
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        p_source_hash: 'source-hash',
        p_telegram_chat_id: 'chat-1',
      },
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      4,
      'complete_episode_video_visual',
      {
        p_episode_id: 'episode-1',
        p_lease_owner: 'visual-worker',
        p_visual_payload: {
          schemaVersion: EPISODE_VIDEO_VISUAL_VERSION,
          scenes: [],
        },
        p_visual_hash: 'visual-hash',
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        p_source_hash: 'source-hash',
        p_r2_prefix: 'episodes/episode-1/video-visuals',
      },
    );
  });

  it('loads canonical audio plus completed English search context', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle
      .mockResolvedValueOnce({ data: localizationRow(), error: null })
      .mockResolvedValueOnce({ data: englishLocalizationRow(), error: null })
      .mockResolvedValueOnce({ data: episodeRow(), error: null });

    await expect(
      createVideoVisualJobRepository(supabase as never).loadSource('episode-1'),
    ).resolves.toEqual({
      episodeId: 'episode-1',
      canonicalLocalizationId: 'localization-1',
      title: 'Episode',
      script: 'Canonical script',
      englishTitle: 'English episode',
      englishScript: 'English script',
      hlsUrl: 'https://cdn.example.com/audio.m3u8',
      sourceUrl: 'https://example.com/article',
      sourceTitle: 'Article',
    });
    expect(supabase.query.eq).toHaveBeenCalledWith('language_code', 'zh-Hant');
    expect(supabase.query.eq).toHaveBeenCalledWith('language_code', 'en');
  });

  it('rejects English search context without completed main audio', async () => {
    const supabase = makeSupabase();
    supabase.query.maybeSingle
      .mockResolvedValueOnce({ data: localizationRow(), error: null })
      .mockResolvedValueOnce({
        data: englishLocalizationRow({ hls_url: ' ' }),
        error: null,
      });

    await expect(
      createVideoVisualJobRepository(supabase as never).loadSource('episode-1'),
    ).rejects.toThrow('not renderable');
  });

  it('finds visual jobs and reports missing enqueue rows', async () => {
    const supabase = makeSupabase();
    const repository = createVideoVisualJobRepository(supabase as never);
    supabase.query.maybeSingle.mockResolvedValueOnce({
      data: visualJobRow(),
      error: null,
    });
    await expect(repository.find('episode-1')).resolves.toEqual(visualJobRow());
    expect(supabase.from).toHaveBeenCalledWith('episode_video_visuals');

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      repository.enqueue('episode-1', {
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: 'source-hash',
      }),
    ).rejects.toThrow('returned no job');
  });
});

describe('hashEpisodeVideoVisualSource', () => {
  it('changes when either canonical or English search script changes', () => {
    const original = hashEpisodeVideoVisualSource(
      'Canonical script',
      'English script',
    );
    expect(original).toBe(
      hashEpisodeVideoVisualSource('Canonical script', 'English script'),
    );
    expect(original).not.toBe(
      hashEpisodeVideoVisualSource('Changed canonical', 'English script'),
    );
    expect(original).not.toBe(
      hashEpisodeVideoVisualSource('Canonical script', 'Changed English'),
    );
  });
});
