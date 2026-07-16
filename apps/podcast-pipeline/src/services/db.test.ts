import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeRow,
} from '../types.js';
import {
  decodeCursor,
  encodeCursor,
  findEpisodeBySourceUrl,
  findEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId,
  insertEpisode,
  insertEpisodeLocalization,
  listCompletedEpisodeVideosByLocalizationIds,
  listEpisodes,
  listEpisodesPaged,
  listLanguageClassroomsByLocalizationId,
  listLanguageClassroomsByLocalizationIds,
  markEpisodeListened,
  toEpisodeResponse,
  toEpisodeResponseFromLocalization,
  toLanguageClassroomLesson,
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
  const state: { query: ReturnType<typeof makeQuery> | null } = { query: null };
  const mockFrom = vi.fn(() => state.query);
  return { state, mockFrom };
});

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
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
      listened: false,
      script: row.script,
      llmModel: row.llm_model,
      llmThinkingModel: row.llm_thinking_model,
      llmProvider: row.llm_provider,
      status: row.status,
      video: null,
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
      listened: true,
      script: localization.script,
      llmModel: localization.llm_model,
      llmThinkingModel: localization.llm_thinking_model,
      llmProvider: localization.llm_provider,
      status: localization.status,
      video: null,
      languageClassrooms: [],
    });
  });

  it('maps direct localization rows with explicit classrooms', () => {
    const response = toEpisodeResponseFromLocalization(
      episodeRow(),
      localizationRow(),
      [classroomRow()],
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
      listRow({ language_classrooms: null as never }),
    );

    expect(response.languageClassrooms).toEqual([]);
  });

  it('maps an explicitly completed video into the public response', () => {
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };

    expect(toEpisodeResponse(listRow(), undefined, video).video).toEqual(video);
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

  it('finds an episode localization by episode id and language', async () => {
    const row = localizationRow();
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

  it('finds a completed feed row by localization id', async () => {
    const row = listRow();
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
    const rows = [listRow({ id: '00000000-0000-4000-8000-000000000001' })];
    state.query!.returns.mockResolvedValue({
      data: [...rows, listRow()],
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
    const rows = [listRow()];
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
});

describe('listCompletedEpisodeVideosByLocalizationIds', () => {
  it('loads completed videos in one batch and ignores incomplete media rows', async () => {
    state.query!.returns.mockResolvedValue({
      data: [
        {
          episode_localization_id: 'loc-1',
          mp4_url: ' https://cdn.example.com/video.mp4 ',
          thumbnail_url: ' https://cdn.example.com/thumbnail.png ',
          duration_seconds: 90.5,
        },
        {
          episode_localization_id: 'loc-broken',
          mp4_url: null,
          thumbnail_url: 'https://cdn.example.com/thumbnail.png',
          duration_seconds: 90,
        },
      ],
      error: null,
    });

    const result = await listCompletedEpisodeVideosByLocalizationIds([
      'loc-1',
      'loc-1',
      'loc-broken',
    ]);

    expect(mockFrom).toHaveBeenCalledWith('episode_videos');
    expect(state.query!.eq).toHaveBeenCalledWith('status', 'completed');
    expect(state.query!.in).toHaveBeenCalledWith('episode_localization_id', [
      'loc-1',
      'loc-broken',
    ]);
    expect(result).toEqual(
      new Map([
        [
          'loc-1',
          {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
            durationSeconds: 90.5,
          },
        ],
      ]),
    );
  });

  it('does not query Supabase for an empty localization list', async () => {
    await expect(
      listCompletedEpisodeVideosByLocalizationIds([]),
    ).resolves.toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws completed-video lookup errors', async () => {
    state.query!.returns.mockResolvedValue({
      data: null,
      error: new Error('video lookup failed'),
    });

    await expect(
      listCompletedEpisodeVideosByLocalizationIds(['loc-1']),
    ).rejects.toThrow('video lookup failed');
  });
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
    const row = localizationRow();
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

describe('language classrooms', () => {
  it('does not query classrooms when no localization ids are provided', async () => {
    const result = await listLanguageClassroomsByLocalizationIds([]);

    expect(result).toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists classrooms for one localization id', async () => {
    const rows = [classroomRow()];
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
        episode_localization_id: 'loc-1',
        target_language_code: 'ja',
      }),
      classroomRow({
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
  it('marks an episode listened on the source episode row', async () => {
    const row = episodeRow({ listened: true });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    const result = await markEpisodeListened(row.id);

    expect(mockFrom).toHaveBeenCalledWith('episodes');
    expect(state.query!.update).toHaveBeenCalledWith({ listened: true });
    expect(result).toEqual(row);
  });

  it('throws Supabase errors when marking listened fails', async () => {
    state.query!.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error('mark listened failed'),
    });

    await expect(markEpisodeListened('episode-1')).rejects.toThrow(
      'mark listened failed',
    );
  });

  it('updates localized article content', async () => {
    const row = localizationRow({ title: '軟體更新', raw_text: '滑鼠' });
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
    const row = localizationRow({ status: 'completed' });
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
  });

  it('retries completed status updates without classroom media columns when PostgREST has stale schema', async () => {
    const row = localizationRow({ status: 'completed' });
    state
      .query!.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message:
            "Could not find the 'classroom_hls_url' column of 'episode_localizations' in the schema cache",
          details: null,
          hint: "If a new column was added, reload PostgREST's schema cache.",
        },
      })
      .mockResolvedValueOnce({ data: row, error: null });

    await expect(
      updateEpisodeLocalizationStatus(row.id, 'completed', {
        hlsUrl: 'https://cdn.example.com/playlist.m3u8',
        r2Prefix: 'episodes/e/localizations/zh-Hant/main',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroomR2Prefix: 'episodes/e/localizations/zh-Hant/classroom',
      }),
    ).resolves.toEqual(row);

    expect(state.query!.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        classroom_hls_url:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        classroom_r2_prefix: 'episodes/e/localizations/zh-Hant/classroom',
      }),
    );
    expect(state.query!.update).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({
        classroom_hls_url: expect.any(String),
        classroom_r2_prefix: expect.any(String),
      }),
    );
  });

  it('rethrows unrelated update errors without stripping classroom fields', async () => {
    const row = localizationRow();
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

  it('updates localized script metadata fields', async () => {
    const row = localizationRow({ status: 'script_generated' });
    state.query!.maybeSingle.mockResolvedValue({ data: row, error: null });

    await updateEpisodeLocalizationStatus(row.id, 'script_generated', {
      script: 'Generated script',
      llmModel: 'model',
      llmThinkingModel: 'thinking-model',
      llmProvider: 'provider',
    });

    expect(state.query!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'script_generated',
        script: 'Generated script',
        llm_model: 'model',
        llm_thinking_model: 'thinking-model',
        llm_provider: 'provider',
      }),
    );
  });
});

function episodeRow(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    source_url: 'https://example.com/article',
    source_title: 'Source title',
    created_at: '2024-01-01T00:00:00.000Z',
    listened: false,
    ...overrides,
  };
}

function localizationRow(
  overrides: Partial<EpisodeLocalizationRow> = {},
): EpisodeLocalizationRow {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    episode_id: '00000000-0000-4000-8000-000000000001',
    language_code: 'zh-Hant',
    title: 'Localization title',
    hls_url: 'https://cdn.example.com/playlist.m3u8',
    classroom_hls_url: null,
    raw_text: 'Article text',
    script: 'Script',
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    tts_language_code: null,
    tts_voice_name: null,
    r2_prefix: null,
    classroom_r2_prefix: null,
    status: 'completed',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listRow(overrides: Partial<EpisodeListRow> = {}): EpisodeListRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    episode_id: '00000000-0000-4000-8000-000000000001',
    localization_id: '00000000-0000-4000-8000-000000000101',
    title: 'Localization title',
    language_code: 'zh-Hant',
    hls_url: 'https://cdn.example.com/playlist.m3u8',
    classroom_hls_url: null,
    script: 'Script',
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    status: 'completed',
    created_at: '2024-01-01T00:00:00.000Z',
    listened: false,
    like_count: 0,
    language_classrooms: [],
    ...overrides,
  };
}

function classroomRow(
  overrides: Partial<import('../types.js').LanguageClassroomRow> = {},
): import('../types.js').LanguageClassroomRow {
  return {
    id: 'classroom-1',
    episode_localization_id: 'loc-1',
    source_language_code: 'zh-Hant',
    target_language_code: 'ja',
    one_liner: 'この記事は流動性を説明します。',
    keywords: [],
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
