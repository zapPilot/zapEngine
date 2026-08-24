import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classroomRow,
  episodeRow,
  localizationRow,
} from '../../__fixtures__/index-test.js';
import type { LanguageClassroomRow } from '../../types.js';
import { packagePodcastScript } from '../podcast-packaging.js';

const {
  mockConcatMp3Buffers,
  mockGenerateLanguageClassroomsWithLLM,
  mockGetTtsMetadata,
  mockListLanguageClassroomsByLocalizationId,
  mockPackageAndUploadHls,
  mockSynthesizeClassroomAudio,
  mockTextToSpeech,
  mockUpdateEpisodeLocalizationStatus,
  mockUpdateLanguageClassroomAudio,
  mockUpsertLanguageClassrooms,
} = vi.hoisted(() => ({
  mockConcatMp3Buffers: vi.fn(),
  mockGenerateLanguageClassroomsWithLLM: vi.fn(),
  mockGetTtsMetadata: vi.fn(),
  mockListLanguageClassroomsByLocalizationId: vi.fn(),
  mockPackageAndUploadHls: vi.fn(),
  mockSynthesizeClassroomAudio: vi.fn(),
  mockTextToSpeech: vi.fn(),
  mockUpdateEpisodeLocalizationStatus: vi.fn(),
  mockUpdateLanguageClassroomAudio: vi.fn(),
  mockUpsertLanguageClassrooms: vi.fn(),
}));

vi.mock('../db.js', () => ({
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  updateEpisodeLocalizationStatus: mockUpdateEpisodeLocalizationStatus,
  updateLanguageClassroomAudio: mockUpdateLanguageClassroomAudio,
  upsertLanguageClassrooms: mockUpsertLanguageClassrooms,
}));

vi.mock('../llm.js', () => ({
  generateLanguageClassroomsWithLLM: mockGenerateLanguageClassroomsWithLLM,
}));

vi.mock('../podcast/classroom-audio.js', () => ({
  synthesizeClassroomAudio: mockSynthesizeClassroomAudio,
}));

vi.mock('../tts.js', () => ({
  getTtsMetadata: mockGetTtsMetadata,
  textToSpeech: mockTextToSpeech,
}));

vi.mock('../tts/audio-concat.js', () => ({
  concatMp3Buffers: mockConcatMp3Buffers,
}));

vi.mock('./upload-stage.js', () => ({
  packageAndUploadHls: mockPackageAndUploadHls,
}));

const { ensureLocalizationCompleted, isAudioReady } =
  await import('./audio-stage.js');

const classroomRows = [
  classroomRow({
    id: 'classroom-ja',
    target_language_code: 'ja',
    one_liner: 'Japanese lesson',
    script: 'ja lesson script',
  }),
  classroomRow({
    id: 'classroom-en',
    target_language_code: 'en',
    one_liner: 'English lesson',
    script: 'en lesson script',
  }),
];

describe('strict language classroom audio integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListLanguageClassroomsByLocalizationId.mockResolvedValue(classroomRows);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue(classroomRows);
    mockSynthesizeClassroomAudio.mockResolvedValue({
      audio: Buffer.from('classroom-part'),
      cost: [],
    });
    mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-combined'));
    mockTextToSpeech.mockResolvedValue({
      audio: Buffer.from('main-audio'),
      cost: [],
    });
    mockGetTtsMetadata.mockReturnValue({
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    mockPackageAndUploadHls.mockImplementation(
      ({ episodeId, languageCode, section, classroomTargetLanguageCode }) => {
        const suffix = classroomTargetLanguageCode
          ? `/${classroomTargetLanguageCode}`
          : '';
        return Promise.resolve({
          hlsUrl: `https://cdn.example.com/episodes/${episodeId}/localizations/${languageCode}/${section}${suffix}/playlist.m3u8`,
          r2Prefix: `episodes/${episodeId}/localizations/${languageCode}/${section}${suffix}`,
        });
      },
    );
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id, status, updates = {}) =>
        Promise.resolve(
          localizationRow({
            status,
            hls_url:
              updates.hlsUrl ?? 'https://cdn.example.com/main/playlist.m3u8',
            r2_prefix: updates.r2Prefix ?? 'episodes/main',
            classroom_hls_url: updates.classroomHlsUrl ?? null,
            classroom_r2_prefix: updates.classroomR2Prefix ?? null,
          }),
        ),
    );
    mockUpdateLanguageClassroomAudio.mockImplementation(
      (_episodeLocalizationId, targetLanguageCode, updates) =>
        Promise.resolve(
          classroomRow({
            target_language_code: targetLanguageCode,
            hls_url: updates.hlsUrl,
            r2_prefix: updates.r2Prefix,
          }),
        ),
    );
  });

  it('does not treat canonical main-only audio as completed', () => {
    expect(
      isAudioReady(
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: null,
        }),
      ),
    ).toBe(false);

    expect(
      isAudioReady(
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
        }),
      ),
    ).toBe(true);

    expect(
      isAudioReady(
        localizationRow({
          status: 'audio_generated',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
        }),
      ),
    ).toBe(false);

    expect(
      isAudioReady(
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: '   ',
        }),
      ),
    ).toBe(false);

    expect(
      isAudioReady(
        localizationRow({
          language_code: 'ja',
          status: 'completed',
          hls_url: 'https://cdn.example.com/ja/playlist.m3u8',
          classroom_hls_url: null,
        }),
      ),
    ).toBe(true);
  });

  it('promotes fully checkpointed audio without regenerating either section', async () => {
    const checkpointed = localizationRow({
      status: 'audio_generated',
      hls_url: 'https://cdn.example.com/main/playlist.m3u8',
      r2_prefix: 'episodes/main',
      classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
      classroom_r2_prefix: 'episodes/classroom',
    });
    mockUpdateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({ ...checkpointed, status: 'completed' }),
    );

    const result = await ensureLocalizationCompleted(
      episodeRow(),
      checkpointed,
      'zh-Hant',
      [],
    );

    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      checkpointed.id,
      'completed',
    );
    expect(result.localization.status).toBe('completed');
    expect(isAudioReady(result.localization)).toBe(true);
  });

  it('never regenerates content or audio for a previously published episode, even with blank-script rows', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({ target_language_code: 'ja', script: null }),
      classroomRow({ target_language_code: 'en', script: null }),
    ]);
    const ready = localizationRow({
      status: 'completed',
      hls_url: 'https://cdn.example.com/main.m3u8',
      classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
    });

    const result = await ensureLocalizationCompleted(
      episodeRow(),
      ready,
      'zh-Hant',
      [],
    );

    expect(result.localization).toEqual(ready);
    expect(mockGenerateLanguageClassroomsWithLLM).not.toHaveBeenCalled();
    expect(mockUpsertLanguageClassrooms).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
    expect(mockUpdateLanguageClassroomAudio).not.toHaveBeenCalled();
  });

  it('repairs a missing classroom track without regenerating main narration', async () => {
    const localization = localizationRow({
      status: 'completed',
      hls_url: 'https://cdn.example.com/main/playlist.m3u8',
      r2_prefix: 'episodes/main',
      classroom_hls_url: null,
      classroom_r2_prefix: null,
    });

    await ensureLocalizationCompleted(
      episodeRow(),
      localization,
      'zh-Hant',
      [],
    );

    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(3);
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenNthCalledWith(
      1,
      localization.id,
      'ja',
      expect.objectContaining({ hlsUrl: expect.any(String) }),
    );
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenNthCalledWith(
      2,
      localization.id,
      'en',
      expect.objectContaining({ hlsUrl: expect.any(String) }),
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      1,
      localization.id,
      'audio_generated',
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        section: 'classroom',
        classroomTargetLanguageCode: 'ja',
        audio: Buffer.from('classroom-part'),
      }),
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        section: 'classroom',
        classroomTargetLanguageCode: 'en',
        audio: Buffer.from('classroom-part'),
      }),
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        section: 'classroom',
        audio: Buffer.from('classroom-combined'),
      }),
    );
    expect(mockPackageAndUploadHls.mock.calls[2]![0]).not.toHaveProperty(
      'classroomTargetLanguageCode',
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledWith(
      localization.id,
      'completed',
      expect.objectContaining({
        hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
        r2Prefix: 'episodes/main',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
        classroomR2Prefix:
          'episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom',
      }),
    );
  });

  it('backfills only the blank-script targets before synthesizing audio', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({
        id: 'classroom-ja',
        target_language_code: 'ja',
        one_liner: 'Japanese lesson',
        script: 'existing ja script',
      }),
      classroomRow({
        id: 'classroom-en',
        target_language_code: 'en',
        one_liner: 'English lesson',
        script: null,
      }),
    ]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [
        {
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCode: 'en',
          oneLiner: 'English lesson',
          keywords: [],
          script: 'backfilled en script',
        },
      ],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.001,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([
      classroomRow({
        id: 'classroom-en',
        target_language_code: 'en',
        one_liner: 'English lesson',
        script: 'backfilled en script',
      }),
    ]);

    await ensureLocalizationCompleted(
      episodeRow(),
      localizationRow({
        status: 'completed',
        hls_url: 'https://cdn.example.com/main/playlist.m3u8',
        classroom_hls_url: null,
      }),
      'zh-Hant',
      [],
    );

    // The content-layer missing-target check already found both targets
    // present (presence-based), so this is the one and only, script-specific
    // backfill call — scoped to just the blank target.
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledTimes(1);
    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguageCodes: ['en'] }),
    );
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        target_language_code: 'ja',
        script: 'existing ja script',
      }),
      expect.anything(),
    );
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        target_language_code: 'en',
        script: 'backfilled en script',
      }),
      expect.anything(),
    );
  });

  it('fails closed when the script backfill still leaves a target blank', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([
      classroomRow({
        target_language_code: 'ja',
        script: 'existing ja script',
      }),
      classroomRow({ target_language_code: 'en', script: null }),
    ]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue([]);

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow(
      'Language classroom script generation incomplete for zh-Hant; missing scripts: en',
    );

    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
  });

  it('normalizes legacy null article/script fields before classroom generation and main TTS', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue(classroomRows);

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'script_generated',
          raw_text: null,
          script: null,
          hls_url: '',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).resolves.toBeDefined();

    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({ articleText: '', script: '' }),
    );
    expect(mockTextToSpeech).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        languageCode: 'zh-Hant',
      }),
    );
  });

  it('grounds classroom generation in the article and stripped podcast body', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockResolvedValue({
      lessons: [],
      model: 'test-model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0,
    });
    mockUpsertLanguageClassrooms.mockResolvedValue(classroomRows);

    await ensureLocalizationCompleted(
      episodeRow(),
      localizationRow({
        status: 'script_generated',
        raw_text: '來源文章內容',
        script: packagePodcastScript('課堂要使用的正文。'),
        hls_url: '',
        classroom_hls_url: null,
      }),
      'zh-Hant',
      [],
    );

    expect(mockGenerateLanguageClassroomsWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        articleText: '來源文章內容',
        script: '課堂要使用的正文。',
      }),
    );
  });

  it.each([
    {
      existingRows: [] as LanguageClassroomRow[],
      missingTargets: 'ja, en',
      scenario: 'all configured targets are missing',
    },
    {
      existingRows: [classroomRows[0]!],
      missingTargets: 'en',
      scenario: 'one configured target is missing',
    },
  ])(
    'fails ingest when $scenario',
    async ({ existingRows, missingTargets }) => {
      mockListLanguageClassroomsByLocalizationId.mockResolvedValue(
        existingRows,
      );
      mockUpsertLanguageClassrooms.mockResolvedValue([]);

      await expect(
        ensureLocalizationCompleted(
          episodeRow(),
          localizationRow({
            status: 'script_generated',
            hls_url: '',
            classroom_hls_url: null,
          }),
          'zh-Hant',
          [],
        ),
      ).rejects.toThrow(
        `Language classroom generation incomplete for zh-Hant; missing targets: ${missingTargets}`,
      );

      expect(mockTextToSpeech).not.toHaveBeenCalled();
      expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
      expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
        expect.any(String),
        'completed',
        expect.anything(),
      );
    },
  );

  it('fails ingest when classroom generation fails', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    mockGenerateLanguageClassroomsWithLLM.mockRejectedValue(
      new Error('LLM timeout'),
    );
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'script_generated',
          hls_url: '',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('[step:generateLanguageClassrooms] LLM timeout');

    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('demotes legacy main-only completion before repair and leaves it non-completed when classroom TTS fails', async () => {
    const localization = localizationRow({
      status: 'completed',
      hls_url: 'https://cdn.example.com/main/playlist.m3u8',
      r2_prefix: 'episodes/main',
      classroom_hls_url: null,
    });
    mockSynthesizeClassroomAudio.mockResolvedValueOnce({
      audio: null,
      cost: [],
    });

    await expect(
      ensureLocalizationCompleted(episodeRow(), localization, 'zh-Hant', []),
    ).rejects.toThrow('Language classroom audio synthesis failed for ja');

    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
    expect(mockUpdateLanguageClassroomAudio).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      1,
      localization.id,
      'audio_generated',
    );
    expect(
      mockUpdateEpisodeLocalizationStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockSynthesizeClassroomAudio.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      expect.anything(),
    );
  });

  it('rejects when a per-target row checkpoint fails to persist', async () => {
    mockUpdateLanguageClassroomAudio.mockRejectedValueOnce(
      new Error('row checkpoint failed'),
    );

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow(
      '[step:updateLanguageClassroomAudio:ja] row checkpoint failed',
    );

    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(1);
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      expect.anything(),
    );
  });

  it('rejects when required classroom audio concatenation fails, and a resumed ingest re-synthesizes every target', async () => {
    mockConcatMp3Buffers.mockRejectedValueOnce(
      new Error('classroom concat failed'),
    );

    const localization = localizationRow({
      status: 'completed',
      hls_url: 'https://cdn.example.com/main/playlist.m3u8',
      r2_prefix: 'episodes/main',
      classroom_hls_url: null,
    });

    await expect(
      ensureLocalizationCompleted(episodeRow(), localization, 'zh-Hant', []),
    ).rejects.toThrow(
      '[step:concatEpisodeClassroomAudio] classroom concat failed',
    );

    // Both targets' TTS, upload, and row checkpoint already succeeded before
    // the combine step failed — row checkpoints are observability only, not a
    // skip condition (see the audio-stage rewrite notes on resumability).
    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(2);
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      expect.anything(),
    );

    mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-combined'));

    // A resumed ingest (same, still-incomplete localization) re-synthesizes
    // every target's audio from scratch rather than skipping the ones whose
    // row was already checkpointed.
    await ensureLocalizationCompleted(
      episodeRow(),
      localization,
      'zh-Hant',
      [],
    );

    expect(mockSynthesizeClassroomAudio).toHaveBeenCalledTimes(4);
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenCalledTimes(4);
  });

  it('generates separate main and classroom HLS artifacts for a fresh canonical localization', async () => {
    const result = await ensureLocalizationCompleted(
      episodeRow(),
      localizationRow({
        status: 'script_generated',
        hls_url: '',
        r2_prefix: null,
        classroom_hls_url: null,
        classroom_r2_prefix: null,
      }),
      'zh-Hant',
      [],
    );

    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(4);
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        section: 'main',
        audio: Buffer.from('main-audio'),
      }),
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        section: 'classroom',
        classroomTargetLanguageCode: 'ja',
        audio: Buffer.from('classroom-part'),
      }),
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        section: 'classroom',
        classroomTargetLanguageCode: 'en',
        audio: Buffer.from('classroom-part'),
      }),
    );
    expect(mockPackageAndUploadHls).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        section: 'classroom',
        audio: Buffer.from('classroom-combined'),
      }),
    );
    expect(mockPackageAndUploadHls.mock.calls[3]![0]).not.toHaveProperty(
      'classroomTargetLanguageCode',
    );
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenCalledTimes(2);
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'ja',
      expect.objectContaining({ hlsUrl: expect.any(String) }),
    );
    expect(mockUpdateLanguageClassroomAudio).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'en',
      expect.objectContaining({ hlsUrl: expect.any(String) }),
    );
    expect(result.localization).toMatchObject({
      status: 'completed',
      hls_url:
        'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main/playlist.m3u8',
      classroom_hls_url:
        'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
    });
    expect(isAudioReady(result.localization)).toBe(true);
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      1,
      result.localization.id,
      'audio_generated',
      expect.objectContaining({
        hlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main/playlist.m3u8',
      }),
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      2,
      result.localization.id,
      'audio_generated',
      expect.objectContaining({
        classroomHlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
      }),
    );
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      3,
      result.localization.id,
      'completed',
      expect.objectContaining({
        hlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/main/playlist.m3u8',
        classroomHlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
      }),
    );
  });

  it('rejects a completed persistence result that omits the required classroom artifact', async () => {
    let persistedLocalization = localizationRow({
      status: 'script_generated',
      hls_url: '',
      classroom_hls_url: null,
    });
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id, status, updates = {}) => {
        persistedLocalization = localizationRow({
          ...persistedLocalization,
          status,
          hls_url: updates.hlsUrl ?? persistedLocalization.hls_url,
          r2_prefix: updates.r2Prefix ?? persistedLocalization.r2_prefix,
          classroom_hls_url:
            updates.classroomHlsUrl ?? persistedLocalization.classroom_hls_url,
          classroom_r2_prefix:
            updates.classroomR2Prefix ??
            persistedLocalization.classroom_r2_prefix,
        });

        if (status === 'completed') {
          return Promise.resolve(
            localizationRow({
              ...persistedLocalization,
              classroom_hls_url: null,
              classroom_r2_prefix: null,
            }),
          );
        }

        return Promise.resolve(persistedLocalization);
      },
    );

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'script_generated',
          hls_url: '',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Language classroom HLS was not produced for zh-Hant');

    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(4);
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenCalledTimes(3);
    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      'completed',
      expect.objectContaining({
        classroomHlsUrl:
          'https://cdn.example.com/episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/classroom/playlist.m3u8',
      }),
    );
  });

  it('completes a non-classroom language with main audio only', async () => {
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue([]);
    const result = await ensureLocalizationCompleted(
      episodeRow(),
      localizationRow({
        language_code: 'ja',
        status: 'script_generated',
        hls_url: '',
        classroom_hls_url: null,
      }),
      'ja',
      [],
    );

    expect(mockTextToSpeech).toHaveBeenCalledOnce();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(1);
    expect(mockPackageAndUploadHls).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'main', languageCode: 'ja' }),
    );
    expect(result.localization.status).toBe('completed');
  });

  it('continues non-classroom audio when classroom lookup fails', async () => {
    mockListLanguageClassroomsByLocalizationId.mockRejectedValue(
      new Error('classroom table unavailable'),
    );
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const result = await ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          language_code: 'ja',
          status: 'audio_generated',
          hls_url: 'https://cdn.example.com/ja/main.m3u8',
          classroom_hls_url: null,
        }),
        'ja',
        [],
      );
      expect(result.localization.status).toBe('completed');
      expect(result.classroomRows).toEqual([]);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('skips persistence when an already-completed canonical localization has both artifacts', async () => {
    const ready = localizationRow({
      status: 'completed',
      hls_url: 'https://cdn.example.com/main.m3u8',
      classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
    });
    const result = await ensureLocalizationCompleted(
      episodeRow(),
      ready,
      'zh-Hant',
      [],
    );
    expect(result.localization).toEqual(ready);
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalled();
    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
  });

  it('demotes to script_generated and repairs only main audio when classroom audio already exists', async () => {
    const legacy = localizationRow({
      status: 'completed',
      hls_url: '',
      r2_prefix: null,
      classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
      classroom_r2_prefix: 'episodes/classroom',
    });
    mockUpdateEpisodeLocalizationStatus.mockImplementation(
      (_id, status, updates = {}) =>
        Promise.resolve(
          localizationRow({
            ...legacy,
            status,
            hls_url: updates.hlsUrl ?? legacy.hls_url,
            r2_prefix: updates.r2Prefix ?? legacy.r2_prefix,
            classroom_hls_url: legacy.classroom_hls_url,
            classroom_r2_prefix: legacy.classroom_r2_prefix,
          }),
        ),
    );

    await ensureLocalizationCompleted(episodeRow(), legacy, 'zh-Hant', []);

    expect(mockUpdateEpisodeLocalizationStatus).toHaveBeenNthCalledWith(
      1,
      legacy.id,
      'script_generated',
    );
    expect(mockTextToSpeech).toHaveBeenCalledOnce();
    expect(mockSynthesizeClassroomAudio).not.toHaveBeenCalled();
  });

  it('fails closed when demotion cannot be persisted', async () => {
    mockUpdateEpisodeLocalizationStatus.mockResolvedValueOnce(null);
    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: '',
          classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow(
      'Failed to mark incomplete episode localization for audio repair',
    );
  });

  it('fails closed when main or classroom checkpoints cannot be persisted', async () => {
    mockUpdateEpisodeLocalizationStatus.mockResolvedValueOnce(null);
    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'script_generated',
          hls_url: '',
          classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Failed to persist generated main audio');

    vi.clearAllMocks();
    mockListLanguageClassroomsByLocalizationId.mockResolvedValue(classroomRows);
    mockSynthesizeClassroomAudio.mockResolvedValue({
      audio: Buffer.from('classroom-part'),
      cost: [],
    });
    mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-combined'));
    mockPackageAndUploadHls.mockResolvedValue({
      hlsUrl: 'https://cdn.example.com/classroom.m3u8',
      r2Prefix: 'episodes/classroom',
    });
    mockUpdateEpisodeLocalizationStatus
      .mockResolvedValueOnce(
        localizationRow({
          status: 'audio_generated',
          hls_url: 'https://cdn.example.com/main.m3u8',
          classroom_hls_url: null,
        }),
      )
      .mockResolvedValueOnce(null);
    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main.m3u8',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Failed to persist generated language classroom audio');
  });

  it('fails when final completion persistence returns null or the wrong status', async () => {
    const run = async (
      completedValue: ReturnType<typeof localizationRow> | null,
    ) => {
      vi.clearAllMocks();
      mockListLanguageClassroomsByLocalizationId.mockResolvedValue(
        classroomRows,
      );
      mockTextToSpeech.mockResolvedValue({
        audio: Buffer.from('main-audio'),
        cost: [],
      });
      mockSynthesizeClassroomAudio.mockResolvedValue({
        audio: Buffer.from('classroom-part'),
        cost: [],
      });
      mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-combined'));
      mockGetTtsMetadata.mockReturnValue({
        languageCode: 'cmn-TW',
        voiceName: 'voice',
      });
      mockPackageAndUploadHls.mockImplementation(({ section }) =>
        Promise.resolve({
          hlsUrl: `https://cdn.example.com/${section}.m3u8`,
          r2Prefix: `episodes/${section}`,
        }),
      );
      mockUpdateLanguageClassroomAudio.mockImplementation(
        (_episodeLocalizationId, targetLanguageCode, updates) =>
          Promise.resolve(
            classroomRow({
              target_language_code: targetLanguageCode,
              hls_url: updates.hlsUrl,
              r2_prefix: updates.r2Prefix,
            }),
          ),
      );
      mockUpdateEpisodeLocalizationStatus.mockImplementation(
        (_id, status, updates = {}) => {
          if (status === 'completed') return Promise.resolve(completedValue);
          return Promise.resolve(
            localizationRow({
              status,
              hls_url: updates.hlsUrl ?? 'https://cdn.example.com/main.m3u8',
              r2_prefix: updates.r2Prefix ?? 'episodes/main',
              classroom_hls_url:
                updates.classroomHlsUrl ??
                (status === 'audio_generated' && updates.hlsUrl
                  ? null
                  : 'https://cdn.example.com/classroom.m3u8'),
              classroom_r2_prefix:
                updates.classroomR2Prefix ?? 'episodes/classroom',
            }),
          );
        },
      );
      return ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'script_generated',
          hls_url: '',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      );
    };

    await expect(run(null)).rejects.toThrow(
      'Failed to retrieve episode localization after audio completion',
    );
    await expect(
      run(
        localizationRow({
          status: 'audio_generated',
          hls_url: 'https://cdn.example.com/main.m3u8',
          classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
        }),
      ),
    ).rejects.toThrow('did not persist the completed audio status');
  });

  it('fails when promoting checkpointed audio does not persist completed status', async () => {
    mockUpdateEpisodeLocalizationStatus.mockResolvedValue(
      localizationRow({
        status: 'audio_generated',
        hls_url: 'https://cdn.example.com/main.m3u8',
        classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
      }),
    );
    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'audio_generated',
          hls_url: 'https://cdn.example.com/main.m3u8',
          classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Failed to persist the completed audio status');
  });

  it('fails if required classroom packaging returns no artifact', async () => {
    mockPackageAndUploadHls.mockResolvedValue(null);
    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main.m3u8',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Language classroom HLS was not produced for ja');

    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(1);
    expect(mockUpdateLanguageClassroomAudio).not.toHaveBeenCalled();
  });
});
