import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classroomLesson,
  classroomRow,
  createDeferred,
  episodeFeedResponse,
  episodeListResponse,
  episodeRow,
  feedRow,
  listRow,
  localizationResponse,
  localizationRow,
  telegramUpdate,
} from './__fixtures__/index-test.js';
import { packagePodcastScript } from './services/podcast-packaging.js';
import type {
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  LanguageClassroomLesson,
} from './types.js';

const PACKAGED_SCRIPT = packagePodcastScript('Generated script');

const {
  mockConcatMp3Buffers,
  mockDecodeCursor,
  mockEnqueueEpisodeVideoJob,
  mockEnqueueEpisodeVideoVisualJob,
  mockFindEpisodeById,
  mockFindEpisodeBySourceUrl,
  mockFindEpisodeListRowByLocalizationId,
  mockFindEpisodeLocalizationByEpisodeId,
  mockFindEpisodeVideoJob,
  mockFindEpisodeVideoVisualJob,
  mockGenerateHls,
  mockGenerateLanguageClassroomsWithLLM,
  mockGenerateScriptWithLLM,
  mockInsertEpisode,
  mockInsertEpisodeLocalization,
  mockInvalidateEpisodeSearchCache,
  mockListEpisodeFeedPaged,
  mockListPublishedEpisodeCatalog,
  mockListEpisodeVideoSummariesByLocalizationIds,
  mockListEpisodeLocalizationsByEpisodeId,
  mockListLanguageClassroomAudioByLocalizationIds,
  mockListLanguageClassroomsByLocalizationId,
  mockLoadEpisodeVideoGeneration,
  mockScrapeArticle,
  mockServe,
  mockSynthesizeClassroomAudio,
  mockTextToSpeech,
  mockTranslateCanonicalScript,
  mockUpdateEpisodeLocalizationArticleContent,
  mockUpdateEpisodeLocalizationStatus,
  mockUpdateLanguageClassroomAudio,
  mockUpsertLanguageClassrooms,
  mockUploadHlsToR2,
  mockConvertArticleToZhTW,
  mockSearchEpisodes,
  mockTelegramFetch,
} = vi.hoisted(() => ({
  mockConcatMp3Buffers: vi.fn(),
  mockDecodeCursor: vi.fn(),
  mockEnqueueEpisodeVideoJob: vi.fn(),
  mockEnqueueEpisodeVideoVisualJob: vi.fn(),
  mockFindEpisodeById: vi.fn(),
  mockFindEpisodeBySourceUrl: vi.fn(),
  mockFindEpisodeListRowByLocalizationId: vi.fn(),
  mockFindEpisodeLocalizationByEpisodeId: vi.fn(),
  mockFindEpisodeVideoJob: vi.fn(),
  mockFindEpisodeVideoVisualJob: vi.fn(),
  mockGenerateHls: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGenerateScriptWithLLM: vi.fn(),
  mockInsertEpisode: vi.fn(),
  mockInsertEpisodeLocalization: vi.fn(),
  mockInvalidateEpisodeSearchCache: vi.fn(),
  mockListEpisodeFeedPaged: vi.fn(),
  mockListPublishedEpisodeCatalog: vi.fn(),
  mockListEpisodeVideoSummariesByLocalizationIds: vi
    .fn()
    .mockResolvedValue(new Map()),
  mockListEpisodeLocalizationsByEpisodeId: vi.fn(),
  mockListLanguageClassroomAudioByLocalizationIds: vi
    .fn()
    .mockResolvedValue(new Map()),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockLoadEpisodeVideoGeneration: vi.fn(),
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
  mockUpdateLanguageClassroomAudio: vi.fn(),
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
  findEpisodeById: mockFindEpisodeById,
  findEpisodeBySourceUrl: mockFindEpisodeBySourceUrl,
  findEpisodeListRowByLocalizationId: mockFindEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId: mockFindEpisodeLocalizationByEpisodeId,
  insertEpisode: mockInsertEpisode,
  insertEpisodeLocalization: mockInsertEpisodeLocalization,
  listEpisodeFeedPaged: mockListEpisodeFeedPaged,
  listPublishedEpisodeCatalog: mockListPublishedEpisodeCatalog,
  listEpisodeVideoSummariesByLocalizationIds:
    mockListEpisodeVideoSummariesByLocalizationIds,
  listEpisodeLocalizationsByEpisodeId: mockListEpisodeLocalizationsByEpisodeId,
  listLanguageClassroomAudioByLocalizationIds:
    mockListLanguageClassroomAudioByLocalizationIds,
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  toEpisodeResponse: (
    row: EpisodeListRow,
    languageClassrooms?: import('./types.js').LanguageClassroomRow[],
    video?: import('./types.js').EpisodeVideoResponse | null,
    videoGeneration?: import('./types.js').EpisodeVideoGenerationSummary | null,
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
      videoGeneration: videoGeneration ?? null,
    };
  },
  toEpisodeResponseFromLocalization: (
    episode: EpisodeRow,
    localization: EpisodeLocalizationRow,
    languageClassrooms:
      | import('./types.js').LanguageClassroomRow[]
      | LanguageClassroomLesson[],
    video?: import('./types.js').EpisodeVideoResponse | null,
    videoGeneration?: import('./types.js').EpisodeVideoGenerationSummary | null,
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
      videoGeneration: videoGeneration ?? null,
    };
  },
  upsertLanguageClassrooms: mockUpsertLanguageClassrooms,
  updateEpisodeLocalizationArticleContent:
    mockUpdateEpisodeLocalizationArticleContent,
  updateEpisodeLocalizationStatus: mockUpdateEpisodeLocalizationStatus,
  updateLanguageClassroomAudio: mockUpdateLanguageClassroomAudio,
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
  uploadEpisodeVisualAssetsToR2: vi.fn(),
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
  enqueueEpisodeVideoVisualJob: mockEnqueueEpisodeVideoVisualJob,
  findEpisodeVideoJob: mockFindEpisodeVideoJob,
  findEpisodeVideoVisualJob: mockFindEpisodeVideoVisualJob,
  getVideoJobRepository: () => ({ find: mockFindEpisodeVideoJob }),
  getVideoVisualJobRepository: () => ({ find: mockFindEpisodeVideoVisualJob }),
}));

vi.mock('./services/video-status.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/video-status.js')>()),
  loadEpisodeVideoGeneration: mockLoadEpisodeVideoGeneration,
}));

process.env['TTS_PROVIDER'] = 'google';

const app = (await import('./index.js')).default;

beforeEach(() => {
  process.env['TTS_PROVIDER'] = 'google';
  delete process.env['FISH_AUDIO_ENGINE'];
  delete process.env['FISH_AUDIO_REFERENCE_ID'];
  mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(new Map());
  mockListLanguageClassroomAudioByLocalizationIds.mockResolvedValue(new Map());
  mockLoadEpisodeVideoGeneration.mockResolvedValue(null);
  mockEnqueueEpisodeVideoJob.mockImplementation(
    (episodeLocalizationId: string) =>
      Promise.resolve({
        episode_localization_id: episodeLocalizationId,
        status: 'queued',
        mp4_url: null,
        thumbnail_url: null,
        duration_seconds: null,
        last_error: null,
        updated_at: '2026-07-24T00:00:00.000Z',
      }),
  );
  mockEnqueueEpisodeVideoVisualJob.mockResolvedValue({
    status: 'queued',
    last_error: null,
    updated_at: '2026-07-24T00:00:00.000Z',
  });
  mockFindEpisodeVideoVisualJob.mockResolvedValue(null);
  mockFindEpisodeVideoJob.mockResolvedValue(null);
  mockListEpisodeLocalizationsByEpisodeId.mockResolvedValue([
    localizationRow({
      language_code: 'zh-Hant',
      classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
    }),
    localizationRow({
      id: '00000000-0000-4000-8000-000000000003',
      language_code: 'ja',
      classroom_hls_url: null,
    }),
    localizationRow({
      id: '00000000-0000-4000-8000-000000000004',
      language_code: 'en',
      classroom_hls_url: null,
    }),
  ]);
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

  it('ignores obsolete localization cover fields', async () => {
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
      'property="og:image" content="https://is1-ssl.mzstatic.com/image/thumb/',
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
      title: '市場流動性正在重新定價',
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
              title:
                typeof data?.['title'] === 'string'
                  ? data['title']
                  : '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              hls_url: '',
              script:
                typeof data?.['script'] === 'string'
                  ? data['script']
                  : PACKAGED_SCRIPT,
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
              title: '市場流動性正在重新定價',
              raw_text: '滑鼠和腳踏車市場',
              script: PACKAGED_SCRIPT,
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
    mockUpdateLanguageClassroomAudio.mockImplementation(
      (
        _episodeLocalizationId: string,
        targetLanguageCode: string,
        updates: { hlsUrl: string; r2Prefix: string },
      ) =>
        Promise.resolve(
          classroomRow({
            target_language_code: targetLanguageCode,
            hls_url: updates.hlsUrl,
            r2_prefix: updates.r2Prefix,
          }),
        ),
    );
    mockGenerateHls.mockResolvedValue({
      files: [
        {
          name: 'playlist.m3u8',
          path: '/render/hls/playlist.m3u8',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      playlistKey: 'playlist.m3u8',
      cleanup: vi.fn().mockResolvedValue(undefined),
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
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'script_generated',
      expect.objectContaining({
        title: '市場流動性正在重新定價',
        script: PACKAGED_SCRIPT,
      }),
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledTimes(4);
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
      undefined,
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'classroom',
      'ja',
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'classroom',
      'en',
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'classroom',
      undefined,
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
        title: '市場流動性正在重新定價',
        articleText: '滑鼠和腳踏車市場',
        script: 'Generated script',
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
    mockListEpisodeLocalizationsByEpisodeId.mockResolvedValue([
      canonicalLocalization,
      jaLocalization,
      enLocalization,
    ]);
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
    mockEnqueueEpisodeVideoJob.mockImplementation(
      (episodeLocalizationId: string) =>
        Promise.resolve({
          episode_localization_id: episodeLocalizationId,
          status: 'queued',
          attempt_count: 0,
          mp4_url: null,
          thumbnail_url: null,
          duration_seconds: null,
          last_error: null,
          updated_at: '2026-07-24T00:00:00.000Z',
        }),
    );
    mockFindEpisodeVideoVisualJob.mockResolvedValue({
      status: 'queued',
      last_error: null,
      updated_at: '2026-07-24T00:00:00.000Z',
    });
    mockFindEpisodeVideoJob.mockImplementation(
      (episodeLocalizationId: string) =>
        Promise.resolve({
          episode_localization_id: episodeLocalizationId,
          status: 'queued',
          mp4_url: null,
          thumbnail_url: null,
          duration_seconds: null,
          last_error: null,
          updated_at: '2026-07-24T00:00:00.000Z',
        }),
    );

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as {
      episode: Omit<EpisodeResponse, 'video' | 'videoGeneration'>;
      localizations: {
        languageCode: string;
        localizationId: string;
        status: string;
        hasMainAudio: boolean;
        hasClassroomAudio: boolean | null;
        updatedAt: string;
      }[];
      runId: string;
      costUsd: number;
      costDetails: { totalUsd: number; breakdown: unknown[] };
      summary: string;
      videoGeneration: {
        episodeId: string;
        status: string;
        statusEndpoint: string;
        visual: { status: string; previousError: string | null } | null;
        items: {
          languageCode: string;
          localizationId: string;
          status: string;
        }[];
      };
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'costDetails',
      'costUsd',
      'episode',
      'localizations',
      'runId',
      'summary',
      'videoGeneration',
    ]);
    expect(body.runId).toMatch(/^[0-9a-f-]{8}$/);
    expect(response.headers.get('x-run-id')).toBe(body.runId);
    expect(body.episode).toMatchObject({
      id: episodeRow().id,
      localizationId: canonicalLocalization.id,
      languageCode: 'zh-Hant',
    });
    expect(body.episode).not.toHaveProperty('video');
    expect(body.episode).not.toHaveProperty('videoGeneration');
    expect(body.localizations).toEqual([
      {
        languageCode: 'zh-Hant',
        localizationId: canonicalLocalization.id,
        status: 'completed',
        hasMainAudio: true,
        hasClassroomAudio: true,
        updatedAt: canonicalLocalization.updated_at,
      },
      {
        languageCode: 'ja',
        localizationId: jaLocalization.id,
        status: 'completed',
        hasMainAudio: true,
        hasClassroomAudio: null,
        updatedAt: jaLocalization.updated_at,
      },
      {
        languageCode: 'en',
        localizationId: enLocalization.id,
        status: 'completed',
        hasMainAudio: true,
        hasClassroomAudio: null,
        updatedAt: enLocalization.updated_at,
      },
    ]);
    expect(body.videoGeneration).toMatchObject({
      episodeId: episodeRow().id,
      status: 'queued',
      statusEndpoint: `/episodes/${episodeRow().id}/videos`,
      visual: { status: 'queued', previousError: null },
      items: [
        {
          languageCode: 'zh-Hant',
          localizationId: canonicalLocalization.id,
          status: 'queued',
        },
        {
          languageCode: 'ja',
          localizationId: jaLocalization.id,
          status: 'queued',
        },
        {
          languageCode: 'en',
          localizationId: enLocalization.id,
          status: 'queued',
        },
      ],
    });
    expect(body.costUsd).toBe(0);
    expect(body.costDetails).toEqual({ totalUsd: 0, breakdown: [] });
    expect(body.summary).toContain('✅ 已存在');

    expect(mockEnqueueEpisodeVideoVisualJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEpisodeVideoJob.mock.calls).toEqual([
      [canonicalLocalization.id, null],
      [jaLocalization.id, null],
      [enLocalization.id, null],
    ]);
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

  it('keeps all languages in videoGeneration when the video enqueue fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockEnqueueEpisodeVideoVisualJob.mockRejectedValue(
      new Error('supabase rpc unavailable'),
    );

    const response = await app.request('/ingest', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    });
    const body = (await response.json()) as {
      videoGeneration: {
        status: string;
        error: string | null;
        items: { languageCode: string; status: string }[];
      };
    };

    expect(response.status).toBe(201);
    expect(body.videoGeneration.error).toBe('supabase rpc unavailable');
    expect(body.videoGeneration.status).toBe('unavailable');
    expect(body.videoGeneration.items.map((item) => item.languageCode)).toEqual(
      ['zh-Hant', 'ja', 'en'],
    );
    expect(
      body.videoGeneration.items.every((item) => item.status === 'unavailable'),
    ).toBe(true);
  });

  it('surfaces the previous visual error wiped by a self-healing re-submission', async () => {
    // First attempt failed; the re-POST resets the row (clearing last_error),
    // so the response must carry the wiped message as previousError.
    mockFindEpisodeVideoVisualJob
      .mockResolvedValueOnce({
        status: 'failed',
        last_error:
          'Unsupported episode visual version: podcast-image-visual-plan.v3',
        updated_at: '2026-07-24T00:00:00.000Z',
      })
      .mockResolvedValue({
        status: 'queued',
        last_error: null,
        updated_at: '2026-07-24T00:01:00.000Z',
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
      videoGeneration: {
        visual: {
          status: string;
          lastError: string | null;
          previousError: string | null;
        } | null;
      };
    };

    expect(response.status).toBe(201);
    expect(body.videoGeneration.visual).toMatchObject({
      status: 'queued',
      lastError: null,
      previousError:
        'Unsupported episode visual version: podcast-image-visual-plan.v3',
    });
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
    mockUpdateLanguageClassroomAudio.mockImplementation(
      (
        _episodeLocalizationId: string,
        targetLanguageCode: string,
        updates: { hlsUrl: string; r2Prefix: string },
      ) =>
        Promise.resolve(
          classroomRow({
            target_language_code: targetLanguageCode,
            hls_url: updates.hlsUrl,
            r2_prefix: updates.r2Prefix,
          }),
        ),
    );
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
      expect.stringContaining('貼一個 PANews 文章 URL'),
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
        expect.stringContaining('貼一個 PANews 文章 URL'),
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
      expect.stringContaining('貼一個 PANews 文章 URL'),
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

  it('retries the explicit source URL instead of a URL embedded in the failure error', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-1',
        data: 'retry_ingest',
        from: { id: 12345 },
        message: {
          message_id: 2,
          chat: { id: 67890 },
          text: [
            '❌ 失敗 [step:uploadMainHlsToR2] Please look at https://www.cloudflarestatus.com for issues or contact customer support.',
            'URL: https://example.com/article',
          ].join('\n'),
        },
      },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledWith(
        'https://example.com/article',
      ),
    );
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalledWith(
      'https://www.cloudflarestatus.com',
    );
  });

  it('ignores retry callbacks from disallowed users or unrelated callback actions', async () => {
    for (const callbackQuery of [
      {
        id: 'callback-disallowed',
        data: 'retry_ingest',
        from: { id: 99999 },
        message: {
          chat: { id: 67890 },
          text: 'URL: https://example.com/article',
        },
      },
      {
        id: 'callback-other-action',
        data: 'other_action',
        from: { id: 12345 },
        message: {
          chat: { id: 67890 },
          text: 'URL: https://example.com/article',
        },
      },
    ]) {
      const response = await postTelegramUpdate({
        update_id: 1,
        callback_query: callbackQuery,
      });
      expect(response.status).toBe(200);
    }
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('ignores retry callbacks whose required fields have invalid shapes', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-invalid-chat',
        data: 'retry_ingest',
        from: { id: 12345 },
        message: {
          chat: { id: { nested: true } },
          text: 'URL: https://example.com/article',
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockFindEpisodeBySourceUrl).not.toHaveBeenCalled();
  });

  it('accepts a string chat id on a valid retry callback', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-string-chat',
        data: 'retry_ingest',
        from: { id: 12345 },
        message: {
          chat: { id: '67890' },
          text: 'URL: https://example.com/article',
        },
      },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledWith(
        'https://example.com/article',
      ),
    );
  });

  it('answers a retry callback whose failure message no longer contains a source URL', async () => {
    const response = await postTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-no-url',
        data: 'retry_ingest',
        from: { id: 12345 },
        message: {
          chat: { id: 67890 },
          text: '❌ 失敗，但沒有 URL 欄位',
        },
      },
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mockTelegramFetch).toHaveBeenCalledTimes(1));
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
    // One deduped run performs exactly two source-url lookups: the
    // heavy-work bypass pre-check plus the ingest resume check. A second
    // ingest would add more.
    expect(mockFindEpisodeBySourceUrl).toHaveBeenCalledTimes(2);
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
    mockListEpisodeFeedPaged.mockResolvedValue({ rows: [], nextCursor: null });
  });

  it('returns a paginated feed response for zh-Hant', async () => {
    const row = feedRow();
    mockListEpisodeFeedPaged.mockResolvedValue({
      rows: [row],
      nextCursor: 'next-cursor',
    });

    const response = await app.request('/episodes?limit=5');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListEpisodeFeedPaged).toHaveBeenCalledWith(5, null, 'zh-Hant');
    expect(body).toEqual({
      items: [episodeFeedResponse(row)],
      nextCursor: 'next-cursor',
    });
  });

  it('omits script and language classrooms from the feed payload', async () => {
    const row = feedRow();
    mockListEpisodeFeedPaged.mockResolvedValue({
      rows: [row],
      nextCursor: null,
    });

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListEpisodeFeedPaged).toHaveBeenCalledWith(20, null, 'zh-Hant');
    expect(body.items[0]).not.toHaveProperty('script');
    expect(body.items[0]).not.toHaveProperty('languageClassrooms');
    expect(body.items[0].audioTracks[0].classroomHlsUrl).toBe(
      row.classroom_hls_url,
    );
  });

  it('hydrates feed video fields with one batch query', async () => {
    const row = feedRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    const videoGeneration = {
      status: 'completed' as const,
      updatedAt: '2026-07-24T00:00:00.000Z',
    };
    mockListEpisodeFeedPaged.mockResolvedValue({
      rows: [row],
      nextCursor: null,
    });
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          row.localization_id,
          {
            video,
            videoGeneration,
          },
        ],
      ]),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(mockListEpisodeVideoSummariesByLocalizationIds).toHaveBeenCalledWith(
      [row.localization_id],
    );
    expect(body.items[0].video).toEqual(video);
    expect(body.items[0].videoGeneration).toEqual(videoGeneration);
  });

  it('serves the public progress fields without leaking failure details', async () => {
    const row = listRow();
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(row);
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          row.localization_id,
          {
            video: null,
            videoGeneration: {
              status: 'queued' as const,
              updatedAt: '2026-07-24T02:30:00.000Z',
              progressPercent: 22,
              stage: 'selecting-images' as const,
            },
          },
        ],
      ]),
    );

    const response = await app.request(`/episodes/${row.localization_id}`);
    const body = await response.json();

    expect(body.videoGeneration).toEqual({
      status: 'queued',
      updatedAt: '2026-07-24T02:30:00.000Z',
      progressPercent: 22,
      stage: 'selecting-images',
    });
    expect(JSON.stringify(body)).not.toContain('lastError');
  });

  it('returns a processing generation status while the video is unavailable', async () => {
    const row = feedRow();
    const videoGeneration = {
      status: 'processing' as const,
      updatedAt: '2026-07-24T00:00:00.000Z',
    };
    mockListEpisodeFeedPaged.mockResolvedValue({
      rows: [row],
      nextCursor: null,
    });
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          row.localization_id,
          {
            video: null,
            videoGeneration,
          },
        ],
      ]),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(body.items[0]).toMatchObject({
      video: null,
      videoGeneration,
    });
  });

  it('redacts internal video failure details from the public feed', async () => {
    const row = feedRow();
    mockListEpisodeFeedPaged.mockResolvedValue({
      rows: [row],
      nextCursor: null,
    });
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          row.localization_id,
          {
            video: null,
            videoGeneration: {
              status: 'failed',
              updatedAt: '2026-07-24T00:00:00.000Z',
            },
          },
        ],
      ]),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(body.items[0].videoGeneration).toEqual({
      status: 'failed',
      updatedAt: '2026-07-24T00:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('lastError');
  });

  it('returns 400 for an invalid limit', async () => {
    const response = await app.request('/episodes?limit=abc');

    expect(response.status).toBe(400);
    expect(mockListEpisodeFeedPaged).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid cursor', async () => {
    mockDecodeCursor.mockImplementation(() => {
      throw new Error('bad cursor');
    });

    const response = await app.request('/episodes?cursor=garbage');

    expect(response.status).toBe(400);
    expect(mockListEpisodeFeedPaged).not.toHaveBeenCalled();
  });

  it('returns 400 for unsupported language codes', async () => {
    const response = await app.request('/episodes?language=fr');

    expect(response.status).toBe(400);
    expect(mockListEpisodeFeedPaged).not.toHaveBeenCalled();
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

  it('hydrates ranked search results with one video-summary batch query', async () => {
    const episode = episodeListResponse(listRow());
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    const videoGeneration = {
      status: 'completed' as const,
      updatedAt: '2026-07-24T00:00:00.000Z',
    };
    mockSearchEpisodes.mockResolvedValue([
      { episode, matchSource: 'title', snippet: null },
    ]);
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          episode.localizationId,
          {
            video,
            videoGeneration,
          },
        ],
      ]),
    );

    const response = await app.request('/episodes/search?q=liquidity');
    const body = await response.json();

    expect(mockListEpisodeVideoSummariesByLocalizationIds).toHaveBeenCalledWith(
      [episode.localizationId],
    );
    expect(body.items[0].episode.video).toEqual(video);
    expect(body.items[0].episode.videoGeneration).toEqual(videoGeneration);
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

describe('GET /episodes/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns published localization ids grouped by language', async () => {
    const catalog = {
      'zh-Hant': ['00000000-0000-4000-8000-000000000101'],
      ja: ['00000000-0000-4000-8000-000000000102'],
      en: ['00000000-0000-4000-8000-000000000103'],
    };
    mockListPublishedEpisodeCatalog.mockResolvedValue(catalog);

    const response = await app.request('/episodes/catalog');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ languages: catalog });
    expect(mockListPublishedEpisodeCatalog).toHaveBeenCalledOnce();
    expect(mockFindEpisodeListRowByLocalizationId).not.toHaveBeenCalled();
  });

  it('keeps all three language keys when the catalog is empty', async () => {
    mockListPublishedEpisodeCatalog.mockResolvedValue({
      'zh-Hant': [],
      ja: [],
      en: [],
    });

    const response = await app.request('/episodes/catalog');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      languages: {
        'zh-Hant': [],
        ja: [],
        en: [],
      },
    });
  });
});

describe('GET /episodes/:episodeId/videos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INGEST_ADMIN_TOKEN', 'secret-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns generation status and URLs for every language', async () => {
    const episodeId = episodeRow().id;
    const videoGeneration = {
      episodeId,
      status: 'completed',
      statusEndpoint: `/episodes/${episodeId}/videos`,
      error: null,
      visual: {
        status: 'completed',
        lastError: null,
        updatedAt: '2026-07-24T00:00:00.000Z',
      },
      items: [
        {
          languageCode: 'zh-Hant',
          localizationId: localizationRow().id,
          status: 'completed',
          url: 'https://cdn.example.com/zh-Hant.mp4',
          thumbnailUrl: 'https://cdn.example.com/zh-Hant.png',
          durationSeconds: 90,
          lastError: null,
          updatedAt: '2026-07-24T00:00:00.000Z',
          episodeEndpoint: `/episodes/${localizationRow().id}`,
        },
      ],
    };
    mockLoadEpisodeVideoGeneration.mockResolvedValue(videoGeneration);

    const response = await app.request(`/episodes/${episodeId}/videos`, {
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(videoGeneration);
    expect(mockLoadEpisodeVideoGeneration).toHaveBeenCalledWith(episodeId);
  });

  it('requires admin authorization', async () => {
    const response = await app.request(`/episodes/${episodeRow().id}/videos`);

    expect(response.status).toBe(401);
    expect(mockLoadEpisodeVideoGeneration).not.toHaveBeenCalled();
  });

  it('returns 404 when the episode does not exist', async () => {
    mockLoadEpisodeVideoGeneration.mockResolvedValue(null);

    const response = await app.request(`/episodes/${episodeRow().id}/videos`, {
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(response.status).toBe(404);
  });

  it('rejects malformed episode ids before querying Supabase', async () => {
    const response = await app.request('/episodes/not-a-uuid/videos', {
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(response.status).toBe(404);
    expect(mockLoadEpisodeVideoGeneration).not.toHaveBeenCalled();
  });
});

describe('GET /episodes/:localizationId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(new Map());
  });

  it('returns a completed localization outside the paginated feed', async () => {
    const row = listRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    const videoGeneration = {
      status: 'completed' as const,
      updatedAt: '2026-07-24T00:00:00.000Z',
    };
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(row);
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          row.localization_id,
          {
            video,
            videoGeneration,
          },
        ],
      ]),
    );

    const response = await app.request(`/episodes/${row.localization_id}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindEpisodeListRowByLocalizationId).toHaveBeenCalledWith(
      row.localization_id,
    );
    expect(body).toEqual({
      ...episodeListResponse(row),
      video,
      videoGeneration,
    });
  });

  it('defaults a missing generation summary to null even when a video summary row exists', async () => {
    const row = listRow();
    const video = {
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 90,
    };
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(row);
    mockListEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([[row.localization_id, { video } as never]]),
    );

    const response = await app.request(`/episodes/${row.localization_id}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.video).toEqual(video);
    expect(body.videoGeneration).toBeNull();
  });

  it('returns 404 for a missing localization with no language fallback requested', async () => {
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(null);
    const localizationId = '00000000-0000-4000-8000-000000009999';

    const response = await app.request(`/episodes/${localizationId}`);

    expect(response.status).toBe(404);
    expect(
      mockListEpisodeVideoSummariesByLocalizationIds,
    ).not.toHaveBeenCalled();
    expect(mockFindEpisodeById).not.toHaveBeenCalled();
  });

  it('rejects malformed localization ids before querying Supabase', async () => {
    const response = await app.request('/episodes/not-a-uuid');

    expect(response.status).toBe(404);
    expect(mockFindEpisodeListRowByLocalizationId).not.toHaveBeenCalled();
  });

  it('falls back to the canonical episode id and ?language= when the path segment is not a localization id', async () => {
    const episode = episodeRow();
    const localization = localizationRow({
      id: '00000000-0000-4000-8000-000000000102',
      language_code: 'en',
      title: 'Localization title (EN)',
    });
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(null);
    mockFindEpisodeById.mockResolvedValue(episode);
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(localization);
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow(),
    ]);

    const response = await app.request(`/episodes/${episode.id}?language=en`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindEpisodeById).toHaveBeenCalledWith(episode.id);
    expect(mockFindEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      episode.id,
      'en',
    );
    expect(body).toEqual({
      ...localizationResponse(episode, localization, [classroomLesson()]),
      video: null,
      videoGeneration: null,
    });
  });

  it('returns 404 when the canonical episode id also cannot be resolved', async () => {
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(null);
    mockFindEpisodeById.mockResolvedValue(null);

    const response = await app.request(
      `/episodes/${episodeRow().id}?language=en`,
    );

    expect(response.status).toBe(404);
    expect(mockFindEpisodeLocalizationByEpisodeId).not.toHaveBeenCalled();
  });

  it('returns 404 when the canonical episode resolves but has no localization for that language', async () => {
    mockFindEpisodeListRowByLocalizationId.mockResolvedValue(null);
    mockFindEpisodeById.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(null);

    const response = await app.request(
      `/episodes/${episodeRow().id}?language=ja`,
    );

    expect(response.status).toBe(404);
  });
});

describe('app error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns a production 500 body for non-HTTP errors', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListEpisodeFeedPaged.mockRejectedValue(
      new Error('database unavailable'),
    );

    const response = await app.request('/episodes');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
  });

  it('includes Error causes in development error responses', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListEpisodeFeedPaged.mockRejectedValue(
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
    title: null,
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
        path: '/render/hls/playlist.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
      },
    ],
    playlistKey: 'playlist.m3u8',
    cleanup: vi.fn().mockResolvedValue(undefined),
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
