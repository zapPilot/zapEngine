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
  mockConcatMp3Buffers,
  mockGenerateHls,
  mockGenerateLanguageClassroomsWithLLM,
  mockGenerateScriptWithLLM,
  mockInsertEpisode,
  mockInsertEpisodeLocalization,
  mockListLanguageClassroomsByLocalizationId,
  mockScrapeArticle,
  mockSynthesizeClassroomAudio,
  mockTextToSpeech,
  mockTranslateCanonicalScript,
  mockUpdateEpisodeLocalizationArticleContent,
  mockUpdateEpisodeLocalizationStatus,
  mockUpsertLanguageClassrooms,
  mockUploadHlsToR2,
  mockConvertArticleToZhTW,
} = vi.hoisted(() => ({
  mockFindEpisodeBySourceUrl: vi.fn(),
  mockFindEpisodeLocalizationByEpisodeId: vi.fn(),
  mockConcatMp3Buffers: vi.fn(),
  mockGenerateHls: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGenerateScriptWithLLM: vi.fn(),
  mockInsertEpisode: vi.fn(),
  mockInsertEpisodeLocalization: vi.fn(),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockScrapeArticle: vi.fn(),
  mockSynthesizeClassroomAudio: vi.fn(),
  mockTextToSpeech: vi.fn(),
  mockTranslateCanonicalScript: vi.fn(),
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

vi.mock('./tts/audio-concat.js', () => ({
  concatMp3Buffers: mockConcatMp3Buffers,
}));

vi.mock('./podcast/classroom-audio.js', () => ({
  synthesizeClassroomAudio: mockSynthesizeClassroomAudio,
}));

vi.mock('./tts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tts.js')>()),
  textToSpeech: mockTextToSpeech,
}));

vi.mock('./opencc.js', () => ({
  convertArticleToZhTW: mockConvertArticleToZhTW,
}));

vi.mock('./translate.js', () => ({
  translateCanonicalScript: mockTranslateCanonicalScript,
}));

const { performIngest } = await import('./ingest.js');
const performMultilingualIngest = (
  (await import('./ingest.js')) as unknown as {
    performMultilingualIngest: typeof performIngest;
  }
).performMultilingualIngest;

describe('performIngest failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['TTS_PROVIDER'] = 'google';
    delete process.env['FISH_AUDIO_MODEL_ID'];
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
    mockTranslateCanonicalScript.mockResolvedValue({
      title: 'Translated title',
      script: 'Translated script',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
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
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([]);
    mockSynthesizeClassroomAudio.mockResolvedValue({ audio: null, cost: [] });
    mockConcatMp3Buffers.mockResolvedValue(Buffer.from('combined-audio'));
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
    ).rejects.toThrow('[step:uploadMainHlsToR2] R2 upload failed');

    expect(mockTextToSpeech).toHaveBeenCalledWith('Generated script', {
      languageCode: 'zh-Hant',
      usage: 'main',
      costLabel: 'TTS main audio',
    });
    expect(mockGenerateHls).toHaveBeenCalledWith(Buffer.from('audio'));
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
    );
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
    expect(result.costUsd).toBeCloseTo(0.00016, 10);
    expect(result.costDetails.breakdown).toEqual([
      expect.objectContaining({
        category: 'llm',
        label: 'LLM script',
        costUsd: 0.00001,
      }),
      expect.objectContaining({
        category: 'llm',
        label: 'LLM classrooms',
        costUsd: 0.00009,
      }),
      expect.objectContaining({
        category: 'tts',
        label: 'TTS main audio',
        costUsd: 0.00006,
      }),
    ]);
  });

  it('uploads main and classroom audio separately without concatenating classroom into main', async () => {
    const lessons = [
      {
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'Japanese lesson',
        keywords: [],
      },
      {
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'en',
        oneLiner: 'English lesson',
        keywords: [],
      },
    ];
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons,
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([
      classroomRow({
        id: 'classroom-ja',
        target_language_code: 'ja',
        one_liner: 'Japanese lesson',
      }),
      classroomRow({
        id: 'classroom-en',
        target_language_code: 'en',
        one_liner: 'English lesson',
      }),
    ]);
    mockSynthesizeClassroomAudio
      .mockResolvedValueOnce({
        audio: Buffer.from('ja-classroom'),
        cost: [
          {
            category: 'tts',
            label: 'TTS classroom audio',
            provider: 'google',
            model: 'ja-JP-Wavenet-A',
            costUsd: 0.00003,
          },
        ],
      })
      .mockResolvedValueOnce({
        audio: Buffer.from('en-classroom'),
        cost: [
          {
            category: 'tts',
            label: 'TTS classroom audio',
            provider: 'google',
            model: 'en-US-Wavenet-A',
            costUsd: 0.00004,
          },
        ],
      });
    mockConcatMp3Buffers.mockResolvedValueOnce(Buffer.from('classroom-audio'));

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(mockTextToSpeech).toHaveBeenCalledWith('Generated script', {
      languageCode: 'zh-Hant',
      usage: 'main',
      costLabel: 'TTS main audio',
    });
    expect(result.costUsd).toBeCloseTo(0.00023, 10);
    expect(result.costDetails.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'LLM script', costUsd: 0.00001 }),
        expect.objectContaining({
          label: 'LLM classrooms',
          costUsd: 0.00009,
        }),
        expect.objectContaining({
          label: 'TTS main audio',
          costUsd: 0.00006,
        }),
        expect.objectContaining({
          label: 'TTS classroom audio',
          costUsd: 0.00003,
        }),
        expect.objectContaining({
          label: 'TTS classroom audio',
          costUsd: 0.00004,
        }),
      ]),
    );
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguageCode: 'ja' }),
      { episodeId: episodeRow().id },
    );
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguageCode: 'en' }),
      { episodeId: episodeRow().id },
    );
    expect(mockConcatMp3Buffers).toHaveBeenCalledTimes(1);
    expect(mockConcatMp3Buffers).toHaveBeenNthCalledWith(1, [
      Buffer.from('ja-classroom'),
      Buffer.from('en-classroom'),
    ]);
    expect(mockGenerateHls).toHaveBeenCalledTimes(2);
    expect(mockGenerateHls).toHaveBeenNthCalledWith(1, Buffer.from('audio'));
    expect(mockGenerateHls).toHaveBeenNthCalledWith(
      2,
      Buffer.from('classroom-audio'),
    );
    expect(mockGenerateHls).not.toHaveBeenCalledWith(
      Buffer.from('audioclassroom-audio'),
    );
    expect(mockUploadHlsToR2).toHaveBeenCalledTimes(2);
    expect(mockUploadHlsToR2).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
    );
    expect(mockUploadHlsToR2).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'classroom',
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        hlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main/playlist.m3u8',
        r2Prefix:
          'episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
        classroomR2Prefix:
          'episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom',
      }),
    );
  });

  it('publishes main audio only when classroom LLM generation fails before HLS generation', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockGenerateLanguageClassroomsWithLLM.mockRejectedValue(
      new Error('LLM timeout'),
    );

    await performIngest('https://example.com/article', 'zh-Hant');

    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockConcatMp3Buffers).not.toHaveBeenCalled();
    expect(mockGenerateHls).toHaveBeenCalledWith(Buffer.from('audio'));
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.not.objectContaining({
        classroomHlsUrl: expect.any(String),
        classroomR2Prefix: expect.any(String),
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[/ingest] language classroom generation failed:',
      expect.objectContaining({
        episodeLocalizationId: localizationRow().id,
        sourceLanguageCode: 'zh-Hant',
        message: '[step:generateLanguageClassrooms] LLM timeout',
      }),
    );
  });

  it('skips only the classroom audio item that fails synthesis', async () => {
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'ja',
          oneLiner: 'Japanese lesson',
          keywords: [],
        },
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'en',
          oneLiner: 'English lesson',
          keywords: [],
        },
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([
      classroomRow({
        id: 'classroom-ja',
        target_language_code: 'ja',
        one_liner: 'Japanese lesson',
      }),
      classroomRow({
        id: 'classroom-en',
        target_language_code: 'en',
        one_liner: 'English lesson',
      }),
    ]);
    mockSynthesizeClassroomAudio
      .mockResolvedValueOnce({
        audio: Buffer.from('ja-classroom'),
        cost: [
          {
            category: 'tts',
            label: 'TTS classroom audio',
            provider: 'google',
            model: 'ja-JP-Wavenet-A',
            costUsd: 0.00003,
          },
        ],
      })
      .mockResolvedValueOnce({ audio: null, cost: [] });
    mockConcatMp3Buffers.mockResolvedValueOnce(Buffer.from('classroom-audio'));

    await performIngest('https://example.com/article', 'zh-Hant');

    expect(mockConcatMp3Buffers).toHaveBeenNthCalledWith(1, [
      Buffer.from('ja-classroom'),
    ]);
    expect(mockGenerateHls).toHaveBeenNthCalledWith(1, Buffer.from('audio'));
    expect(mockGenerateHls).toHaveBeenNthCalledWith(
      2,
      Buffer.from('classroom-audio'),
    );
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

  it('can continue from an existing secondary script without retranslating', async () => {
    const chineseLocalization = localizationRow({
      language_code: 'zh-Hant',
      title: '中文標題',
      script: '中文腳本',
      status: 'script_generated',
    });
    const englishLocalization = localizationRow({
      language_code: 'en',
      status: 'script_generated',
      script: 'English script',
    });
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) => {
        if (languageCode === 'zh-Hant') {
          return Promise.resolve(chineseLocalization);
        }
        if (languageCode === 'en') {
          return Promise.resolve(englishLocalization);
        }
        return Promise.resolve(null);
      },
    );

    const result = await performIngest('https://example.com/article', 'en');

    expect(result.statusCode).toBe(201);
    expect(mockScrapeArticle).not.toHaveBeenCalled();
    expect(mockConvertArticleToZhTW).not.toHaveBeenCalled();
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
    expect(mockTranslateCanonicalScript).not.toHaveBeenCalled();
    expect(mockTextToSpeech).toHaveBeenCalledWith('English script', {
      languageCode: 'en',
      usage: 'main',
      costLabel: 'TTS main audio',
    });
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsLanguageCode: 'en-US',
        ttsVoiceName: 'en-US-Wavenet-A',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
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

  it('reuses completed audio even when stored TTS metadata differs from the current Fish Audio config', async () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', 'fish-model');
    const existingLocalization = localizationRow({
      status: 'completed',
      script: 'Existing script',
      hls_url: 'https://cdn.example.com/google-playlist.m3u8',
      tts_language_code: 'cmn-TW',
      tts_voice_name: 'cmn-TW-Wavenet-A',
    });
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      existingLocalization,
    );

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(200);
    expect(mockScrapeArticle).not.toHaveBeenCalled();
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      existingLocalization.id,
      'completed',
      expect.anything(),
    );
  });

  it('reuses completed audio when stored TTS metadata matches Fish Audio config', async () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', 'fish-model');
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        status: 'completed',
        tts_language_code: 'zh-Hant',
        tts_voice_name: 'fish-model',
      }),
    );

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(200);
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.anything(),
    );
  });

  it('retains only non-persisted existing classrooms when LLM generates subset', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({ status: 'scraped' }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
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

  it('retains existing classrooms whose target was not regenerated', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({ status: 'scraped', script: '' }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
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
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([
      classroomRow({
        id: 'classroom-en',
        target_language_code: 'en',
        one_liner: 'English lesson',
      }),
    ]);

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    expect(
      result.episode.languageClassrooms.map(
        (lesson) => lesson.targetLanguageCode,
      ),
    ).toEqual(['ja', 'en']);
  });

  it('builds the canonical Chinese script before a secondary localization when missing', async () => {
    const englishPendingLocalization = localizationRow({
      id: 'en-localization',
      language_code: 'en',
      title: '',
      raw_text: '',
      script: '',
      llm_model: 'test-model',
      llm_provider: 'test-provider',
      status: 'pending',
    });
    const englishScriptLocalization = localizationRow({
      ...englishPendingLocalization,
      title: 'Translated title',
      script: 'Translated script',
      status: 'script_generated',
    });

    mockFindEpisodeBySourceUrl.mockResolvedValue(null);
    mockScrapeArticle.mockResolvedValue({
      title: 'Software Update',
      text: 'Mouse and bicycle market',
    });
    mockConvertArticleToZhTW.mockReturnValue({
      title: '軟體更新',
      text: '滑鼠和腳踏車市場',
    });
    mockInsertEpisodeLocalization.mockImplementation(
      (localization: { languageCode: string }) =>
        Promise.resolve(
          localization.languageCode === 'en'
            ? englishPendingLocalization
            : localizationRow({
                title: '軟體更新',
                raw_text: '滑鼠和腳踏車市場',
                hls_url: '',
                script: '',
                llm_model: '',
                llm_provider: '',
                status: 'scraped',
              }),
        ),
    );
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(null);
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (id: string, status: string) => {
        if (status === 'script_generated' && id !== 'en-localization') {
          return Promise.resolve(
            localizationRow({
              title: '軟體更新',
              raw_text: '滑鼠和腳踏車市場',
              script: 'Generated script',
              status: 'script_generated',
            }),
          );
        }
        if (id === 'en-localization' && status === 'script_generated') {
          return Promise.resolve(englishScriptLocalization);
        }
        if (id === 'en-localization' && status === 'completed') {
          return Promise.resolve(
            localizationRow({
              ...englishScriptLocalization,
              hls_url:
                'https://cdn.example.com/episodes/e/localizations/en/playlist.m3u8',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );

    await performIngest('https://example.com/article', 'en');

    expect(mockConvertArticleToZhTW).toHaveBeenCalledWith({
      title: 'Software Update',
      text: 'Mouse and bicycle market',
    });
    expect(mockInsertEpisodeLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        languageCode: 'zh-Hant',
        title: '軟體更新',
        rawText: '滑鼠和腳踏車市場',
        status: 'scraped',
      }),
    );
    expect(mockGenerateScriptWithLLM).toHaveBeenCalledWith(
      '軟體更新',
      '滑鼠和腳踏車市場',
    );
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '軟體更新',
      script: 'Generated script',
      targetLanguageCode: 'en',
    });
  });

  it('uses per-language provider metadata for non-default language TTS', async () => {
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
        ttsLanguageCode: 'ja-JP',
        ttsVoiceName: 'ja-JP-Wavenet-A',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
  });

  it('creates a secondary localization by translating the committed Chinese script before TTS', async () => {
    const chineseLocalization = localizationRow({
      id: 'zh-localization',
      language_code: 'zh-Hant',
      title: '中文標題',
      raw_text: '中文原文',
      script: '中文腳本',
      llm_model: 'script-model',
      llm_thinking_model: 'thinking-model',
      llm_provider: 'openrouter',
      status: 'script_generated',
    });
    const jaPendingLocalization = localizationRow({
      id: 'ja-localization',
      language_code: 'ja',
      title: '',
      raw_text: '',
      script: '',
      llm_model: 'script-model',
      llm_thinking_model: 'thinking-model',
      llm_provider: 'openrouter',
      status: 'pending',
    });
    const jaScriptLocalization = localizationRow({
      ...jaPendingLocalization,
      title: '日本語タイトル',
      script: '日本語スクリプト',
      status: 'script_generated',
    });

    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) => {
        if (languageCode === 'zh-Hant') {
          return Promise.resolve(chineseLocalization);
        }
        if (languageCode === 'ja') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
    );
    mockInsertEpisodeLocalization.mockResolvedValue(jaPendingLocalization);
    mockTranslateCanonicalScript.mockResolvedValue({
      title: '日本語タイトル',
      script: '日本語スクリプト',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
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
    });
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (id: string, status: string) => {
        if (id === 'ja-localization' && status === 'script_generated') {
          return Promise.resolve(jaScriptLocalization);
        }
        if (id === 'ja-localization' && status === 'completed') {
          return Promise.resolve(
            localizationRow({
              ...jaScriptLocalization,
              hls_url:
                'https://cdn.example.com/episodes/e/localizations/ja/playlist.m3u8',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );
    mockUploadHlsToR2.mockResolvedValue({
      hlsUrl:
        'https://cdn.example.com/episodes/e/localizations/ja/playlist.m3u8',
      r2Prefix: 'episodes/e/localizations/ja',
    });

    const result = await performIngest('https://example.com/article', 'ja');

    expect(result.statusCode).toBe(201);
    expect(mockGenerateScriptWithLLM).not.toHaveBeenCalled();
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '中文標題',
      script: '中文腳本',
      targetLanguageCode: 'ja',
    });
    expect(mockInsertEpisodeLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: episodeRow().id,
        languageCode: 'ja',
        title: '',
        rawText: '',
        script: '',
        llmModel: 'script-model',
        llmThinkingModel: 'thinking-model',
        llmProvider: 'openrouter',
        status: 'pending',
      }),
    );
    expect(mockUpdateEpisodeLocalizationArticleContent).toHaveBeenCalledWith(
      'ja-localization',
      {
        title: '日本語タイトル',
        text: '',
      },
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      'ja-localization',
      'script_generated',
      expect.objectContaining({
        script: '日本語スクリプト',
        llmModel: 'script-model',
        llmThinkingModel: 'thinking-model',
        llmProvider: 'openrouter',
      }),
    );
    expect(
      mockUpdateEpisodeLocalizationStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(mockTextToSpeech.mock.invocationCallOrder[0]!);
    expect(mockTextToSpeech).toHaveBeenCalledWith('日本語スクリプト', {
      languageCode: 'ja',
      usage: 'main',
      costLabel: 'TTS main audio',
    });
    expect(result.costDetails.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'translate',
          provider: 'google',
          costUsd: 0.0001,
        }),
      ]),
    );
  });

  it('generates every supported localization in order and returns the requested language', async () => {
    const localizations = new Map<string, EpisodeLocalizationRow>();

    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) =>
        Promise.resolve(localizations.get(languageCode) ?? null),
    );
    mockInsertEpisodeLocalization.mockImplementation(
      (localization: {
        id: string;
        languageCode: string;
        title: string;
        hlsUrl: string;
        rawText: string;
        script: string;
        llmModel: string;
        llmThinkingModel: string | null;
        llmProvider: string;
        ttsLanguageCode: string | null;
        ttsVoiceName: string | null;
        r2Prefix: string | null;
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
          tts_language_code: localization.ttsLanguageCode,
          tts_voice_name: localization.ttsVoiceName,
          r2_prefix: localization.r2Prefix,
          status: localization.status,
        });
        localizations.set(localization.languageCode, row);
        return Promise.resolve(row);
      },
    );
    mockTranslateCanonicalScript.mockImplementation(
      ({ targetLanguageCode }: { targetLanguageCode: 'ja' | 'en' }) =>
        Promise.resolve({
          title:
            targetLanguageCode === 'ja' ? '日本語タイトル' : 'English title',
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
    mockUploadHlsToR2.mockImplementation(
      (_files: unknown, _episodeId: string, languageCode: string) =>
        Promise.resolve({
          hlsUrl: `https://cdn.example.com/episodes/e/localizations/${languageCode}/playlist.m3u8`,
          r2Prefix: `episodes/e/localizations/${languageCode}`,
        }),
    );
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
        });
        localizations.set(languageCode, next);
        return Promise.resolve(next);
      },
    );

    const result = await performMultilingualIngest(
      'https://example.com/article',
      'en',
    );

    expect(result.episode.languageCode).toBe('en');
    expect(mockGenerateScriptWithLLM).toHaveBeenCalledTimes(1);
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '軟體更新',
      script: 'Generated script',
      targetLanguageCode: 'ja',
    });
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '軟體更新',
      script: 'Generated script',
      targetLanguageCode: 'en',
    });
    expect(
      mockUploadHlsToR2.mock.calls.map(([, , languageCode]) => languageCode),
    ).toEqual(['zh-Hant', 'ja', 'en']);
  });

  it('regenerates an obviously corrupted secondary script before TTS', async () => {
    const episode = episodeRow();
    const canonical = localizationRow({
      episode_id: episode.id,
      script: '正常中文腳本。',
      status: 'completed',
    });
    const corrupted = localizationRow({
      id: 'en-localization',
      episode_id: episode.id,
      language_code: 'en',
      script: `English opening. ${'-侥幸心理 '.repeat(2500)}`,
      status: 'script_generated',
    });

    mockFindEpisodeBySourceUrl.mockResolvedValue(episode);
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) => {
        if (languageCode === 'zh-Hant') return Promise.resolve(canonical);
        if (languageCode === 'en') return Promise.resolve(corrupted);
        return Promise.resolve(null);
      },
    );
    mockTranslateCanonicalScript.mockResolvedValue({
      title: 'English title',
      script: 'Healthy English script.',
      cost: [],
    });
    mockUpdateEpisodeLocalizationArticleContent.mockResolvedValue(corrupted);
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id: string, status: EpisodeLocalizationRow['status'], updates = {}) =>
        Promise.resolve(
          localizationRow({
            ...corrupted,
            status,
            script: (updates as { script?: string }).script ?? corrupted.script,
          }),
        ),
    );

    await performIngest('https://example.com/article', 'en');

    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: canonical.title,
      script: canonical.script,
      targetLanguageCode: 'en',
    });
    expect(mockTextToSpeech).toHaveBeenCalledWith(
      'Healthy English script.',
      expect.objectContaining({ languageCode: 'en', usage: 'main' }),
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

  it('uses default Google TTS metadata for zh-Hant', async () => {
    await performIngest('https://example.com/article', 'zh-Hant');

    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localizationRow().id,
      'completed',
      expect.objectContaining({
        ttsLanguageCode: 'cmn-TW',
        ttsVoiceName: 'cmn-TW-Wavenet-A',
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

  it('throws when the requested multilingual localization is absent from generated results', async () => {
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(null);
    mockInsertEpisodeLocalization.mockResolvedValue(
      localizationRow({
        language_code: 'zh-Hant',
        status: 'scraped',
      }),
    );
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id: string, status: string) => {
        if (status === 'script_generated') {
          return Promise.resolve(
            localizationRow({
              language_code: 'zh-Hant',
              script: 'Generated script',
              status: 'script_generated',
            }),
          );
        }
        if (status === 'completed') {
          return Promise.resolve(
            localizationRow({
              language_code: 'zh-Hant',
              script: 'Generated script',
              hls_url: 'https://cdn.example.com/playlist.m3u8',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(localizationRow({ language_code: 'zh-Hant' }));
      },
    );

    await expect(
      performMultilingualIngest('https://example.com/article', 'ja'),
    ).rejects.toThrow('Failed to generate requested localization: ja');
  });

  it('throws when secondary script status update returns no localization', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) => {
        if (languageCode === 'zh-Hant') {
          return Promise.resolve(
            localizationRow({
              language_code: 'zh-Hant',
              title: '中文標題',
              script: '中文腳本',
              status: 'script_generated',
            }),
          );
        }
        if (languageCode === 'en') {
          return Promise.resolve(
            localizationRow({
              id: 'en-localization',
              language_code: 'en',
              title: '',
              raw_text: '',
              script: '',
              status: 'pending',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );
    mockUpdateEpisodeLocalizationStatus.mockResolvedValue(null);

    await expect(
      performIngest('https://example.com/article', 'en'),
    ).rejects.toThrow('Failed to retrieve episode localization');
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '中文標題',
      script: '中文腳本',
      targetLanguageCode: 'en',
    });
  });

  it('throws when completed status update returns no localization', async () => {
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
          return Promise.resolve(null);
        }
        return Promise.resolve(localizationRow({ status: 'scraped' }));
      },
    );

    await expect(
      performIngest('https://example.com/article', 'zh-Hant'),
    ).rejects.toThrow('Failed to retrieve episode localization');
    expect(mockUploadHlsToR2).toHaveBeenCalledWith(
      expect.any(Array),
      episodeRow().id,
      'zh-Hant',
      'main',
    );
  });

  it('loads classrooms when a script update returns an already completed localization', async () => {
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({
        status: 'scraped',
        hls_url: '',
        script: '',
      }),
    );
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id: string, status: string) => {
        if (status === 'script_generated') {
          return Promise.resolve(
            localizationRow({
              script: 'Generated script',
              status: 'completed',
              hls_url: 'https://cdn.example.com/already-completed.m3u8',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({ id: 'classroom-en', target_language_code: 'en' }),
      classroomRow({ id: 'classroom-ja', target_language_code: 'ja' }),
    ]);

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockListLanguageClassroomsByLocalizationId).toHaveBeenCalledWith(
      localizationRow().id,
    );
    expect(
      result.episode.languageClassrooms.map(
        (lesson) => lesson.targetLanguageCode,
      ),
    ).toEqual(['ja', 'en']);
  });

  it.each([
    ['Error rejection', new Error('ffmpeg failed')],
    ['non-Error rejection', 'ffmpeg failed'],
  ])(
    'completes without classroom HLS when classroom concat fails with %s',
    async (_label, rejection) => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
        lessons: [
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'ja',
            oneLiner: 'Japanese lesson',
            keywords: [],
          },
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'en',
            oneLiner: 'English lesson',
            keywords: [],
          },
        ],
        model: 'test-model',
        thinkingModel: null,
        provider: 'test-provider',
        costUsd: 0.00009,
      });
      mockUpsertLanguageClassrooms.mockResolvedValue([
        classroomRow({
          id: 'classroom-ja',
          target_language_code: 'ja',
          one_liner: 'Japanese lesson',
        }),
        classroomRow({
          id: 'classroom-en',
          target_language_code: 'en',
          one_liner: 'English lesson',
        }),
      ]);
      mockSynthesizeClassroomAudio
        .mockResolvedValueOnce({ audio: Buffer.from('ja'), cost: [] })
        .mockResolvedValueOnce({ audio: Buffer.from('en'), cost: [] });
      mockConcatMp3Buffers.mockRejectedValue(rejection);

      const result = await performIngest(
        'https://example.com/article',
        'zh-Hant',
      );

      expect(result.statusCode).toBe(201);
      expect(mockGenerateHls).toHaveBeenCalledTimes(1);
      expect(mockUploadHlsToR2).toHaveBeenCalledTimes(1);
      expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
        localizationRow().id,
        'completed',
        expect.not.objectContaining({
          classroomHlsUrl: expect.any(String),
          classroomR2Prefix: expect.any(String),
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[/ingest] classroom audio concat failed:',
        expect.objectContaining({
          episodeId: episodeRow().id,
          localizationId: localizationRow().id,
          languageCode: 'zh-Hant',
          message: '[step:concatEpisodeClassroomAudio] ffmpeg failed',
        }),
      );
    },
  );

  it('returns retained existing classrooms when upsert fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockResolvedValue(
      localizationRow({ status: 'scraped', script: '' }),
    );
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
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
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.00009,
    });
    mockUpsertLanguageClassrooms.mockRejectedValue('database offline');

    const result = await performIngest(
      'https://example.com/article',
      'zh-Hant',
    );

    expect(result.statusCode).toBe(201);
    expect(result.episode.languageClassrooms).toEqual([
      expect.objectContaining({ targetLanguageCode: 'ja' }),
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[/ingest] language classroom generation failed:',
      expect.objectContaining({
        message: '[step:upsertLanguageClassrooms] database offline',
      }),
    );
  });

  it('uses empty-string fallbacks for nullable canonical fields when creating a secondary localization', async () => {
    const canonical = localizationRow({
      language_code: 'zh-Hant',
      title: '中文標題',
      raw_text: null,
      script: null,
      llm_model: null,
      llm_thinking_model: null,
      llm_provider: null,
      status: 'scraped',
    });
    const canonicalAfterScript = localizationRow({
      ...canonical,
      status: 'script_generated',
    });
    const englishPending = localizationRow({
      id: 'en-localization',
      language_code: 'en',
      title: '',
      raw_text: null,
      script: '',
      llm_model: '',
      llm_thinking_model: null,
      llm_provider: '',
      status: 'pending',
    });
    const englishScript = localizationRow({
      ...englishPending,
      title: 'English title',
      raw_text: null,
      script: null,
      status: 'script_generated',
    });

    mockFindEpisodeBySourceUrl.mockResolvedValue(episodeRow());
    mockFindEpisodeLocalizationByEpisodeId.mockImplementation(
      (_episodeId: string, languageCode: string) => {
        if (languageCode === 'zh-Hant') return Promise.resolve(canonical);
        if (languageCode === 'en') return Promise.resolve(null);
        return Promise.resolve(null);
      },
    );
    mockInsertEpisodeLocalization.mockResolvedValue(englishPending);
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (id: string, status: string) => {
        if (id === canonical.id && status === 'script_generated') {
          return Promise.resolve(canonicalAfterScript);
        }
        if (id === 'en-localization' && status === 'script_generated') {
          return Promise.resolve(englishScript);
        }
        if (id === 'en-localization' && status === 'completed') {
          return Promise.resolve(
            localizationRow({
              ...englishScript,
              hls_url:
                'https://cdn.example.com/episodes/e/localizations/en/playlist.m3u8',
              status: 'completed',
            }),
          );
        }
        return Promise.resolve(null);
      },
    );

    await performIngest('https://example.com/article', 'en');

    expect(mockInsertEpisodeLocalization).toHaveBeenCalledWith(
      expect.objectContaining({
        languageCode: 'en',
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
      }),
    );
    expect(mockTranslateCanonicalScript).toHaveBeenCalledWith({
      title: '中文標題',
      script: '',
      targetLanguageCode: 'en',
    });
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      'en-localization',
      'script_generated',
      expect.objectContaining({
        llmModel: '',
        llmThinkingModel: null,
        llmProvider: '',
      }),
    );
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockTextToSpeech).toHaveBeenCalledWith('', {
      languageCode: 'en',
      usage: 'main',
      costLabel: 'TTS main audio',
    });
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
