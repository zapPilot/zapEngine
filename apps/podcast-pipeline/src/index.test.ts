import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  LanguageClassroomRow,
} from './types.js';

const {
  mockDecodeCursor,
  mockFindEpisodeBySourceUrl,
  mockFindEpisodeLocalizationByEpisodeId,
  mockGenerateHls,
  mockGenerateLanguageClassroomsWithLLM,
  mockGenerateScriptWithLLM,
  mockInsertEpisode,
  mockInsertEpisodeLocalization,
  mockListEpisodesPaged,
  mockListLanguageClassroomsByLocalizationId,
  mockListLanguageClassroomsByLocalizationIds,
  mockMarkEpisodeListened,
  mockScrapeArticle,
  mockServe,
  mockSynthesizeClassroomAudio,
  mockTextToSpeech,
  mockTranslateCanonicalScript,
  mockUpdateEpisodeLocalizationArticleContent,
  mockUpdateEpisodeLocalizationStatus,
  mockUpsertLanguageClassrooms,
  mockUploadHlsToR2,
  mockConvertArticleToZhTW,
  mockTelegramFetch,
} = vi.hoisted(() => ({
  mockDecodeCursor: vi.fn(),
  mockFindEpisodeBySourceUrl: vi.fn(),
  mockFindEpisodeLocalizationByEpisodeId: vi.fn(),
  mockGenerateHls: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGenerateScriptWithLLM: vi.fn(),
  mockInsertEpisode: vi.fn(),
  mockInsertEpisodeLocalization: vi.fn(),
  mockListEpisodesPaged: vi.fn(),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockListLanguageClassroomsByLocalizationIds: vi.fn(),
  mockMarkEpisodeListened: vi.fn(),
  mockScrapeArticle: vi.fn(),
  mockServe: vi.fn(),
  mockSynthesizeClassroomAudio: vi.fn(),
  mockTextToSpeech: vi.fn(),
  mockTranslateCanonicalScript: vi.fn(),
  mockUpdateEpisodeLocalizationArticleContent: vi.fn(),
  mockUpdateEpisodeLocalizationStatus: vi.fn(),
  mockUpsertLanguageClassrooms: vi.fn(),
  mockUploadHlsToR2: vi.fn(),
  mockConvertArticleToZhTW: vi.fn(),
  mockTelegramFetch: vi.fn(),
}));

vi.mock('@hono/node-server', () => ({
  serve: mockServe,
}));

vi.mock('./services/db.js', () => ({
  DEFAULT_LIMIT: 20,
  decodeCursor: mockDecodeCursor,
  findEpisodeBySourceUrl: mockFindEpisodeBySourceUrl,
  findEpisodeLocalizationByEpisodeId: mockFindEpisodeLocalizationByEpisodeId,
  insertEpisode: mockInsertEpisode,
  insertEpisodeLocalization: mockInsertEpisodeLocalization,
  listEpisodesPaged: mockListEpisodesPaged,
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  listLanguageClassroomsByLocalizationIds:
    mockListLanguageClassroomsByLocalizationIds,
  markEpisodeListened: mockMarkEpisodeListened,
  toEpisodeResponse: (
    row: EpisodeListRow,
    languageClassrooms?: LanguageClassroomRow[],
  ) => episodeListResponse(row, languageClassrooms),
  toLanguageClassroomLesson: (row: LanguageClassroomRow) => ({
    sourceLanguageCode: row.source_language_code,
    targetLanguageCode: row.target_language_code,
    oneLiner: row.one_liner,
    keywords: row.keywords,
  }),
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

vi.mock('./services/llm.js', () => ({
  generateLanguageClassroomsWithLLM: mockGenerateLanguageClassroomsWithLLM,
  generateScriptWithLLM: mockGenerateScriptWithLLM,
}));

vi.mock('./services/scrape.js', () => ({
  scrapeArticle: mockScrapeArticle,
}));

vi.mock('./services/storage.js', () => ({
  uploadHlsToR2: mockUploadHlsToR2,
}));

vi.mock('./services/hls.js', () => ({
  generateHls: mockGenerateHls,
}));

vi.mock('./services/podcast/classroom-audio.js', () => ({
  synthesizeClassroomAudio: mockSynthesizeClassroomAudio,
}));

vi.mock('./services/tts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/tts.js')>()),
  textToSpeech: mockTextToSpeech,
}));

vi.mock('./services/opencc.js', () => ({
  convertArticleToZhTW: mockConvertArticleToZhTW,
}));

vi.mock('./services/translate.js', () => ({
  translateCanonicalScript: mockTranslateCanonicalScript,
}));

const app = (await import('./index.js')).default;

describe('health checks', () => {
  it.each(['/', '/health'])('returns ok for GET %s', async (path) => {
    const response = await app.request(path);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe('GET /e/:id share landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        title: 'Share <Episode>',
        raw_text: 'Episode summary for preview cards.',
      }),
    );
  });

  it.each([
    [
      'ios',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Open in App',
    ],
    [
      'android',
      'Mozilla/5.0 (Linux; Android 13; SM-S918B)',
      'Android version coming soon',
    ],
    [
      'desktop',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Open on iPhone to listen',
    ],
  ])(
    'renders an %s share page with preview metadata',
    async (_label, ua, cta) => {
      const response = await app.request(`/e/${episodeRow().id}`, {
        headers: { 'user-agent': ua },
      });
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
        episodeRow().id,
        'zh-Hant',
      );
      expect(html).toContain(
        'property="og:title" content="Share &lt;Episode&gt;"',
      );
      expect(html).toContain(
        'property="og:description" content="Episode summary for preview cards."',
      );
      expect(html).toContain(
        `property="og:url" content="https://from-fed-to-chain-api.fly.dev/e/${episodeRow().id}"`,
      );
      expect(html).toContain(cta);
    },
  );

  it('returns 404 when the episode localization does not exist', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(null);

    const response = await app.request(
      '/e/00000000-0000-4000-8000-000000009999',
      {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      },
    );

    expect(response.status).toBe(404);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000009999',
      'zh-Hant',
    );
  });

  it('returns 404 for malformed episode ids before hitting the database', async () => {
    const response = await app.request('/e/missing-episode', {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });

    expect(response.status).toBe(404);
    expect(mockFindEpisodeLocalizationByEpisodeId).not.toHaveBeenCalled();
  });

  it('keeps the Apple app site association JSON unchanged', async () => {
    const response = await app.request(
      '/.well-known/apple-app-site-association',
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['LP8CA4MT6U.com.example.fromFedToChainApp'],
            components: [{ '/': '/e/*' }],
          },
          {
            appID: 'LP8CA4MT6U.com.example.fromFedToChainApp',
            paths: ['/e/*'],
          },
        ],
      },
    });
  });
});

describe('POST /ingest authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INGEST_ADMIN_TOKEN', 'secret-token');
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
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

  it.each([
    ['missing', undefined],
    ['invalid', 'Bearer wrong-token'],
  ])(
    'returns 401 for %s admin authorization',
    async (_label, authorization) => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (authorization) {
        headers['authorization'] = authorization;
      }

      const response = await app.request('/ingest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: 'https://example.com/article' }),
      });

      expect(response.status).toBe(401);
      expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
    },
  );

  it('accepts valid admin authorization with default zh-Hant language', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as EpisodeResponse;

    expect(response.status).toBe(200);
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledWith(
      'https://example.com/article',
    );
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'zh-Hant',
    );
    expect(body.languageCode).toBe('zh-Hant');
    expect(body.localizationId).toBe(localizationRow().id);
  });

  it('normalizes legacy zh-TW language aliases', async () => {
    const response = await app.request('/ingest?language=zh-TW', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(200);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'zh-Hant',
    );
  });

  it('accepts secondary ingest languages', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) =>
        Promise.resolve(
          localizationRow({
            language_code: languageCode,
            status: 'completed',
          }),
        ),
    );

    const response = await app.request('/ingest?language=ja', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(200);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'ja',
    );
  });
});

describe('POST /ingest pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INGEST_ADMIN_TOKEN', 'secret-token');
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
              hls_url:
                'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
              r2_prefix: 'episodes/e/localizations/zh-Hant/main',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );
    mockTextToSpeech.mockResolvedValue({
      audio: Buffer.from('audio'),
      cost: [
        {
          category: 'tts',
          label: 'TTS main audio',
          provider: 'fish-audio',
          model: 's2-pro',
          costUsd: 0.00006,
        },
      ],
    });
    mockSynthesizeClassroomAudio.mockResolvedValue({ audio: null, cost: [] });
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
    mockUploadHlsToR2.mockImplementation(
      (_files, episodeId: string, languageCode: string, section: string) =>
        Promise.resolve({
          hlsUrl: `https://cdn.example.com/episodes/${episodeId}/localizations/${languageCode}/${section}/playlist.m3u8`,
          r2Prefix: `episodes/${episodeId}/localizations/${languageCode}/${section}`,
        }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は市場流動性を説明します。',
          keywords: [],
        },
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'en',
          oneLiner: 'This article explains market liquidity.',
          keywords: [],
        },
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([
      classroomRow({ target_language_code: 'ja' }),
      classroomRow({ id: 'classroom-en', target_language_code: 'en' }),
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a zh-Hant localization, uploads HLS under localization prefix, and generates ja/en classroom lessons', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as EpisodeResponse;

    expect(response.status).toBe(201);
    expect(mockConvertArticleToZhTW).toHaveBeenCalledWith({
      title: '软件更新',
      text: '鼠标和自行车市场',
    });
    expect(mockInsertEpisode).toHaveBeenCalledWith({
      id: expect.any(String),
      sourceUrl: 'https://example.com/article',
      sourceTitle: '软件更新',
    });
    expect(mockInsertEpisodeLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: episodeRow().id,
        languageCode: 'zh-Hant',
        title: '軟體更新',
        rawText: '滑鼠和腳踏車市場',
      }),
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        hlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main/playlist.m3u8',
        r2Prefix:
          'episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main',
        ttsLanguageCode: 'zh-Hant',
        ttsVoiceName: 'debb4c1065114ffda03f3a60abdcc421',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCodes: ['ja', 'en'],
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguageCode: 'ja',
        targetLanguageCodes: ['zh-Hant', 'en'],
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguageCode: 'en',
        targetLanguageCodes: ['zh-Hant', 'ja'],
      }),
    );
    expect(
      body.languageClassrooms.map((lesson) => lesson.targetLanguageCode),
    ).toEqual(['ja', 'en']);
  });

  it('persists code-owned Fish Audio metadata even when TTS env overrides are present', async () => {
    vi.stubEnv('TTS_ZH_HANT_PROVIDER', 'google');

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(201);
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsLanguageCode: 'zh-Hant',
        ttsVoiceName: 'debb4c1065114ffda03f3a60abdcc421',
      }),
    );
  });
});

describe('POST /telegram/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PIPELINE_TELEGRAM_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_USER_IDS', '12345');
    vi.stubEnv('PIPELINE_TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubGlobal('fetch', mockTelegramFetch);
    mockTelegramFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
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
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'wrong-secret'],
  ])('returns an empty 200 for %s webhook secret', async (_label, secret) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (secret) {
      headers['x-telegram-bot-api-secret-token'] = secret;
    }

    const response = await app.request('/telegram/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(
        telegramUpdate({ text: 'https://example.com/article' }),
      ),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
    expect(mockTelegramFetch).not.toHaveBeenCalled();
  });

  it('ignores users outside the Telegram allowlist', async () => {
    const response = await postTelegramUpdate(
      telegramUpdate({ fromId: 99999, text: 'https://example.com/article' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
    expect(mockTelegramFetch).not.toHaveBeenCalled();
  });

  it('responds to /start without running ingest', async () => {
    const response = await postTelegramUpdate(
      telegramUpdate({ text: '/start' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(1));
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('貼一個文章 URL'),
    ]);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('prompts when the message does not contain an http URL', async () => {
    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'hello' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(1));
    expect(telegramMessageTexts()).toEqual(['請貼一個 http(s) 文章網址']);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('runs ingest for a valid URL and sends start plus result messages', async () => {
    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/article' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledWith(
      'https://example.com/article',
    );
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('收到'),
      [
        '✅ 已存在',
        '《Localization title》',
        'https://cdn.example.com/playlist.m3u8',
        '💰 Total $0.00027',
        'Breakdown',
        '- LLM classrooms (test-provider/test-model): $0.00027',
      ].join('\n'),
    ]);
  });

  it('sorts the Telegram cost breakdown by cost descending', async () => {
    mockGenerateLanguageClassroomsWithLLM
      .mockResolvedValueOnce({
        lessons: [],
        model: 'low-model',
        thinkingModel: null,
        provider: 'test-provider',
        costUsd: 0.00001,
      })
      .mockResolvedValueOnce({
        lessons: [],
        model: 'high-model',
        thinkingModel: null,
        provider: 'test-provider',
        costUsd: 0.00009,
      })
      .mockResolvedValueOnce({
        lessons: [],
        model: 'middle-model',
        thinkingModel: null,
        provider: 'test-provider',
        costUsd: 0.00004,
      });

    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/article' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('收到'),
      [
        '✅ 已存在',
        '《Localization title》',
        'https://cdn.example.com/playlist.m3u8',
        '💰 Total $0.00014',
        'Breakdown',
        '- LLM classrooms (test-provider/high-model): $0.00009',
        '- LLM classrooms (test-provider/middle-model): $0.00004',
        '- LLM classrooms (test-provider/low-model): $0.00001',
      ].join('\n'),
    ]);
  });

  it('omits cost from the Telegram result when no LLM calls run', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({ id: 'classroom-zh', target_language_code: 'zh-Hant' }),
      classroomRow({ id: 'classroom-ja', target_language_code: 'ja' }),
      classroomRow({ id: 'classroom-en', target_language_code: 'en' }),
    ]);

    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/article' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(telegramMessageTexts()[1]).toBe(
      [
        '✅ 已存在',
        '《Localization title》',
        'https://cdn.example.com/playlist.m3u8',
      ].join('\n'),
    );
    expect(telegramMessageTexts()[1]).not.toContain('💰');
  });

  it('sends a short step-prefixed failure message when ingest fails', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(null);
    mockScrapeArticle.mockRejectedValue(new Error('timeout'));

    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/fails' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('收到'),
      expect.stringContaining('❌ 失敗 [step:scrapeArticle] timeout'),
    ]);
  });

  it('deduplicates repeated URLs while the first ingest is still running', async () => {
    const localization = createDeferred<EpisodeLocalizationRow>();
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockReturnValue(
      localization.promise,
    );

    const first = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/slow' }),
    );
    const second = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/slow' }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledTimes(1);
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('收到'),
      expect.stringContaining('已在處理'),
    ]);

    localization.resolve(localizationRow());
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(3));
  });
});

describe('GET /episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecodeCursor.mockImplementation((raw: string) => ({
      t: '2024-01-01T00:00:00.000Z',
      i: raw,
    }));
    mockListEpisodesPaged.mockResolvedValue({ rows: [], nextCursor: null });
    mockListLanguageClassroomsByLocalizationIds.mockResolvedValue(new Map());
  });

  it('returns a paginated localization response for zh-Hant', async () => {
    const row = listRow();
    mockListEpisodesPaged.mockResolvedValue({
      rows: [row],
      nextCursor: 'next-cursor',
    });
    mockListLanguageClassroomsByLocalizationIds.mockResolvedValue(
      new Map([[row.localization_id, [classroomRow()]]]),
    );

    const response = await app.request('/episodes?limit=5');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListEpisodesPaged).toHaveBeenCalledWith(5, null, 'zh-Hant');
    expect(mockListLanguageClassroomsByLocalizationIds).toHaveBeenCalledWith([
      row.localization_id,
    ]);
    expect(body).toEqual({
      items: [
        {
          ...episodeListResponse(row),
          languageClassrooms: [
            {
              sourceLanguageCode: 'zh-Hant',
              targetLanguageCode: 'ja',
              oneLiner: 'この記事は市場流動性を説明します。',
              keywords: [],
            },
          ],
        },
      ],
      nextCursor: 'next-cursor',
    });
  });

  it('returns 400 for an invalid limit', async () => {
    const response = await app.request('/episodes?limit=abc');

    expect(response.status).toBe(400);
    expect(mockListEpisodesPaged).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid cursor', async () => {
    mockDecodeCursor.mockImplementation(() => {
      throw new Error('bad cursor');
    });

    const response = await app.request('/episodes?cursor=garbage');

    expect(response.status).toBe(400);
    expect(mockListEpisodesPaged).not.toHaveBeenCalled();
  });
});

describe('POST /episodes/:id/listened', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkEpisodeListened.mockResolvedValue(episodeRow({ listened: true }));
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localizationRow());
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow(),
    ]);
  });

  it('marks the source episode listened and returns the requested localization', async () => {
    const response = await app.request(
      `/episodes/${episodeRow().id}/listened`,
      {
        method: 'POST',
      },
    );
    const body = (await response.json()) as EpisodeResponse;

    expect(response.status).toBe(200);
    expect(mockMarkEpisodeListened).toHaveBeenCalledWith(episodeRow().id);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'zh-Hant',
    );
    expect(body.listened).toBe(true);
    expect(body.localizationId).toBe(localizationRow().id);
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
    audioTracks: [
      {
        languageCode: localization.language_code,
        title: localization.title,
        hlsUrl: localization.hls_url,
        classroomHlsUrl: localization.classroom_hls_url,
      },
    ],
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

function episodeListResponse(
  row: EpisodeListRow,
  languageClassroomRows?: LanguageClassroomRow[],
): EpisodeResponse {
  const rawLanguageClassrooms =
    languageClassroomRows ?? row.language_classrooms;
  const languageClassrooms = Array.isArray(rawLanguageClassrooms)
    ? rawLanguageClassrooms.map((classroom) => {
        const value = classroom as Record<string, unknown>;
        return {
          sourceLanguageCode: (value['sourceLanguageCode'] ??
            value['source_language_code']) as string,
          targetLanguageCode: (value['targetLanguageCode'] ??
            value['target_language_code']) as string,
          oneLiner: (value['oneLiner'] ?? value['one_liner']) as string,
          keywords: (value['keywords'] ?? []) as [],
        };
      })
    : [];

  return {
    id: row.episode_id,
    localizationId: row.localization_id,
    title: row.title,
    languageCode: row.language_code,
    hlsUrl: row.hls_url,
    audioTracks: [
      {
        languageCode: row.language_code,
        title: row.title,
        hlsUrl: row.hls_url,
        classroomHlsUrl: row.classroom_hls_url,
      },
    ],
    createdAt: row.created_at,
    listened: row.listened,
    script: row.script,
    llmModel: row.llm_model,
    llmThinkingModel: row.llm_thinking_model,
    llmProvider: row.llm_provider,
    status: row.status,
    languageClassrooms,
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
    id: episodeRow().id,
    episode_id: episodeRow().id,
    localization_id: localizationRow().id,
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

function telegramUpdate({
  fromId = 12345,
  chatId = 67890,
  text,
}: {
  fromId?: number;
  chatId?: number;
  text: string;
}) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: fromId, is_bot: false, first_name: 'Tester' },
      chat: { id: chatId, type: 'private' },
      date: 1,
      text,
    },
  };
}

async function postTelegramUpdate(update: unknown): Promise<Response> {
  return app.request('/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'webhook-secret',
    },
    body: JSON.stringify(update),
  });
}

function telegramMessageTexts(): string[] {
  return mockTelegramFetch.mock.calls.map(([, init]) => {
    const requestBody = (init as RequestInit).body;
    if (typeof requestBody !== 'string') {
      throw new TypeError('Expected Telegram fetch body to be a string');
    }
    const body = JSON.parse(requestBody) as {
      text: string;
    };
    return body.text;
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}
