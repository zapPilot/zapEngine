import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  LanguageClassroomRow,
} from '../types.js';

const {
  mockFindEpisodeBySourceUrl,
  mockFindEpisodeLocalizationByEpisodeId,
  mockGenerateHls,
  mockGenerateLanguageClassroomsWithLLM,
  mockGenerateScriptWithLLM,
  mockInsertEpisode,
  mockInsertEpisodeLocalization,
  mockListLanguageClassroomsByLocalizationId,
  mockScrapeArticle,
  mockTextToSpeech,
  mockUpdateEpisodeLocalizationArticleContent,
  mockUpdateEpisodeLocalizationStatus,
  mockUpsertLanguageClassrooms,
  mockUploadHlsToR2,
  mockConvertArticleToZhTW,
} = vi.hoisted(() => ({
  mockFindEpisodeBySourceUrl: vi.fn(),
  mockFindEpisodeLocalizationByEpisodeId: vi.fn(),
  mockGenerateHls: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGenerateScriptWithLLM: vi.fn(),
  mockInsertEpisode: vi.fn(),
  mockInsertEpisodeLocalization: vi.fn(),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockScrapeArticle: vi.fn(),
  mockTextToSpeech: vi.fn(),
  mockUpdateEpisodeLocalizationArticleContent: vi.fn(),
  mockUpdateEpisodeLocalizationStatus: vi.fn(),
  mockUpsertLanguageClassrooms: vi.fn(),
  mockUploadHlsToR2: vi.fn(),
  mockConvertArticleToZhTW: vi.fn(),
}));

vi.mock('./db.js', () => ({
  findEpisodeBySourceUrl: mockFindEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId: mockFindEpisodeLocalizationByEpisodeId,
  insertEpisode: mockInsertEpisode,
  insertEpisodeLocalization: mockInsertEpisodeLocalization,
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  toEpisodeResponseFromLocalization: (
    episode: EpisodeRow,
    localization: EpisodeLocalizationRow,
    languageClassrooms: LanguageClassroomRow[],
  ) => localizationResponse(episode, localization, languageClassrooms),
  upsertLanguageClassrooms: mockUpsertLanguageClassrooms,
  updateEpisodeLocalizationArticleContent:
    mockUpdateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus: mockUpdateEpisodeLocalizationStatus,
}));

vi.mock('./llm.js', () => ({
  generateLanguageClassroomsWithLLM: mockGenerateLanguageClassroomsWithLLM,
  generateScriptWithLLM: mockGenerateScriptWithLLM,
}));

vi.mock('./scrape.js', () => ({
  scrapeArticle: mockScrapeArticle,
}));

vi.mock('./storage.js', () => ({
  uploadHlsToR2: mockUploadHlsToR2,
}));

vi.mock('./hls.js', () => ({
  generateHls: mockGenerateHls,
}));

vi.mock('./tts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tts.js')>()),
  textToSpeech: mockTextToSpeech,
}));

vi.mock('./opencc.js', () => ({
  convertArticleToZhTW: mockConvertArticleToZhTW,
}));

const { performIngest } = await import('./ingest.js');

describe('performIngest failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_TTS_LANGUAGE_CODE', 'cmn-TW');
    vi.stubEnv('GOOGLE_TTS_VOICE_NAME', 'cmn-TW-Wavenet-A');
    mockFindEpisodeBySourceUrl.mockResolvedValue(null);
    mockScrapeArticle.mockResolvedValue({
      title: '软件更新',
      text: '鼠标和自行车市场',
    });
    mockConvertArticleToZhTW.mockReturnValue({
      title: '軟體更新',
      text: '滑鼠和腳踏車市場',
    });
    mockInsertEpisode.mockResolvedValue(
      episodeRow({ source_title: '软件更新' }),
    );
    mockInsertEpisodeLocalization.mockResolvedValue(
      localizationRow({
        title: '軟體更新',
        raw_text: '滑鼠和腳踏車市場',
        hls_url: '',
        script: '',
        llm_model: '',
        llm_provider: '',
        status: 'scraped',
      }),
    );
    mockGenerateScriptWithLLM.mockResolvedValue({
      script: 'Generated script',
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00001,
    });
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id: string, status: string) => {
        if (status === 'scraped') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              hls_url: '',
              script: '',
              status: 'scraped',
            }),
          );
        }
        if (status === 'script_generated') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              hls_url: '',
              script: 'Generated script',
              status: 'script_generated',
            }),
          );
        }
        if (status === 'completed') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              script: 'Generated script',
              hls_url: 'https://cdn.example.com/playlist.m3u8',
              r2_prefix: 'episodes/e/localizations/zh-Hant',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );
    mockTextToSpeech.mockResolvedValue(Buffer.from('audio'));
    mockGenerateHls.mockResolvedValue({
      files: [
        {
          name: 'playlist.m3u8',
          data: Buffer.from('hls'),
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      playlistKey: 'playlist.m3u8',
    });
    mockUploadHlsToR2.mockResolvedValue({
      hlsUrl: 'https://cdn.example.com/playlist.m3u8',
      r2Prefix: 'episodes/e/localizations/zh-Hant',
    });
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('leaves the localization at script_generated when TTS fails', async () => {
    mockTextToSpeech.mockRejectedValue(new Error('TTS unavailable'));

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('[step:textToSpeech] TTS unavailable');

    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'script_generated',
      expect.objectContaining({ script: 'Generated script' }),
    );
    expect(mockGenerateHls).not.toHaveBeenCalled();
    expect(mockUploadHlsToR2).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.anything(),
    );
  });

  it('does not mark completed when HLS upload fails', async () => {
    mockUploadHlsToR2.mockRejectedValue(new Error('R2 upload failed'));

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('[step:uploadHlsToR2] R2 upload failed');

    expect(mockTextToSpeech).toHaveBeenCalledWith('Generated script');
    expect(mockGenerateHls).toHaveBeenCalledWith(Buffer.from('audio'));
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.anything(),
    );
  });

  it('returns the episode when language classroom generation fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
    mockGenerateLanguageClassroomsWithLLM.mockRejectedValue(
      new Error('LLM timeout'),
    );

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(200);
    expect(result.costUsd).toBe(0);
    expect(result.episode.languageClassrooms).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[/ingest] language classroom generation failed:',
      expect.objectContaining({
        episodeLocalizationId: localizationRow().id,
        message: '[step:generateLanguageClassrooms] LLM timeout',
      }),
    );

    consoleSpy.mockRestore();
  });

  it('sums LLM costs for a fresh ingest invocation', async () => {
    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    expect(result.costUsd).toBeCloseTo(0.0001, 10);
  });

  it('sums LLM costs for cached episodes with missing classrooms', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(200);
    expect(result.costUsd).toBeCloseTo(0.00009, 10);
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
  });

  it('refreshes article content when an existing localization is pending', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        status: 'pending',
        title: 'Old title',
        raw_text: 'Old text',
      }),
    );
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id: string, status: string) => {
        if (status === 'scraped') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              hls_url: '',
              script: '',
              status: 'scraped',
            }),
          );
        }
        if (status === 'script_generated') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              hls_url: '',
              script: 'Generated script',
              status: 'script_generated',
            }),
          );
        }
        if (status === 'completed') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              script: 'Generated script',
              hls_url: 'https://cdn.example.com/playlist.m3u8',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    expect(mockUpdateEpisodeLocalizationArticleContent).toHaveBeenCalledWith(
      localizationRow().id,
      {
        title: '軟體更新',
        text: '滑鼠和腳踏車市場',
      },
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'scraped',
      expect.objectContaining({
        hlsUrl: '',
        script: '',
      }),
    );
  });

  it('can continue from an existing script and non-default language metadata', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        language_code: 'en',
        status: 'script_generated',
        script: null,
      }),
    );

    const result = await performIngest('https://example.com/article', 'en');

    expect(result.statusCode).toBe(201);
    expect(mockScrapeArticle).not.toHaveBeenCalled();
    expect(mockConvertArticleToZhTW).not.toHaveBeenCalled();
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
    expect(mockTextToSpeech).toHaveBeenCalledWith('');
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsLanguageCode: 'en',
        ttsVoiceName: '',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguageCode: 'en',
        targetLanguageCodes: ['zh-Hant', 'ja'],
      }),
    );
  });

  it('returns ordered existing classrooms without calling the LLM', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({ id: 'classroom-en', target_language_code: 'en' }),
      classroomRow({ id: 'classroom-ko', target_language_code: 'ko' }),
      classroomRow({ id: 'classroom-ja', target_language_code: 'ja' }),
    ]);

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(200);
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(
      result.episode.languageClassrooms.map(
        (lesson) => lesson.targetLanguageCode,
      ),
    ).toEqual(['ja', 'en', 'ko']);
  });

  it('retains only non-persisted existing classrooms when LLM generates subset', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({ status: 'scraped' }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({ id: 'classroom-en', target_language_code: 'en' }),
      classroomRow({ id: 'classroom-ko', target_language_code: 'ko' }),
      classroomRow({ id: 'classroom-ja', target_language_code: 'ja' }),
    ]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'en',
          oneLiner: 'English lesson',
          keywords: [],
        },
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ko',
          oneLiner: 'Korean lesson',
          keywords: [],
        },
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockImplementation(
      (
        rows: {
          id: string;
          sourceLanguageCode: string;
          targetLanguageCode: string;
          oneLiner: string;
          keywords: string[];
          llmModel: string;
          llmThinkingModel: string | null;
          llmProvider: string;
        }[],
      ) => {
        return Promise.resolve(
          rows.map((r) => ({
            id: r.id,
            episode_localization_id: localizationRow().id,
            source_language_code: r.sourceLanguageCode,
            target_language_code: r.targetLanguageCode,
            one_liner: r.oneLiner,
            keywords: r.keywords,
            llm_model: r.llmModel,
            llm_thinking_model: r.llmThinkingModel,
            llm_provider: r.llmProvider,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          })),
        );
      },
    );

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    const classroomTargets = result.episode.languageClassrooms.map(
      (c) => c.targetLanguageCode,
    );
    expect(classroomTargets).toContain('ja');
    expect(classroomTargets).toContain('en');
    expect(classroomTargets).toContain('ko');
  });

  it('does not convert article to zh-TW when language is non-default', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(null);
    mockScrapeArticle.mockResolvedValue({
      title: 'Software Update',
      text: 'Mouse and bicycle market',
    });

    await performIngest('https://example.com/article', 'en');

    expect(mockConvertArticleToZhTW).not.toHaveBeenCalled();
  });

  it('uses empty voice name for non-default language TTS', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        language_code: 'ja',
        status: 'script_generated',
        script: 'some script',
      }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);

    await performIngest('https://example.com/article', 'ja');

    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsVoiceName: '',
      }),
    );
  });

  it('wraps non-Error step failures', async () => {
    mockScrapeArticle.mockRejectedValue('network down');

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('[step:scrapeArticle] network down');
  });

  it('preserves provider metadata on wrapped errors', async () => {
    const error = Object.assign(new Error('TTS throttled'), {
      $metadata: { requestId: 'request-1' },
    });
    mockTextToSpeech.mockRejectedValue(error);

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toMatchObject({
      message: '[step:textToSpeech] TTS throttled',
      $metadata: { requestId: 'request-1' },
    });
  });

  it('uses default Fish Audio TTS metadata when env vars are blank', async () => {
    vi.stubEnv('GOOGLE_TTS_LANGUAGE_CODE', '');
    vi.stubEnv('GOOGLE_TTS_VOICE_NAME', '');

    await performIngest('https://example.com/article', 'zh-Hant');

    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsLanguageCode: 'zh-Hant',
        ttsVoiceName: 'debb4c1065114ffda03f3a60abdcc421',
      }),
    );
  });

  it('throws when a localization cannot be created', async () => {
    mockInsertEpisodeLocalization.mockResolvedValue(null);

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('Failed to create episode localization');
  });

  it('throws when script generation status update returns no localization', async () => {
    mockUpdateEpisodeLocalizationStatus.mockResolvedValue(null);

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('Failed to retrieve episode localization');
  });
});

function localizationResponse(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageClassrooms: LanguageClassroomRow[],
): EpisodeResponse {
  return {
    id: episode.id,
    localizationId: localization.id,
    title: localization.title,
    languageCode: localization.language_code,
    hlsUrl: localization.hls_url,
    createdAt: episode.created_at,
    listened: episode.listened,
    script: localization.script,
    llmModel: localization.llm_model,
    llmThinkingModel: localization.llm_thinking_model,
    llmProvider: localization.llm_provider,
    status: localization.status,
    languageClassrooms: languageClassrooms.map((classroom) => ({
      sourceLanguageCode: classroom.source_language_code,
      targetLanguageCode: classroom.target_language_code,
      oneLiner: classroom.one_liner,
      keywords: classroom.keywords,
    })),
  };
}

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
    episode_id: episodeRow().id,
    language_code: 'zh-Hant',
    title: 'Localization title',
    hls_url: 'https://cdn.example.com/playlist.m3u8',
    raw_text: 'Article text',
    script: 'Script',
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    tts_language_code: null,
    tts_voice_name: null,
    r2_prefix: null,
    status: 'completed',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function classroomRow(
  overrides: Partial<LanguageClassroomRow> = {},
): LanguageClassroomRow {
  return {
    id: 'classroom-ja',
    episode_localization_id: localizationRow().id,
    source_language_code: 'zh-Hant',
    target_language_code: 'ja',
    one_liner: 'この記事は市場流動性を説明します。',
    keywords: [],
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
