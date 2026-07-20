import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classroomLesson,
  classroomRow,
  createDeferred,
  episodeListResponse,
  episodeRow,
  listRow,
  localizationResponse,
  localizationRow,
  telegramUpdate,
} from './__fixtures__/index-test.js';
import type {
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  LanguageClassroomLesson,
} from './types.js';

const {
  mockConcatMp3Buffers,
  mockDecodeCursor,
  mockEnqueueEpisodeVideoJob,
  mockFindEpisodeBySourceUrl,
  mockFindEpisodeListRowByLocalizationId,
  mockFindEpisodeLocalizationByEpisodeId,
  mockGenerateHls,
  mockGenerateLanguageClassroomsWithLLM,
  mockGenerateScriptWithLLM,
  mockInsertEpisode,
  mockInsertEpisodeLocalization,
  mockInvalidateEpisodeSearchCache,
  mockListEpisodesPaged,
  mockListCompletedEpisodeVideosByLocalizationIds,
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
  mockSearchEpisodes,
  mockTelegramFetch,
} = vi.hoisted(() => ({
  mockConcatMp3Buffers: vi.fn(),
  mockDecodeCursor: vi.fn(),
  mockEnqueueEpisodeVideoJob: vi.fn(),
  mockFindEpisodeBySourceUrl: vi.fn(),
  mockFindEpisodeListRowByLocalizationId: vi.fn(),
  mockFindEpisodeLocalizationByEpisodeId: vi.fn(),
  mockGenerateHls: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGenerateScriptWithLLM: vi.fn(),
  mockInsertEpisode: vi.fn(),
  mockInsertEpisodeLocalization: vi.fn(),
  mockInvalidateEpisodeSearchCache: vi.fn(),
  mockListEpisodesPaged: vi.fn(),
  mockListCompletedEpisodeVideosByLocalizationIds: vi
    .fn()
    .mockResolvedValue(new Map()),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockListLanguageClassroomsByLocalizationIds: vi.fn(),
  mockMarkEpisodeListened: vi.fn(),
  mockScrapeArticle: vi.fn(),
  mockServe: vi.fn(
    (_options: unknown, callback?: (info: { port: number }) => void) => {
      callback?.({ port: 0 });
    },
  ),
  mockSynthesizeClassroomAudio: vi.fn(),
  mockTextToSpeech: vi.fn(),
  mockTranslateCanonicalScript: vi.fn(),
  mockUpdateEpisodeLocalizationArticleContent: vi.fn(),
  mockUpdateEpisodeLocalizationStatus: vi.fn(),
  mockUpsertLanguageClassrooms: vi.fn(),
  mockUploadHlsToR2: vi.fn(),
  mockConvertArticleToZhTW: vi.fn(),
  mockSearchEpisodes: vi.fn(),
  mockTelegramFetch: vi.fn(),
}));

vi.mock('@hono/node-server', () => ({
  serve: mockServe,
}));

vi.mock('./services/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/db.js')>()),
  DEFAULT_LIMIT: 20,
  decodeCursor: mockDecodeCursor,
  findEpisodeBySourceUrl: mockFindEpisodeBySourceUrl,
  findEpisodeListRowByLocalizationId: mockFindEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId: mockFindEpisodeLocalizationByEpisodeId,
  insertEpisode: mockInsertEpisode,
  insertEpisodeLocalization: mockInsertEpisodeLocalization,
  listEpisodesPaged: mockListEpisodesPaged,
  listCompletedEpisodeVideosByLocalizationIds:
    mockListCompletedEpisodeVideosByLocalizationIds,
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  listLanguageClassroomsByLocalizationIds:
    mockListLanguageClassroomsByLocalizationIds,
  markEpisodeListened: mockMarkEpisodeListened,
  toEpisodeResponse: (
    row: EpisodeListRow,
    languageClassrooms?: import('./types.js').LanguageClassroomRow[],
    video?: import('./types.js').EpisodeVideoResponse | null,
  ) => {
    const lessons: LanguageClassroomLesson[] = (
      languageClassrooms ?? row.language_classrooms
    ).map((lc) =>
      'targetLanguageCode' in lc
        ? lc
        : {
            sourceLanguageCode: lc.source_language_code,
            targetLanguageCode: lc.target_language_code,
            oneLiner: lc.one_liner,
            keywords: lc.keywords,
          },
    );
    return {
      ...episodeListResponse({ ...row, language_classrooms: lessons }),
      video: video ?? null,
    };
  },
  toEpisodeResponseFromLocalization: (
    episode: EpisodeRow,
    localization: EpisodeLocalizationRow,
    languageClassrooms:
      | import('./types.js').LanguageClassroomRow[]
      | LanguageClassroomLesson[],
    video?: import('./types.js').EpisodeVideoResponse | null,
  ) => {
    const lessons: LanguageClassroomLesson[] = languageClassrooms.map((lc) =>
      'targetLanguageCode' in lc
        ? lc
        : {
            sourceLanguageCode: lc.source_language_code,
            targetLanguageCode: lc.target_language_code,
            oneLiner: lc.one_liner,
            keywords: lc.keywords,
          },
    );
    return {
      ...localizationResponse(episode, localization, lessons),
      video: video ?? null,
    };
  },
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
  uploadVideoArtifactsToR2: vi.fn(),
}));

vi.mock('./services/hls.js', () => ({
  generateHls: mockGenerateHls,
}));

vi.mock('./services/podcast/classroom-audio.js', () => ({
  synthesizeClassroomAudio: mockSynthesizeClassroomAudio,
}));

vi.mock('./services/tts/audio-concat.js', () => ({
  concatMp3Buffers: mockConcatMp3Buffers,
}));

vi.mock('./services/tts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/tts.js')>()),
  textToSpeech: mockTextToSpeech,
}));

vi.mock('./services/opencc.js', () => ({
  convertArticleToZhTW: mockConvertArticleToZhTW,
}));

vi.mock('./services/episode-search.js', () => ({
  invalidateEpisodeSearchCache: mockInvalidateEpisodeSearchCache,
  searchEpisodes: mockSearchEpisodes,
}));

vi.mock('./services/translate.js', () => ({
  translateCanonicalScript: mockTranslateCanonicalScript,
}));

vi.mock('./services/video-jobs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/video-jobs.js')>()),
  enqueueEpisodeVideoJob: mockEnqueueEpisodeVideoJob,
}));

process.env['TTS_PROVIDER'] = 'google';

const app = (await import('./index.js')).default;

beforeEach(() => {
  process.env['TTS_PROVIDER'] = 'google';
  delete process.env['FISH_AUDIO_ENGINE'];
  delete process.env['FISH_AUDIO_REFERENCE_ID'];
  delete process.env['FISH_AUDIO_MODEL_ID'];
  mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(new Map());
  mockEnqueueEpisodeVideoJob.mockResolvedValue({ status: 'queued' });
  mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-combined'));
  mockSynthesizeClassroomAudio.mockResolvedValue({
    audio: Buffer.from('classroom-audio'),
    cost: [],
  });
});

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
      'Open in Zap Pilot',
    ],
    [
      'android',
      'Mozilla/5.0 (Linux; Android 13; SM-S918B)',
      'Open in Zap Pilot',
    ],
    [
      'desktop',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Open in Zap Pilot',
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
        `property="og:url" content="https://from-fed-to-chain-api.fly.dev/e/${episodeRow().id}?lang=zh-Hant"`,
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

  it('uses a localization cover URL when one is present', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue({
      ...localizationRow({ title: 'Covered Episode' }),
      cover_url: 'https://cdn.example.com/covers/episode.png',
    });

    const response = await app.request(`/e/${episodeRow().id}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'property="og:image" content="https://cdn.example.com/covers/episode.png"',
    );
  });

  it('falls back to the default cover URL for non-record localization values', async () => {
    const localization = Object.assign(() => undefined, {
      episode_id: episodeRow().id,
      title: 'Function-shaped Localization',
      raw_text: 'Description from a defensive mock shape.',
      script: null,
      language_code: 'zh-Hant',
      hls_url: 'https://cdn.example.com/playlist.m3u8',
      classroom_hls_url: null,
      llm_model: 'model',
      llm_thinking_model: null,
      llm_provider: 'provider',
      status: 'completed',
    });
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localization);

    const response = await app.request(`/e/${episodeRow().id}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      'property="og:image" content="https://is1-ssl.mzstatic.com/image/thumb/',
    );
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
      lessons: [
        classroomLesson({ targetLanguageCode: 'ja' }),
        classroomLesson({
          targetLanguageCode: 'en',
          oneLiner: 'This article explains market liquidity.',
        }),
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

  it.each([
    ['missing', undefined],
    ['basic scheme', 'Basic abc'],
    ['empty bearer token', 'Bearer '],
    ['wrong bearer token with matching length', 'Bearer secret-tokem'],
    ['invalid bearer token', 'Bearer wrong-token'],
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

  it('returns 500 when the admin token is not configured', async () => {
    vi.stubEnv('INGEST_ADMIN_TOKEN', '');

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(500);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('returns 400 for unsupported primary language codes', async () => {
    const response = await app.request('/ingest?language=fr', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(400);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when the ingest body is not JSON', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'text/plain',
      },
      body: '',
    });

    expect(response.status).toBe(400);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when the ingest URL uses an unsupported protocol', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'ftp://example.com/article' }),
    });

    expect(response.status).toBe(400);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('accepts valid admin authorization with default zh-Hant language', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as { episode: EpisodeResponse };

    expect(response.status).toBe(200);
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledWith(
      'https://example.com/article',
    );
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'zh-Hant',
    );
    expect(body.episode.languageCode).toBe('zh-Hant');
    expect(body.episode.localizationId).toBe(localizationRow().id);
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

  it('reads the primary language from the request body when present', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) =>
        Promise.resolve(
          localizationRow({
            language_code: languageCode,
            status: 'completed',
          }),
        ),
    );

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.com/article',
        language: 'ja',
      }),
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
      (_id: string, status: string, data?: Record<string, unknown>) => {
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
        if (status === 'audio_generated') {
          const overrides: Record<string, unknown> = {
            status: 'audio_generated',
          };
          if (data?.['hlsUrl'] !== undefined)
            overrides['hls_url'] = data['hlsUrl'];
          if (data?.['r2Prefix'] !== undefined)
            overrides['r2_prefix'] = data['r2Prefix'];
          if (data?.['classroomHlsUrl'] !== undefined)
            overrides['classroom_hls_url'] = data['classroomHlsUrl'];
          if (data?.['classroomR2Prefix'] !== undefined)
            overrides['classroom_r2_prefix'] = data['classroomR2Prefix'];
          if (data?.['ttsLanguageCode'] !== undefined)
            overrides['tts_language_code'] = data['ttsLanguageCode'];
          if (data?.['ttsVoiceName'] !== undefined)
            overrides['tts_voice_name'] = data['ttsVoiceName'];
          return Promise.resolve(localizationRow(overrides));
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
    mockSynthesizeClassroomAudio.mockResolvedValue({
      audio: Buffer.from('classroom-audio'),
      cost: [],
    });
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
    const body = (await response.json()) as { episode: EpisodeResponse };

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
        ttsLanguageCode: 'cmn-TW',
        ttsVoiceName: 'cmn-TW-Wavenet-A',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCodes: ['ja', 'en'],
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledTimes(1);
    expect(
      body.episode.languageClassrooms.map(
        (lesson) => lesson.targetLanguageCode,
      ),
    ).toEqual(['ja', 'en']);
    expect(mockInvalidateEpisodeSearchCache).toHaveBeenCalledTimes(1);
  });

  it('requeues canonical video from completed multilingual audio without regenerating ingest artifacts', async () => {
    const canonicalLocalization = localizationRow({
      id: 'canonical-localization',
      language_code: 'zh-Hant',
      status: 'completed',
    });
    const jaLocalization = localizationRow({
      id: 'ja-localization',
      language_code: 'ja',
      status: 'completed',
    });
    const enLocalization = localizationRow({
      id: 'en-localization',
      language_code: 'en',
      status: 'completed',
    });
    const localizations = new Map([
      ['zh-Hant', canonicalLocalization],
      ['ja', jaLocalization],
      ['en', enLocalization],
    ]);

    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) =>
        Promise.resolve(localizations.get(languageCode) ?? null),
    );
    mockListLanguageClassroomsByLocalizationId.mockImplementation(
      (episodeLocalizationId: string) =>
        Promise.resolve(
          episodeLocalizationId === canonicalLocalization.id
            ? [
                classroomRow({
                  id: 'canonical-classroom-ja',
                  episode_localization_id: canonicalLocalization.id,
                  target_language_code: 'ja',
                }),
                classroomRow({
                  id: 'canonical-classroom-en',
                  episode_localization_id: canonicalLocalization.id,
                  target_language_code: 'en',
                }),
              ]
            : [],
        ),
    );
    mockEnqueueEpisodeVideoJob.mockResolvedValue({
      status: 'queued',
      attempt_count: 0,
      last_error: null,
    });

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as {
      episode: EpisodeResponse;
      costUsd: number;
      costDetails: { totalUsd: number; breakdown: unknown[] };
      summary: string;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'costDetails',
      'costUsd',
      'episode',
      'summary',
    ]);
    expect(body.episode).toMatchObject({
      id: episodeRow().id,
      localizationId: canonicalLocalization.id,
      languageCode: 'zh-Hant',
      video: null,
    });
    expect(body.costUsd).toBe(0);
    expect(body.costDetails).toEqual({ totalUsd: 0, breakdown: [] });
    expect(body.summary).toContain('✅ 已存在');

    expect(mockEnqueueEpisodeVideoJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEpisodeVideoJob).toHaveBeenCalledWith(
      canonicalLocalization.id,
      null,
    );
    expect(mockScrapeArticle).not.toHaveBeenCalled();
    expect(mockConvertArticleToZhTW).not.toHaveBeenCalled();
    expect(mockInsertEpisode).not.toHaveBeenCalled();
    expect(mockInsertEpisodeLocalization).not.toHaveBeenCalled();
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
    expect(mockTranslateCanonicalScript).not.toHaveBeenCalled();
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockGenerateHls).not.toHaveBeenCalled();
    expect(mockUploadHlsToR2).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationArticleContent).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalled();
  });

  it('returns the cost envelope and a Telegram-equivalent summary string', async () => {
    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      episode: { id: string; title: string; hlsUrl: string };
      costUsd: number;
      costDetails: {
        totalUsd: number;
        breakdown: {
          category: string;
          label: string;
          provider: string;
          model: string;
          costUsd: number;
        }[];
      };
      summary: string;
    };

    expect(body.episode.id).toBe(episodeRow().id);
    expect(body.costUsd).toBeGreaterThan(0);
    expect(body.costDetails.totalUsd).toBeCloseTo(body.costUsd, 10);
    expect(body.costDetails.breakdown.length).toBeGreaterThan(0);
    for (const line of body.costDetails.breakdown) {
      expect(line.costUsd).toBeGreaterThan(0);
    }
    const costs = body.costDetails.breakdown.map((l) => l.costUsd);
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);
    expect(body.summary).toContain('✅ 完成');
    expect(body.summary).toContain('💰 Total $');
    expect(body.summary).toContain('- 外語小教室:');
    expect(body.summary).not.toContain('Breakdown');
  });

  it('persists code-owned Google TTS metadata even when TTS env overrides are present', async () => {
    vi.stubEnv('TTS_ZH_HANT_PROVIDER', 'fish-audio');

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
        ttsLanguageCode: 'cmn-TW',
        ttsVoiceName: 'cmn-TW-Wavenet-A',
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
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
      }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [
        classroomLesson({ targetLanguageCode: 'ja' }),
        classroomLesson({
          targetLanguageCode: 'en',
          oneLiner: 'This article explains market liquidity.',
        }),
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

  it('ignores a webhook body that is not valid JSON', async () => {
    const response = await app.request('/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'webhook-secret',
      },
      body: '{',
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
    expect(mockTelegramFetch).not.toHaveBeenCalled();
  });

  it('ignores a webhook update without a message object', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      message: 'not-an-object',
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

  it.each(['/help', '/start@podcast_bot', '/help@podcast_bot'])(
    'responds to %s without running ingest',
    async (command) => {
      const response = await postTelegramUpdate(
        telegramUpdate({ text: command }),
      );

      expect(response.status).toBe(200);
      await vi.waitFor(() =>
        expect(mockTelegramFetch).toHaveBeenCalledTimes(1),
      );
      expect(telegramMessageTexts()).toEqual([
        expect.stringContaining('貼一個文章 URL'),
      ]);
      expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
    },
  );

  it('accepts edited messages as webhook input', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      edited_message: {
        message_id: 1,
        from: { id: 12345 },
        chat: { id: 67890 },
        date: 1,
        text: '/help',
      },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(1));
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('貼一個文章 URL'),
    ]);
  });

  it('ignores messages without a sender id', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: {},
        chat: { id: 67890 },
        date: 1,
        text: 'https://example.com/article',
      },
    });

    expect(response.status).toBe(200);
    expect(mockTelegramFetch).not.toHaveBeenCalled();
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('ignores messages with an invalid chat id shape', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 12345 },
        chat: { id: { nested: true } },
        date: 1,
        text: 'https://example.com/article',
      },
    });

    expect(response.status).toBe(200);
    expect(mockTelegramFetch).not.toHaveBeenCalled();
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

  it('prompts when the extracted URL cannot be parsed', async () => {
    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'please read http://' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(1));
    expect(telegramMessageTexts()).toEqual(['請貼一個 http(s) 文章網址']);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('treats a non-string message text as empty and prompts for a URL', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 12345, is_bot: false, first_name: 'Tester' },
        chat: { id: 67890, type: 'private' },
        date: 1,
        text: 123,
      },
    });

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
        '💰 Total $0.00009',
        '- 外語小教室: $0.00009',
        '🎬 音頻完成／影片排程中',
        `https://from-fed-to-chain-api.fly.dev/e/${episodeRow().id}?lang=zh-Hant`,
      ].join('\n'),
    ]);
    expect(mockInvalidateEpisodeSearchCache).toHaveBeenCalledTimes(1);
  });

  it('logs Telegram send failures without failing the webhook', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTelegramFetch.mockRejectedValue(new Error('telegram unavailable'));

    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/article' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        '[/telegram/webhook] sendMessage failed:',
        expect.objectContaining({ message: 'telegram unavailable' }),
      ),
    );
  });

  it('groups the Telegram cost breakdown by activity and hides model detail', async () => {
    configureFreshTelegramIngest();

    const response = await postTelegramUpdate(
      telegramUpdate({ text: 'https://example.com/fresh' }),
    );

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    const resultMessage = telegramMessageTexts()[1]!;
    expect(resultMessage).toContain('- 旁白語音: $');
    expect(resultMessage).toContain('- 翻譯: $');
    // Model / voice / usage detail is intentionally suppressed in the summary.
    expect(resultMessage).not.toContain('fish-audio');
    expect(resultMessage).not.toContain('UTF-8 bytes');
    expect(resultMessage).not.toContain('/M)');
  });

  it('merges classroom costs into a single grouped subtotal', async () => {
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
        '💰 Total $0.00001',
        '- 外語小教室: $0.00001',
        '🎬 音頻完成／影片排程中',
        `https://from-fed-to-chain-api.fly.dev/e/${episodeRow().id}?lang=zh-Hant`,
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
        '🎬 音頻完成／影片排程中',
        `https://from-fed-to-chain-api.fly.dev/e/${episodeRow().id}?lang=zh-Hant`,
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
      telegramUpdate({
        chatId: 999,
        text: 'https://example.com/slow',
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(2));
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledTimes(1);
    expect(telegramMessageTexts()).toEqual([
      expect.stringContaining('收到'),
      expect.stringContaining('已在處理'),
    ]);

    localization.resolve(
      localizationRow({
        classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
      }),
    );
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(3));
    expect(mockEnqueueEpisodeVideoJob).toHaveBeenCalledWith(
      localizationRow().id,
      '999',
    );
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
    const row = listRow({
      language_classrooms: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'この記事は市場流動性を説明します。',
          keywords: [],
        },
      ],
    });
    mockListEpisodesPaged.mockResolvedValue({
      rows: [row],
      nextCursor: 'next-cursor',
    });

    const response = await app.request('/episodes?limit=5');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListEpisodesPaged).toHaveBeenCalledWith(5, null, 'zh-Hant');
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

  it('uses row classrooms directly without fallback', async () => {
    const row = listRow({
      language_classrooms: [
        classroomLesson({
          targetLanguageCode: 'en',
          oneLiner: 'This article explains liquidity.',
        }),
      ],
    });
    mockListEpisodesPaged.mockResolvedValue({
      rows: [row],
      nextCursor: null,
    });

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListEpisodesPaged).toHaveBeenCalledWith(20, null, 'zh-Hant');
    expect(body.items[0].languageClassrooms).toEqual([
      {
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'en',
        oneLiner: 'This article explains liquidity.',
        keywords: [],
      },
    ]);
  });

  it('hydrates feed videos with one completed-video batch query', async () => {
    const row = listRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    mockListEpisodesPaged.mockResolvedValue({ rows: [row], nextCursor: null });
    mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(
      new Map([[row.localization_id, video]]),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(
      mockListCompletedEpisodeVideosByLocalizationIds,
    ).toHaveBeenCalledWith([row.localization_id]);
    expect(body.items[0].video).toEqual(video);
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

  it('returns 400 for unsupported language codes', async () => {
    const response = await app.request('/episodes?language=fr');

    expect(response.status).toBe(400);
    expect(mockListEpisodesPaged).not.toHaveBeenCalled();
  });
});

describe('GET /episodes/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchEpisodes.mockResolvedValue([]);
  });

  it('searches the requested language and returns result metadata', async () => {
    const item = {
      episode: episodeListResponse(
        listRow({
          title: 'The Fed balance sheet',
          language_code: 'en',
        }),
      ),
      matchSource: 'title',
      snippet: 'Liquidity conditions changed.',
    };
    mockSearchEpisodes.mockResolvedValue([item]);

    const response = await app.request(
      '/episodes/search?q=%20Fed%20balance%20&language=en&limit=7',
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSearchEpisodes).toHaveBeenCalledWith('Fed balance', 'en', 7);
    expect(body).toEqual({ items: [item] });
  });

  it('uses the default language and result limit', async () => {
    const response = await app.request('/episodes/search?q=流動性');

    expect(response.status).toBe(200);
    expect(mockSearchEpisodes).toHaveBeenCalledWith('流動性', 'zh-Hant', 20);
  });

  it('hydrates ranked search results with one completed-video batch query', async () => {
    const episode = episodeListResponse(listRow());
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    mockSearchEpisodes.mockResolvedValue([
      { episode, matchSource: 'title', snippet: null },
    ]);
    mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(
      new Map([[episode.localizationId, video]]),
    );

    const response = await app.request('/episodes/search?q=liquidity');
    const body = await response.json();

    expect(
      mockListCompletedEpisodeVideosByLocalizationIds,
    ).toHaveBeenCalledWith([episode.localizationId]);
    expect(body.items[0].episode.video).toEqual(video);
  });

  it.each([
    ['missing', '/episodes/search'],
    ['too short', '/episodes/search?q=a'],
    ['too long', `/episodes/search?q=${'a'.repeat(121)}`],
  ])('returns 400 for a %s query', async (_label, path) => {
    const response = await app.request(path);

    expect(response.status).toBe(400);
    expect(mockSearchEpisodes).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '51', '1.5'])(
    'returns 400 for invalid limit %s',
    async (limit) => {
      const response = await app.request(
        `/episodes/search?q=liquidity&limit=${limit}`,
      );

      expect(response.status).toBe(400);
      expect(mockSearchEpisodes).not.toHaveBeenCalled();
    },
  );

  it('returns 400 for unsupported language codes', async () => {
    const response = await app.request(
      '/episodes/search?q=liquidity&language=fr',
    );

    expect(response.status).toBe(400);
    expect(mockSearchEpisodes).not.toHaveBeenCalled();
  });
});

describe('GET /episodes/:localizationId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(
      new Map(),
    );
  });

  it('returns a completed localization outside the paginated feed', async () => {
    const row = listRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(row);
    mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(
      new Map([[row.localization_id, video]]),
    );

    const response = await app.request(`/episodes/${row.localization_id}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindEpisodeListRowByLocalizationId).toHaveBeenCalledWith(
      row.localization_id,
    );
    expect(body).toEqual({ ...episodeListResponse(row), video });
  });

  it('returns 404 for a missing localization', async () => {
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(null);
    const localizationId = '00000000-0000-4000-8000-000000009999';

    const response = await app.request(`/episodes/${localizationId}`);

    expect(response.status).toBe(404);
    expect(
      mockListCompletedEpisodeVideosByLocalizationIds,
    ).not.toHaveBeenCalled();
  });

  it('rejects malformed localization ids before querying Supabase', async () => {
    const response = await app.request('/episodes/not-a-uuid');

    expect(response.status).toBe(404);
    expect(mockFindEpisodeListRowByLocalizationId).not.toHaveBeenCalled();
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

  it('returns the localization completed video after marking listened', async () => {
    const localization = localizationRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localization);
    mockListCompletedEpisodeVideosByLocalizationIds.mockResolvedValue(
      new Map([[localization.id, video]]),
    );

    const response = await app.request(
      `/episodes/${episodeRow().id}/listened`,
      {
        method: 'POST',
      },
    );
    const body = await response.json();

    expect(body.video).toEqual(video);
  });

  it('returns 404 when the episode cannot be marked listened', async () => {
    mockMarkEpisodeListened.mockResolvedValue(null);

    const response = await app.request(
      `/episodes/${episodeRow().id}/listened`,
      {
        method: 'POST',
      },
    );

    expect(response.status).toBe(404);
    expect(mockFindEpisodeLocalizationByEpisodeId).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested localization is missing', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(null);

    const response = await app.request(
      `/episodes/${episodeRow().id}/listened?language=en`,
      {
        method: 'POST',
      },
    );

    expect(response.status).toBe(404);
    expect(mockMarkEpisodeListened).toHaveBeenCalledWith(episodeRow().id);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episodeRow().id,
      'en',
    );
  });
});

describe('app error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLanguageClassroomsByLocalizationIds.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns a production 500 body for non-HTTP errors', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListEpisodesPaged.mockRejectedValue(new Error('database unavailable'));

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
  });

  it('includes Error causes in development error responses', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListEpisodesPaged.mockRejectedValue(
      new Error('outer failure', { cause: new Error('inner failure') }),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        error: 'Internal server error',
        name: 'Error',
        message: 'outer failure',
        cause: expect.objectContaining({
          name: 'Error',
          message: 'inner failure',
        }),
      }),
    );
  });
});

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

function configureFreshTelegramIngest(): void {
  const localizations = new Map<string, EpisodeLocalizationRow>();

  mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
  mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
    (_episodeId: string, languageCode: string) =>
      Promise.resolve(localizations.get(languageCode) ?? null),
  );
  mockScrapeArticle.mockResolvedValue({
    title: '软件更新',
    text: '鼠标和自行车市场',
  });
  mockConvertArticleToZhTW.mockReturnValue({
    title: '軟體更新',
    text: '滑鼠和腳踏車市場',
  });
  mockInsertEpisodeLocalization.mockImplementation(
    (localization: {
      languageCode: string;
      title: string;
      hlsUrl: string;
      rawText: string;
      script: string;
      llmModel: string;
      llmThinkingModel: string | null;
      llmProvider: string;
      status: EpisodeLocalizationRow['status'];
    }) => {
      const row = localizationRow({
        id: `${localization.languageCode}-localization`,
        language_code: localization.languageCode,
        title: localization.title,
        hls_url: localization.hlsUrl,
        raw_text: localization.rawText,
        script: localization.script,
        llm_model: localization.llmModel,
        llm_thinking_model: localization.llmThinkingModel,
        llm_provider: localization.llmProvider,
        status: localization.status,
      });
      localizations.set(localization.languageCode, row);
      return Promise.resolve(row);
    },
  );
  mockGenerateScriptWithLLM.mockResolvedValue({
    script: 'Generated script',
    model: 'test-model',
    thinkingModel: null,
    provider: 'test-provider',
    costUsd: 0.00001,
  });
  mockTranslateCanonicalScript.mockImplementation(
    ({ targetLanguageCode }: { targetLanguageCode: 'ja' | 'en' }) =>
      Promise.resolve({
        title: targetLanguageCode === 'ja' ? '日本語タイトル' : 'English title',
        script:
          targetLanguageCode === 'ja' ? '日本語スクリプト' : 'English script',
        cost: [
          {
            category: 'translate',
            label: `Translation ${targetLanguageCode}`,
            provider: 'google',
            model: 'nmt',
            costUsd: 0.0001,
            usage: {
              unit: 'characters',
              quantity: 5,
              unitPriceUsd: 0.00002,
            },
          },
        ],
      }),
  );
  mockUpdateEpisodeLocalizationArticleContent.mockResolvedValue(null);
  mockUpdateEpisodeLocalizationStatus.mockImplementation(
    (id: string, status: EpisodeLocalizationRow['status'], updates = {}) => {
      const entry = [...localizations.entries()].find(
        ([, row]) => row.id === id,
      );
      if (!entry) return Promise.resolve(null);

      const [languageCode, row] = entry;
      const update = updates as {
        hlsUrl?: string;
        script?: string;
        r2Prefix?: string | null;
        llmModel?: string;
        llmThinkingModel?: string | null;
        llmProvider?: string;
        ttsLanguageCode?: string | null;
        ttsVoiceName?: string | null;
        classroomHlsUrl?: string;
        classroomR2Prefix?: string | null;
      };
      const next = localizationRow({
        ...row,
        status,
        hls_url: update.hlsUrl ?? row.hls_url,
        script: update.script ?? row.script,
        r2_prefix:
          update.r2Prefix === undefined ? row.r2_prefix : update.r2Prefix,
        llm_model: update.llmModel ?? row.llm_model,
        llm_thinking_model:
          update.llmThinkingModel === undefined
            ? row.llm_thinking_model
            : update.llmThinkingModel,
        llm_provider: update.llmProvider ?? row.llm_provider,
        tts_language_code:
          update.ttsLanguageCode === undefined
            ? row.tts_language_code
            : update.ttsLanguageCode,
        tts_voice_name:
          update.ttsVoiceName === undefined
            ? row.tts_voice_name
            : update.ttsVoiceName,
        classroom_hls_url:
          update.classroomHlsUrl === undefined
            ? row.classroom_hls_url
            : update.classroomHlsUrl,
        classroom_r2_prefix:
          update.classroomR2Prefix === undefined
            ? row.classroom_r2_prefix
            : update.classroomR2Prefix,
      });
      localizations.set(languageCode, next);
      return Promise.resolve(next);
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
        usage: {
          unit: 'utf8_bytes',
          quantity: 4,
          unitPriceUsd: 0.000015,
        },
      },
    ],
  });
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
