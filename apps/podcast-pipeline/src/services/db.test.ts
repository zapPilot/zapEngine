import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classroomRow,
  episodeRow,
  feedRow,
  listRow,
  localizationRow,
} from '../__fixtures__/index-test.js';
import type { NewSocialPost, NewSocialPostMetric } from '../types.js';
import {
  decodeCursor,
  encodeCursor,
  findEpisodeById,
  findEpisodeBySourceUrl,
  findEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId,
  getSocialPostById,
  insertEpisode,
  insertEpisodeLocalization,
  insertSocialPost,
  insertSocialPostMetric,
  listEpisodeFeedPaged,
  listEpisodeLocalizationsByEpisodeId,
  listEpisodes,
  listEpisodesPaged,
  listEpisodeVideoSummariesByLocalizationIds,
  listLanguageClassroomsByLocalizationId,
  listLanguageClassroomsByLocalizationIds,
  listPublishedEpisodeCatalog,
  listSocialPostsByEpisode,
  toEpisodeResponse,
  toEpisodeResponseFromLocalization,
  toLanguageClassroomLesson,
  toSocialPostInsertPayload,
  toSocialPostMetricInsertPayload,
  updateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus,
  upsertLanguageClassrooms,
} from './db.js';

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
    throw new Error(`Unknown env: ${key}`);
  }),
}));

const { state, mockFrom } = vi.hoisted(() => {
  const state: {
    query: ReturnType<typeof makeQuery> | null;
    queryByTable: Record<string, ReturnType<typeof makeQuery>>;
  } = { query: null, queryByTable: {} };
  // Most tests touch a single table and share `state.query`. A test whose call
  // spans two tables registers a per-table stub, so the two responses cannot
  // collide the way one shared mock would.
  const mockFrom = vi.fn(
    (table: string) => state.queryByTable[table] ?? state.query,
  );
  return { state, mockFrom };
});

const DB_CLASSROOM_ROW_DEFAULTS = {
  id: 'classroom-1',
  episode_localization_id: 'loc-1',
  one_liner: 'この記事は流動性を説明します。',
} as const;

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    or: vi.fn(() => query),
    insert: vi.fn(() => query),
    upsert: vi.fn(() => query),
    update: vi.fn(() => query),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    returns: vi.fn(),
  };
  query.returns.mockResolvedValue({ data: [], error: null });
  query.single.mockResolvedValue({ data: null, error: null });
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  return query;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.query = makeQuery();
  state.queryByTable = {};
});

describe('toEpisodeResponse', () => {
  it('maps a localization view row and embedded classroom lessons', () => {
    const row = listRow({
      classroom_hls_url:
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
      language_classrooms: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は流動性を説明します。',
          keywords: [
            {
              term: '流動性',
              reading: 'りゅうどうせい',
              meaning: '資金進出市場的容易程度',
              note: null,
            },
          ],
        },
      ],
    });

    const response = toEpisodeResponse(row);

    expect(response).toEqual({
      id: row.episode_id,
      localizationId: row.localization_id,
      title: row.title,
      languageCode: 'zh-Hant',
      hlsUrl: row.hls_url,
      audioTracks: [
        {
          languageCode: 'zh-Hant',
          title: row.title,
          hlsUrl: row.hls_url,
          classroomHlsUrl:
            'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        },
      ],
      createdAt: row.created_at,
      script: row.script,
      llmModel: row.llm_model,
      llmThinkingModel: row.llm_thinking_model,
      llmProvider: row.llm_provider,
      status: row.status,
      video: null,
      videoGeneration: null,
      languageClassrooms: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は流動性を説明します。',
          keywords: [
            {
              term: '流動性',
              reading: 'りゅうどうせい',
              meaning: '資金進出市場的容易程度',
              note: null,
            },
          ],
        },
      ],
    });
  });

  it('maps an episode and localization directly without classroom rows', () => {
    const episode = episodeRow({ listened: true });
    const localization = localizationRow({
      classroom_hls_url:
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
    });

    expect(toEpisodeResponseFromLocalization(episode, localization)).toEqual({
      id: episode.id,
      localizationId: localization.id,
      title: localization.title,
      languageCode: localization.language_code,
      hlsUrl: localization.hls_url,
      audioTracks: [
        {
          languageCode: localization.language_code,
          title: localization.title,
          hlsUrl: localization.hls_url,
          classroomHlsUrl: localization.classroom_hls_url,
        },
      ],
      createdAt: episode.created_at,
      script: localization.script,
      llmModel: localization.llm_model,
      llmThinkingModel: localization.llm_thinking_model,
      llmProvider: localization.llm_provider,
      status: localization.status,
      video: null,
      videoGeneration: null,
      languageClassrooms: [],
    });
  });

  it('maps direct localization rows with explicit classrooms', () => {
    const response = toEpisodeResponseFromLocalization(
      episodeRow(),
      localizationRow({ classroom_hls_url: null }),
      [classroomRow(DB_CLASSROOM_ROW_DEFAULTS)],
    );

    expect(response.languageClassrooms).toEqual([
      {
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は流動性を説明します。',
        keywords: [],
      },
    ]);
  });

  it('uses inline list-row classrooms when no explicit classrooms are supplied', () => {
    const response = toEpisodeResponse(
      listRow({
        classroom_hls_url: null,
        language_classrooms: [
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'en',
            oneLiner: 'This article explains liquidity.',
            keywords: [],
          },
        ],
      }),
    );

    expect(response.languageClassrooms).toEqual([
      {
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'en',
        oneLiner: 'This article explains liquidity.',
        keywords: [],
      },
    ]);
  });

  it('ignores non-array inline classroom payloads on list rows', () => {
    const response = toEpisodeResponse(
      listRow({
        classroom_hls_url: null,
        language_classrooms: null as never,
      }),
    );

    expect(response.languageClassrooms).toEqual([]);
  });

  it('maps an explicitly completed video and generation summary into the public response', () => {
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    const videoGeneration = {
      status: 'completed' as const,
      updatedAt: '2026-07-24T00:00:00.000Z',
      progressPercent: 100,
      stage: null,
    };

    expect(
      toEpisodeResponse(
        listRow({ classroom_hls_url: null }),
        undefined,
        video,
        videoGeneration,
      ),
    ).toMatchObject({
      video,
      videoGeneration,
    });
  });

  it('normalizes a camel-case classroom lesson input', () => {
    expect(
      toLanguageClassroomLesson({
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は市場流動性を説明します。',
        keywords: [
          {
            term: ' 流動性 ',
            reading: ' ',
            meaning: ' 資金流動性 ',
            note: ' ',
          },
          { term: '', reading: null, meaning: 'invalid', note: null },
        ],
      }),
    ).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: 'この記事は市場流動性を説明します。',
      keywords: [
        {
          term: '流動性',
          reading: null,
          meaning: '資金流動性',
          note: null,
        },
      ],
    });
  });

  it('normalizes a snake-case classroom lesson row from database', () => {
    expect(
      toLanguageClassroomLesson({
        id: 'classroom-1',
        episode_localization_id: 'loc-1',
        source_language_code: 'zh-Hant',
        target_language_code: 'en',
        one_liner: 'Hello world',
        keywords: [],
        llm_model: 'model',
        llm_thinking_model: null,
        llm_provider: 'provider',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'en',
      oneLiner: 'Hello world',
      keywords: [],
    });
  });
});

describe('episode source and localization lookup', () => {
  it('finds an episode by source URL without language filtering', async () => {
    const row = episodeRow();
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await findEpisodeBySourceUrl('https://example.com/article');

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-key',
      expect.objectContaining({
        db: { schema: 'from_fed_to_chain' },
      }),
    );
    expect(mockFrom).toHaveBeenCalledWith('episodes');
    expect(state.query!.eq).toHaveBeenCalledWith(
      'source_url',
      'https://example.com/article',
    );
    expect(state.query!.eq).toHaveBeenCalledTimes(1);
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when source lookup fails', async () => {
    const error = new Error('lookup failed');
    state.query!.maybeSingle.mockResolvedValue({ data: null, error });

    await expect(
      findEpisodeBySourceUrl('https://example.com/article'),
    ).rejects.toThrow('lookup failed');
  });

  it('finds an episode directly by id and surfaces lookup errors', async () => {
    const row = episodeRow();
    state.query!.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    await expect(findEpisodeById(row.id)).resolves.toEqual(row);

    state.query!.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: new Error('episode id lookup failed'),
    });
    await expect(findEpisodeById('episode-1')).rejects.toThrow(
      'episode id lookup failed',
    );
  });

  it('finds an episode localization by episode id and language', async () => {
    const row = localizationRow({ classroom_hls_url: null });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await findEpisodeLocalizationByEpisodeId(
      row.episode_id,
      'zh-Hant',
    );

    expect(mockFrom).toHaveBeenCalledWith('episode_localizations');
    expect(state.query!.eq).toHaveBeenCalledWith('episode_id', row.episode_id);
    expect(state.query!.eq).toHaveBeenCalledWith('language_code', 'zh-Hant');
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when localization lookup fails', async () => {
    state.query!.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error('localization lookup failed'),
    });

    await expect(
      findEpisodeLocalizationByEpisodeId('episode-1', 'zh-Hant'),
    ).rejects.toThrow('localization lookup failed');
  });

  it('lists requested localizations for an episode in one query', async () => {
    const rows = [
      localizationRow({ classroom_hls_url: null }),
      localizationRow({
        id: '00000000-0000-4000-8000-000000000003',
        language_code: 'ja',
        classroom_hls_url: null,
      }),
    ];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    await expect(
      listEpisodeLocalizationsByEpisodeId(rows[0]!.episode_id, [
        'zh-Hant',
        'ja',
        'zh-Hant',
      ]),
    ).resolves.toEqual(rows);

    expect(mockFrom).toHaveBeenCalledWith('episode_localizations');
    expect(state.query!.eq).toHaveBeenCalledWith(
      'episode_id',
      rows[0]!.episode_id,
    );
    expect(state.query!.in).toHaveBeenCalledWith('language_code', [
      'zh-Hant',
      'ja',
    ]);
  });

  it('skips the database for an empty localization language list', async () => {
    await expect(
      listEpisodeLocalizationsByEpisodeId('episode-1', []),
    ).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws Supabase errors when localization listing fails', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('localization list failed'),
    });

    await expect(
      listEpisodeLocalizationsByEpisodeId('episode-1', ['en']),
    ).rejects.toThrow('localization list failed');
  });

  it('normalizes null localization-list data to an empty array', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });
    await expect(
      listEpisodeLocalizationsByEpisodeId('episode-1', ['en']),
    ).resolves.toEqual([]);
  });

  it('finds a completed feed row by localization id', async () => {
    const row = listRow({ classroom_hls_url: null });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    await expect(
      findEpisodeListRowByLocalizationId(row.localization_id),
    ).resolves.toEqual(row);
    expect(mockFrom).toHaveBeenCalledWith('episodes_with_stats');
    expect(state.query!.eq).toHaveBeenCalledWith(
      'localization_id',
      row.localization_id,
    );
  });

  it('throws Supabase errors when feed lookup fails', async () => {
    state.query!.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error('feed lookup failed'),
    });

    await expect(
      findEpisodeListRowByLocalizationId('localization-1'),
    ).rejects.toThrow('feed lookup failed');
  });
});

describe('listPublishedEpisodeCatalog', () => {
  it('treats null catalog page data as an empty final page', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });
    await expect(listPublishedEpisodeCatalog()).resolves.toEqual({
      'zh-Hant': [],
      ja: [],
      en: [],
    });
  });

  it('returns the fixed empty catalog after a single page', async () => {
    state.query!.returns.mockResolvedValue({ data: [], error: null });

    await expect(listPublishedEpisodeCatalog()).resolves.toEqual({
      'zh-Hant': [],
      ja: [],
      en: [],
    });
    expect(mockFrom).toHaveBeenCalledWith('episodes_with_stats');
    expect(state.query!.select).toHaveBeenCalledWith(
      'localization_id,language_code',
    );
    expect(state.query!.order).toHaveBeenCalledWith('localization_id', {
      ascending: true,
    });
    expect(state.query!.limit).toHaveBeenCalledWith(1_000);
    expect(state.query!.gt).not.toHaveBeenCalled();
  });

  it('groups localization ids under the three supported language keys', async () => {
    state.query!.returns.mockResolvedValue({
      data: [
        { localization_id: 'localization-1', language_code: 'zh-Hant' },
        { localization_id: 'localization-2', language_code: 'ja' },
        { localization_id: 'localization-3', language_code: 'en' },
        { localization_id: 'localization-4', language_code: 'fr' },
      ],
      error: null,
    });

    await expect(listPublishedEpisodeCatalog()).resolves.toEqual({
      'zh-Hant': ['localization-1'],
      ja: ['localization-2'],
      en: ['localization-3'],
    });
  });

  it('continues from the last localization id after a full page', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      localization_id: `localization-${String(index).padStart(4, '0')}`,
      language_code: 'en',
    }));
    const finalRow = {
      localization_id: 'localization-1000',
      language_code: 'ja',
    };
    state
      .query!.returns.mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [finalRow], error: null });

    const catalog = await listPublishedEpisodeCatalog();

    expect(catalog.en).toEqual(firstPage.map((row) => row.localization_id));
    expect(catalog.ja).toEqual([finalRow.localization_id]);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(state.query!.gt).toHaveBeenCalledOnce();
    expect(state.query!.gt).toHaveBeenCalledWith(
      'localization_id',
      firstPage[999]!.localization_id,
    );
  });

  it('throws Supabase errors from catalog listing', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('catalog failed'),
    });

    await expect(listPublishedEpisodeCatalog()).rejects.toThrow(
      'catalog failed',
    );
  });
});

describe('cursor helpers', () => {
  it('round-trips a cursor', () => {
    const cursor = {
      t: '2024-01-01T00:00:00.000Z',
      i: '00000000-0000-4000-8000-000000000001',
    };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects invalid cursor payloads', () => {
    expect(() => decodeCursor('garbage')).toThrow();
    expect(() =>
      decodeCursor(
        encodeCursor({
          t: 'not-a-date',
          i: '00000000-0000-4000-8000-000000000001',
        }),
      ),
    ).toThrow('bad cursor ts');
    expect(() =>
      decodeCursor(
        encodeCursor({
          t: '2024-01-01T00:00:00.000Z',
          i: 'not-a-uuid',
        }),
      ),
    ).toThrow('bad cursor id');
  });

  it('rejects cursor with non-string t or i fields', () => {
    const badCursorT = Buffer.from(
      JSON.stringify({ t: 123, i: '00000000-0000-4000-8000-000000000001' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(badCursorT)).toThrow('bad cursor shape');

    const badCursorI = Buffer.from(
      JSON.stringify({ t: '2024-01-01T00:00:00.000Z', i: 456 }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(badCursorI)).toThrow('bad cursor shape');
  });
});

describe('listEpisodesPaged', () => {
  it('returns an empty list when the list view has no rows', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });

    await expect(listEpisodes()).resolves.toEqual([]);
  });

  it('throws Supabase errors when list view lookup fails', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('list failed'),
    });

    await expect(listEpisodes()).rejects.toThrow('list failed');
  });

  it('queries the localization view by language and returns next cursor', async () => {
    const rows = [
      listRow({
        id: '00000000-0000-4000-8000-000000000001',
        classroom_hls_url: null,
      }),
    ];
    state.query!.returns.mockResolvedValue({
      data: [...rows, listRow({ classroom_hls_url: null })],
      error: null,
    });

    const result = await listEpisodesPaged(1, null, 'zh-Hant');

    expect(mockFrom).toHaveBeenCalledWith('episodes_with_stats');
    expect(state.query!.eq).toHaveBeenCalledWith('language_code', 'zh-Hant');
    expect(state.query!.limit).toHaveBeenCalledWith(2);
    expect(result.rows).toEqual(rows);
    expect(result.nextCursor).toBe(
      encodeCursor({ t: rows[0]!.created_at, i: rows[0]!.id }),
    );
  });

  it('returns rows without a cursor when there is no next page', async () => {
    const rows = [listRow({ classroom_hls_url: null })];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    const result = await listEpisodesPaged(100, null);

    expect(state.query!.eq).not.toHaveBeenCalledWith(
      'language_code',
      expect.any(String),
    );
    expect(result).toEqual({ rows, nextCursor: null });
  });

  it('returns an empty page when paged list data is null', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });

    await expect(listEpisodesPaged(20, null)).resolves.toEqual({
      rows: [],
      nextCursor: null,
    });
  });

  it('applies cursor filtering on subsequent pages', async () => {
    const cursor = {
      t: '2024-01-01T00:00:00.000Z',
      i: '00000000-0000-4000-8000-000000000001',
    };
    state.query!.returns.mockResolvedValue({ data: [], error: null });

    await listEpisodesPaged(20, cursor, 'zh-Hant');

    expect(state.query!.or).toHaveBeenCalledWith(
      `created_at.lt.${cursor.t},and(created_at.eq.${cursor.t},id.lt.${cursor.i})`,
    );
  });

  it('throws Supabase errors from paged list lookup', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('paged list failed'),
    });

    await expect(listEpisodesPaged(20, null)).rejects.toThrow(
      'paged list failed',
    );
  });

  it('keeps the search corpus loader on the full projection', async () => {
    state.query!.returns.mockResolvedValue({ data: [], error: null });

    await listEpisodesPaged(20, null, 'zh-Hant');

    expect(state.query!.select).toHaveBeenCalledWith('*');
  });
});

describe('listEpisodeFeedPaged', () => {
  it('selects only feed columns, never script or classroom JSONB', async () => {
    state.query!.returns.mockResolvedValue({ data: [], error: null });

    await listEpisodeFeedPaged(20, null, 'zh-Hant');

    expect(mockFrom).toHaveBeenCalledWith('episodes_with_stats');
    expect(state.query!.select).toHaveBeenCalledWith(
      'id,episode_id,localization_id,title,language_code,hls_url,classroom_hls_url,llm_model,llm_thinking_model,llm_provider,status,created_at',
    );
    expect(state.query!.eq).toHaveBeenCalledWith('language_code', 'zh-Hant');
  });

  it('pages feed rows with the same cursor contract as the full listing', async () => {
    const rows = [
      feedRow({ id: '00000000-0000-4000-8000-000000000001' }),
      feedRow({ id: '00000000-0000-4000-8000-000000000002' }),
    ];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    const result = await listEpisodeFeedPaged(1, null);

    expect(result.rows).toEqual([rows[0]]);
    expect(result.nextCursor).toBe(
      encodeCursor({ t: rows[0]!.created_at, i: rows[0]!.id }),
    );
  });
});

describe('listEpisodeVideoSummariesByLocalizationIds', () => {
  it('loads public status summaries in one batch without selecting failure details', async () => {
    state.query!.returns.mockResolvedValue({
      data: [
        {
          episode_localization_id: 'loc-1',
          episode_id: 'episode-loc-1',
          progress_percent: null,
          progress_stage: null,
          status: 'completed',
          updated_at: '2026-07-24T00:00:00.000Z',
          mp4_url: ' https://cdn.example.com/video.mp4 ',
          thumbnail_url: ' https://cdn.example.com/thumbnail.png ',
          duration_seconds: 90.5,
        },
        {
          episode_localization_id: 'loc-completed-broken',
          episode_id: 'episode-loc-completed-broken',
          progress_percent: null,
          progress_stage: null,
          status: 'completed',
          updated_at: '2026-07-24T01:00:00.000Z',
          mp4_url: null,
          thumbnail_url: 'https://cdn.example.com/thumbnail.png',
          duration_seconds: 90,
        },
        {
          episode_localization_id: 'loc-processing',
          episode_id: 'episode-loc-processing',
          progress_percent: null,
          progress_stage: null,
          status: 'processing',
          updated_at: '2026-07-24T02:00:00.000Z',
          mp4_url: 'https://cdn.example.com/stale-video.mp4',
          thumbnail_url: 'https://cdn.example.com/stale-thumbnail.png',
          duration_seconds: 45,
        },
        {
          episode_localization_id: 'loc-failed',
          episode_id: 'episode-loc-failed',
          progress_percent: null,
          progress_stage: null,
          status: 'failed',
          updated_at: null,
          mp4_url: null,
          thumbnail_url: null,
          duration_seconds: null,
          last_error: 'internal ffmpeg detail',
        },
        {
          episode_localization_id: 'loc-unknown',
          episode_id: 'episode-loc-unknown',
          progress_percent: null,
          progress_stage: null,
          status: 'rendering',
          updated_at: '2026-07-24T03:00:00.000Z',
          mp4_url: null,
          thumbnail_url: null,
          duration_seconds: null,
        },
      ],
      error: null,
    });

    const result = await listEpisodeVideoSummariesByLocalizationIds([
      'loc-1',
      'loc-1',
      'loc-completed-broken',
      'loc-processing',
      'loc-failed',
      'loc-unknown',
    ]);

    expect(mockFrom).toHaveBeenCalledWith('episode_videos');
    expect(state.query!.select).toHaveBeenCalledWith(
      'episode_localization_id, episode_id, status, progress_percent, progress_stage, updated_at, mp4_url, thumbnail_url, duration_seconds',
    );
    expect(state.query!.eq).not.toHaveBeenCalled();
    expect(state.query!.in).toHaveBeenCalledWith('episode_localization_id', [
      'loc-1',
      'loc-completed-broken',
      'loc-processing',
      'loc-failed',
      'loc-unknown',
    ]);
    expect(result).toEqual(
      new Map([
        [
          'loc-1',
          {
            video: {
              url: 'https://cdn.example.com/video.mp4',
              thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
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
        [
          'loc-completed-broken',
          {
            video: null,
            videoGeneration: {
              status: 'completed',
              updatedAt: '2026-07-24T01:00:00.000Z',
              progressPercent: 100,
              stage: null,
            },
          },
        ],
        [
          'loc-processing',
          {
            video: null,
            videoGeneration: {
              status: 'processing',
              updatedAt: '2026-07-24T02:00:00.000Z',
              progressPercent: 40,
              stage: null,
            },
          },
        ],
        [
          'loc-failed',
          {
            video: null,
            videoGeneration: {
              status: 'failed',
              updatedAt: null,
              progressPercent: 40,
              stage: null,
            },
          },
        ],
      ]),
    );
    expect(result.has('loc-unknown')).toBe(false);
    expect(JSON.stringify([...result.values()])).not.toContain('last_error');
  });

  it('does not query Supabase for an empty localization list', async () => {
    await expect(
      listEpisodeVideoSummariesByLocalizationIds([]),
    ).resolves.toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('treats null video-summary data as an empty batch', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });
    await expect(
      listEpisodeVideoSummariesByLocalizationIds(['loc-1']),
    ).resolves.toEqual(new Map());
  });

  it('throws visual progress errors and ignores non-public visual rows', async () => {
    state.queryByTable['episode_videos'] = makeQuery();
    state.queryByTable['episode_videos'].returns.mockResolvedValue({
      data: [videoRow({ status: 'queued' })],
      error: null,
    });
    state.queryByTable['episode_video_visuals'] = makeQuery();
    state.queryByTable['episode_video_visuals'].returns.mockResolvedValueOnce({
      data: null,
      error: new Error('visual progress lookup failed'),
    });
    await expect(
      listEpisodeVideoSummariesByLocalizationIds(['loc-1']),
    ).rejects.toThrow('visual progress lookup failed');

    state.queryByTable['episode_video_visuals'].returns.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    await expect(
      listEpisodeVideoSummariesByLocalizationIds(['loc-1']),
    ).resolves.toBeInstanceOf(Map);

    state.queryByTable['episode_video_visuals'].returns.mockResolvedValueOnce({
      data: [
        {
          episode_id: 'episode-loc-1',
          status: 'rendering',
          progress_percent: 10,
          progress_stage: 'future-stage',
          updated_at: null,
        },
      ],
      error: null,
    });
    await expect(
      listEpisodeVideoSummariesByLocalizationIds(['loc-1']),
    ).resolves.toBeInstanceOf(Map);
  });

  it('throws video-summary lookup errors', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('video lookup failed'),
    });

    await expect(
      listEpisodeVideoSummariesByLocalizationIds(['loc-1']),
    ).rejects.toThrow('video lookup failed');
  });

  it('scales a processing render into the upper band of the bar', async () => {
    state.query!.returns.mockResolvedValue({
      data: [
        videoRow({
          status: 'processing',
          progress_percent: 64,
          progress_stage: 'encoding',
        }),
      ],
      error: null,
    });

    const result = await listEpisodeVideoSummariesByLocalizationIds(['loc-1']);

    expect(result.get('loc-1')?.videoGeneration).toEqual({
      status: 'processing',
      updatedAt: '2026-07-24T02:00:00.000Z',
      progressPercent: 78,
      stage: 'encoding',
    });
    // A processing render is self-sufficient, so the visual table is untouched.
    expect(mockFrom).not.toHaveBeenCalledWith('episode_video_visuals');
  });

  it('reports the shared visual phase while the render row is still queued', async () => {
    // This is the case the whole design turns on: the slow image search runs on
    // the episode-scoped visual job, and this localization's render row will not
    // leave 'queued' until that finishes. Reading only the render row would show
    // 0% for the longest part of the wait.
    state.queryByTable['episode_videos'] = makeQuery();
    state.queryByTable['episode_videos'].returns.mockResolvedValue({
      data: [
        videoRow({ status: 'queued', updated_at: '2026-07-24T02:00:00.000Z' }),
      ],
      error: null,
    });
    state.queryByTable['episode_video_visuals'] = makeQuery();
    state.queryByTable['episode_video_visuals'].returns.mockResolvedValue({
      data: [
        {
          episode_id: 'episode-loc-1',
          status: 'processing',
          progress_percent: 52,
          progress_stage: 'selecting-images',
          updated_at: '2026-07-24T02:30:00.000Z',
        },
      ],
      error: null,
    });

    const result = await listEpisodeVideoSummariesByLocalizationIds(['loc-1']);

    expect(result.get('loc-1')?.videoGeneration).toEqual({
      status: 'queued',
      // The visual row is the fresher of the two; using the untouched render
      // row's timestamp would freeze the client's own freshness check.
      updatedAt: '2026-07-24T02:30:00.000Z',
      progressPercent: 22,
      stage: 'selecting-images',
    });
    expect(state.queryByTable['episode_video_visuals'].in).toHaveBeenCalledWith(
      'episode_id',
      ['episode-loc-1'],
    );
  });

  it('parks a queued render at the hand-off point once the visual checkpoint lands', async () => {
    state.queryByTable['episode_videos'] = makeQuery();
    state.queryByTable['episode_videos'].returns.mockResolvedValue({
      data: [videoRow({ status: 'queued' })],
      error: null,
    });
    state.queryByTable['episode_video_visuals'] = makeQuery();
    state.queryByTable['episode_video_visuals'].returns.mockResolvedValue({
      data: [
        {
          episode_id: 'episode-loc-1',
          status: 'completed',
          progress_percent: 100,
          progress_stage: null,
          updated_at: '2026-07-24T02:30:00.000Z',
        },
      ],
      error: null,
    });

    const result = await listEpisodeVideoSummariesByLocalizationIds(['loc-1']);

    expect(result.get('loc-1')?.videoGeneration).toMatchObject({
      progressPercent: 40,
      stage: 'waiting-for-renderer',
    });
  });

  function videoRow(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      episode_localization_id: 'loc-1',
      episode_id: 'episode-loc-1',
      status: 'processing',
      progress_percent: null,
      progress_stage: null,
      updated_at: '2026-07-24T02:00:00.000Z',
      mp4_url: null,
      thumbnail_url: null,
      duration_seconds: null,
      ...overrides,
    };
  }
});

describe('insertEpisode and insertEpisodeLocalization', () => {
  it('inserts a source episode row', async () => {
    const row = episodeRow();
    state.query!.single.mockResolvedValue({ data: row, error: null });

    const result = await insertEpisode({
      id: row.id,
      sourceUrl: row.source_url,
      sourceTitle: row.source_title ?? '',
    });

    expect(mockFrom).toHaveBeenCalledWith('episodes');
    expect(state.query!.insert).toHaveBeenCalledWith({
      id: row.id,
      source_url: row.source_url,
      source_title: row.source_title,
    });
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when source episode insert fails', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: new Error('insert episode failed'),
    });

    await expect(
      insertEpisode({
        id: 'episode-1',
        sourceUrl: 'https://example.com/article',
        sourceTitle: 'Article',
      }),
    ).rejects.toThrow('insert episode failed');
  });

  it('inserts a localized episode row', async () => {
    const row = localizationRow({ classroom_hls_url: null });
    state.query!.single.mockResolvedValue({ data: row, error: null });

    const result = await insertEpisodeLocalization({
      id: row.id,
      episodeId: row.episode_id,
      languageCode: row.language_code,
      title: row.title,
      hlsUrl: row.hls_url,
      rawText: row.raw_text ?? '',
      script: row.script ?? '',
      llmModel: row.llm_model ?? '',
      llmThinkingModel: row.llm_thinking_model,
      llmProvider: row.llm_provider ?? '',
      ttsLanguageCode: null,
      ttsVoiceName: null,
      r2Prefix: null,
      status: row.status,
    });

    expect(mockFrom).toHaveBeenCalledWith('episode_localizations');
    expect(state.query!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        episode_id: row.episode_id,
        language_code: 'zh-Hant',
      }),
    );
    const insertCalls = state.query!.insert.mock.calls as unknown as [
      Record<string, unknown>,
    ][];
    const payload = insertCalls[0]![0];
    expect(payload).not.toHaveProperty('classroom_hls_url');
    expect(payload).not.toHaveProperty('classroom_r2_prefix');
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when localized episode insert fails', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: new Error('insert localization failed'),
    });

    await expect(
      insertEpisodeLocalization({
        id: 'loc-1',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        title: 'Title',
        hlsUrl: '',
        rawText: 'Raw text',
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    ).rejects.toThrow('insert localization failed');
  });

  it('normalizes PostgREST error objects when localized episode insert fails', async () => {
    const postgrestError = {
      code: 'PGRST204',
      message:
        "Could not find the 'classroom_hls_url' column of 'episode_localizations' in the schema cache",
      details: null,
      hint: "If a new column was added, reload PostgREST's schema cache.",
    };
    state.query!.single.mockResolvedValue({
      data: null,
      error: postgrestError,
    });

    await expect(
      insertEpisodeLocalization({
        id: 'loc-1',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        title: 'Title',
        hlsUrl: '',
        rawText: 'Raw text',
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    ).rejects.toMatchObject({
      cause: postgrestError,
      message: expect.stringContaining('PGRST204'),
    });
  });

  it('includes classroom_hls_url and classroom_r2_prefix when provided', async () => {
    const row = localizationRow({
      classroom_hls_url: 'https://r2.example/classroom.m3u8',
      classroom_r2_prefix: 'episodes/e/localizations/zh-Hant/classroom',
    });
    state.query!.single.mockResolvedValue({ data: row, error: null });

    await insertEpisodeLocalization({
      id: row.id,
      episodeId: row.episode_id,
      languageCode: row.language_code,
      title: row.title,
      hlsUrl: row.hls_url,
      rawText: row.raw_text ?? '',
      script: row.script ?? '',
      llmModel: row.llm_model ?? '',
      llmThinkingModel: row.llm_thinking_model,
      llmProvider: row.llm_provider ?? '',
      ttsLanguageCode: null,
      ttsVoiceName: null,
      r2Prefix: null,
      status: row.status,
      classroomHlsUrl: row.classroom_hls_url,
      classroomR2Prefix: row.classroom_r2_prefix,
    });

    const insertCalls = state.query!.insert.mock.calls as unknown as [
      Record<string, unknown>,
    ][];
    const payload = insertCalls[0]![0];
    expect(payload).toMatchObject({
      classroom_hls_url: 'https://r2.example/classroom.m3u8',
      classroom_r2_prefix: 'episodes/e/localizations/zh-Hant/classroom',
    });
  });

  it('formats record errors with details and the fallback message string', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST116',
        // No `message` field, exercises the 'Supabase request failed' fallback
        details: 'Row not found',
        hint: 'Reload schema cache',
      },
    });

    await expect(
      insertEpisodeLocalization({
        id: 'loc-1',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        title: 'Title',
        hlsUrl: '',
        rawText: 'Raw text',
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Supabase request failed'),
    });
  });

  it('formats record errors without a code or hint using the bare message', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: { message: 'localization write rejected' },
    });

    await expect(
      insertEpisodeLocalization({
        id: 'loc-1',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        title: 'Title',
        hlsUrl: '',
        rawText: 'Raw text',
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    ).rejects.toMatchObject({
      message: 'localization write rejected',
    });
  });

  it('stringifies non-record errors when normalizing a Supabase failure', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: 'plain string failure',
    });

    await expect(
      insertEpisodeLocalization({
        id: 'loc-1',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        title: 'Title',
        hlsUrl: '',
        rawText: 'Raw text',
        script: '',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
        ttsLanguageCode: null,
        ttsVoiceName: null,
        r2Prefix: null,
        status: 'pending',
      }),
    ).rejects.toMatchObject({
      message: 'plain string failure',
    });
  });
});

describe('social post telemetry', () => {
  const newPost: NewSocialPost = {
    episodeId: 'episode-1',
    platform: 'threads',
    postUrl: null,
    platformPostId: 'threads-post-1',
    publishedAt: '2026-08-15T02:00:00.000Z',
    topic: 'technology',
    hookType: 'question',
    generatedTitle: null,
    publishedTitle: null,
    generatedBody: 'AI 原稿',
    publishedBody: '人工確認後的實發稿',
    hashtags: [],
    videoDurationSec: null,
    contentFeatures: {
      containsQuestion: true,
      containsNumber: false,
      titleChars: null,
      bodyChars: 9,
      hashtagCount: 0,
    },
    llmModel: 'test/model',
  };

  it('maps and inserts a social post using database column names', async () => {
    const payload = {
      episode_id: 'episode-1',
      platform: 'threads',
      post_url: null,
      platform_post_id: 'threads-post-1',
      published_at: '2026-08-15T02:00:00.000Z',
      topic: 'technology',
      hook_type: 'question',
      generated_title: null,
      published_title: null,
      generated_body: 'AI 原稿',
      published_body: '人工確認後的實發稿',
      hashtags: [],
      video_duration_sec: null,
      content_features: newPost.contentFeatures,
      llm_model: 'test/model',
    };
    const row = {
      id: 'social-post-1',
      ...payload,
      created_at: '2026-08-15T02:00:01.000Z',
      updated_at: '2026-08-15T02:00:01.000Z',
    };
    state.query!.single.mockResolvedValue({ data: row, error: null });

    expect(toSocialPostInsertPayload(newPost)).toEqual(payload);
    await expect(insertSocialPost(newPost)).resolves.toEqual(row);
    expect(mockFrom).toHaveBeenCalledWith('social_posts');
    expect(state.query!.insert).toHaveBeenCalledWith(payload);
  });

  it('throws a Supabase error when social post persistence fails', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: new Error('insert social post failed'),
    });

    await expect(insertSocialPost(newPost)).rejects.toThrow(
      'insert social post failed',
    );
  });

  it('lists one episode-platform pair newest first', async () => {
    const rows = [{ id: 'social-post-2' }, { id: 'social-post-1' }];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    await expect(
      listSocialPostsByEpisode('episode-1', 'threads'),
    ).resolves.toEqual(rows);
    expect(mockFrom).toHaveBeenCalledWith('social_posts');
    expect(state.query!.eq).toHaveBeenCalledWith('episode_id', 'episode-1');
    expect(state.query!.eq).toHaveBeenCalledWith('platform', 'threads');
    expect(state.query!.order).toHaveBeenCalledWith('published_at', {
      ascending: false,
    });
  });

  it('normalizes null social-post lists and surfaces list errors', async () => {
    state.query!.returns.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      listSocialPostsByEpisode('episode-1', 'threads'),
    ).resolves.toEqual([]);

    state.query!.returns.mockResolvedValueOnce({
      data: null,
      error: new Error('social post list failed'),
    });
    await expect(
      listSocialPostsByEpisode('episode-1', 'threads'),
    ).rejects.toThrow('social post list failed');
  });

  it('returns null for a missing social post id and surfaces lookup errors', async () => {
    state.query!.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getSocialPostById('social-post-9')).resolves.toBeNull();
    expect(state.query!.eq).toHaveBeenCalledWith('id', 'social-post-9');

    state.query!.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: new Error('social post lookup failed'),
    });
    await expect(getSocialPostById('social-post-9')).rejects.toThrow(
      'social post lookup failed',
    );
  });
});

describe('social post metrics', () => {
  const newMetric: NewSocialPostMetric = {
    socialPostId: 'social-post-1',
    capturedAt: '2026-08-16T02:00:00.000Z',
    ageHours: 24,
    views: 1200,
    impressions: null,
    likes: 18,
    comments: 0,
    shares: null,
    saves: null,
    profileVisits: 9,
    followersGained: -1,
  };

  it('maps and inserts a metrics snapshot using database column names', async () => {
    const payload = {
      social_post_id: 'social-post-1',
      captured_at: '2026-08-16T02:00:00.000Z',
      age_hours: 24,
      views: 1200,
      impressions: null,
      likes: 18,
      comments: 0,
      shares: null,
      saves: null,
      profile_visits: 9,
      followers_gained: -1,
    };
    const row = {
      id: 'social-post-metric-1',
      ...payload,
      created_at: '2026-08-16T02:00:01.000Z',
    };
    state.query!.single.mockResolvedValue({ data: row, error: null });

    expect(toSocialPostMetricInsertPayload(newMetric)).toEqual(payload);
    await expect(insertSocialPostMetric(newMetric)).resolves.toEqual(row);
    expect(mockFrom).toHaveBeenCalledWith('social_post_metrics');
    expect(state.query!.insert).toHaveBeenCalledWith(payload);
  });

  it('throws a Supabase error when the metrics insert fails', async () => {
    state.query!.single.mockResolvedValue({
      data: null,
      error: new Error('insert social post metric failed'),
    });

    await expect(insertSocialPostMetric(newMetric)).rejects.toThrow(
      'insert social post metric failed',
    );
  });
});

describe('language classrooms', () => {
  it('does not query classrooms when no localization ids are provided', async () => {
    const result = await listLanguageClassroomsByLocalizationIds([]);

    expect(result).toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists classrooms for one localization id', async () => {
    const rows = [classroomRow(DB_CLASSROOM_ROW_DEFAULTS)];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    await expect(
      listLanguageClassroomsByLocalizationId('loc-1'),
    ).resolves.toEqual(rows);
    expect(state.query!.in).toHaveBeenCalledWith('episode_localization_id', [
      'loc-1',
    ]);
  });

  it('returns an empty classroom list when lookup data is null', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });

    await expect(
      listLanguageClassroomsByLocalizationId('loc-1'),
    ).resolves.toEqual([]);
  });

  it('throws Supabase errors when classroom lookup fails', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('classroom lookup failed'),
    });

    await expect(
      listLanguageClassroomsByLocalizationId('loc-1'),
    ).rejects.toThrow('classroom lookup failed');
  });

  it('does not query classrooms when there are no lessons to upsert', async () => {
    await expect(upsertLanguageClassrooms([])).resolves.toEqual([]);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('groups classrooms by episode localization id', async () => {
    const rows = [
      classroomRow({
        ...DB_CLASSROOM_ROW_DEFAULTS,
        episode_localization_id: 'loc-1',
        target_language_code: 'ja',
      }),
      classroomRow({
        ...DB_CLASSROOM_ROW_DEFAULTS,
        episode_localization_id: 'loc-2',
        target_language_code: 'en',
      }),
    ];
    state.query!.returns.mockResolvedValue({ data: rows, error: null });

    const result = await listLanguageClassroomsByLocalizationIds([
      'loc-1',
      'loc-2',
    ]);

    expect(mockFrom).toHaveBeenCalledWith('language_classrooms');
    expect(state.query!.in).toHaveBeenCalledWith('episode_localization_id', [
      'loc-1',
      'loc-2',
    ]);
    expect(result.get('loc-1')).toEqual([rows[0]]);
    expect(result.get('loc-2')).toEqual([rows[1]]);
  });

  it('returns an empty classroom map when grouped lookup data is null', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });

    await expect(
      listLanguageClassroomsByLocalizationIds(['loc-1']),
    ).resolves.toEqual(new Map());
  });

  it('throws Supabase errors when grouped classroom lookup fails', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('grouped classroom lookup failed'),
    });

    await expect(
      listLanguageClassroomsByLocalizationIds(['loc-1']),
    ).rejects.toThrow('grouped classroom lookup failed');
  });

  it('upserts classrooms keyed by localization and target language', async () => {
    await upsertLanguageClassrooms([
      {
        id: 'ignored',
        episodeLocalizationId: 'loc-1',
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は流動性を説明します。',
        keywords: [],
        llmModel: 'model',
        llmThinkingModel: null,
        llmProvider: 'provider',
      },
    ]);

    expect(state.query!.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          episode_localization_id: 'loc-1',
          source_language_code: 'zh-Hant',
          target_language_code: 'ja',
        }),
      ],
      { onConflict: 'episode_localization_id,target_language_code' },
    );
  });

  it('returns an empty classroom list when upsert data is null', async () => {
    state.query!.returns.mockResolvedValue({ data: null, error: null });

    await expect(
      upsertLanguageClassrooms([
        {
          id: 'ignored',
          episodeLocalizationId: 'loc-1',
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は流動性を説明します。',
          keywords: [],
          llmModel: 'model',
          llmThinkingModel: null,
          llmProvider: 'provider',
        },
      ]),
    ).resolves.toEqual([]);
  });

  it('throws Supabase errors when classroom upsert fails', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('classroom upsert failed'),
    });

    await expect(
      upsertLanguageClassrooms([
        {
          id: 'ignored',
          episodeLocalizationId: 'loc-1',
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は流動性を説明します。',
          keywords: [],
          llmModel: 'model',
          llmThinkingModel: null,
          llmProvider: 'provider',
        },
      ]),
    ).rejects.toThrow('classroom upsert failed');
  });
});

describe('updates', () => {
  it('updates localized article content', async () => {
    const row = localizationRow({
      title: '軟體更新',
      raw_text: '滑鼠',
      classroom_hls_url: null,
    });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await updateEpisodeLocalizationArticleContent(row.id, {
      title: row.title,
      text: row.raw_text ?? '',
    });

    expect(mockFrom).toHaveBeenCalledWith('episode_localizations');
    expect(state.query!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '軟體更新',
        raw_text: '滑鼠',
      }),
    );
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when updating localization content fails', async () => {
    state.query!.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error('update localization failed'),
    });

    await expect(
      updateEpisodeLocalizationArticleContent('loc-1', {
        title: 'Title',
        text: 'Text',
      }),
    ).rejects.toThrow('update localization failed');
  });

  it('updates localized status and generated media fields', async () => {
    const row = localizationRow({
      status: 'completed',
      classroom_hls_url: null,
    });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    await updateEpisodeLocalizationStatus(row.id, 'completed', {
      hlsUrl: 'https://cdn.example.com/playlist.m3u8',
      r2Prefix: 'episodes/e/localizations/zh-Hant',
      classroomHlsUrl:
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
      classroomR2Prefix: 'episodes/e/localizations/zh-Hant/classroom',
      ttsLanguageCode: 'cmn-TW',
      ttsVoiceName: 'cmn-TW-Wavenet-A',
    });

    expect(state.query!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        hls_url: 'https://cdn.example.com/playlist.m3u8',
        r2_prefix: 'episodes/e/localizations/zh-Hant',
        classroom_hls_url:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroom_r2_prefix: 'episodes/e/localizations/zh-Hant/classroom',
        tts_language_code: 'cmn-TW',
        tts_voice_name: 'cmn-TW-Wavenet-A',
      }),
    );
    const updateCalls = state.query!.update.mock.calls as unknown as [
      [Record<string, unknown>],
    ];
    expect(updateCalls[0][0]).not.toHaveProperty('title');
  });

  it('fails closed without retrying when PostgREST has a stale classroom media schema', async () => {
    const staleSchemaError = {
      code: 'PGRST204',
      message:
        "Could not find the 'classroom_hls_url' column of 'episode_localizations' in the schema cache",
      details: null,
      hint: "If a new column was added, reload PostgREST's schema cache.",
    };
    state.query!.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: staleSchemaError,
    });

    await expect(
      updateEpisodeLocalizationStatus('localization-1', 'completed', {
        hlsUrl: 'https://cdn.example.com/playlist.m3u8',
        r2Prefix: 'episodes/e/localizations/zh-Hant/main',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroomR2Prefix: 'episodes/e/localizations/zh-Hant/classroom',
      }),
    ).rejects.toMatchObject({
      cause: staleSchemaError,
      message: expect.stringContaining('PGRST204'),
    });

    expect(state.query!.update).toHaveBeenCalledTimes(1);
    expect(state.query!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        classroom_hls_url:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroom_r2_prefix: 'episodes/e/localizations/zh-Hant/classroom',
      }),
    );
  });

  it('rethrows unrelated update errors without stripping classroom fields', async () => {
    const row = localizationRow({ classroom_hls_url: null });
    state.query!.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: new Error('connection refused'),
    });

    await expect(
      updateEpisodeLocalizationStatus(row.id, 'completed', {
        hlsUrl: 'https://cdn.example.com/playlist.m3u8',
        r2Prefix: 'episodes/e/localizations/zh-Hant/main',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroomR2Prefix: 'episodes/e/localizations/zh-Hant/classroom',
      }),
    ).rejects.toThrow('connection refused');

    expect(state.query!.update).toHaveBeenCalledTimes(1);
  });

  it('updates the editorial title with localized script metadata fields', async () => {
    const row = localizationRow({
      status: 'script_generated',
      classroom_hls_url: null,
    });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    await updateEpisodeLocalizationStatus(row.id, 'script_generated', {
      title: '真正影響市場的不是價格，而是流動性',
      script: 'Generated script',
      llmModel: 'model',
      llmThinkingModel: 'thinking-model',
      llmProvider: 'provider',
    });

    expect(state.query!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'script_generated',
        title: '真正影響市場的不是價格，而是流動性',
        script: 'Generated script',
        llm_model: 'model',
        llm_thinking_model: 'thinking-model',
        llm_provider: 'provider',
      }),
    );
  });
});
