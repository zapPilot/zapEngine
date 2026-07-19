import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classroomRow,
  episodeRow,
  localizationRow,
} from '../../__fixtures__/index-test.js';
import type { LanguageClassroomRow } from '../../types.js';

const {
  mockConcatMp3Buffers,
  mockGenerateLanguageClassroomsWithLLM,
  mockGetTtsMetadata,
  mockListLanguageClassroomsByLocalizationId,
  mockPackageAndUploadHls,
  mockSynthesizeClassroomAudio,
  mockTextToSpeech,
  mockUpdateEpisodeLocalizationStatus,
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
  mockUpsertLanguageClassrooms: vi.fn(),
}));

vi.mock('../db.js', () => ({
  listLanguageClassroomsByLocalizationId:
    mockListLanguageClassroomsByLocalizationId,
  toLanguageClassroomLesson: (row: LanguageClassroomRow) => ({
    sourceLanguageCode: row.source_language_code,
    targetLanguageCode: row.target_language_code,
    oneLiner: row.one_liner,
    keywords: row.keywords,
  }),
  updateEpisodeLocalizationStatus: mockUpdateEpisodeLocalizationStatus,
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
  }),
  classroomRow({
    id: 'classroom-en',
    target_language_code: 'en',
    one_liner: 'English lesson',
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
      ({ episodeId, languageCode, section }) =>
        Promise.resolve({
          hlsUrl: `https://cdn.example.com/episodes/${episodeId}/localizations/${languageCode}/${section}/playlist.m3u8`,
          r2Prefix: `episodes/${episodeId}/localizations/${languageCode}/${section}`,
        }),
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
          language_code: 'ja',
          status: 'completed',
          hls_url: 'https://cdn.example.com/ja/playlist.m3u8',
          classroom_hls_url: null,
        }),
      ),
    ).toBe(true);
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
    expect(mockPackageAndUploadHls).toHaveBeenCalledTimes(1);
    expect(mockPackageAndUploadHls).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'classroom',
        audio: Buffer.from('classroom-combined'),
      }),
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

  it('fails ingest when any required classroom TTS produces no audio', async () => {
    mockSynthesizeClassroomAudio.mockResolvedValueOnce({
      audio: null,
      cost: [],
    });

    await expect(
      ensureLocalizationCompleted(
        episodeRow(),
        localizationRow({
          status: 'completed',
          hls_url: 'https://cdn.example.com/main/playlist.m3u8',
          r2_prefix: 'episodes/main',
          classroom_hls_url: null,
        }),
        'zh-Hant',
        [],
      ),
    ).rejects.toThrow('Language classroom audio synthesis failed for ja');

    expect(mockPackageAndUploadHls).not.toHaveBeenCalled();
    expect(mockUpdateEpisodeLocalizationStatus).not.toHaveBeenCalledWith(
      expect.any(String),
      'completed',
      expect.anything(),
    );
  });
});
