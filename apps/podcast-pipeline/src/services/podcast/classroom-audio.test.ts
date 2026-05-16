import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguageClassroomLesson } from '../../types.js';

const { mockConcatMp3Buffers, mockTextToSpeech } = vi.hoisted(() => ({
  mockConcatMp3Buffers: vi.fn(),
  mockTextToSpeech: vi.fn(),
}));

vi.mock('../tts.js', () => ({
  textToSpeech: mockTextToSpeech,
}));

vi.mock('../tts/audio-concat.js', () => ({
  concatMp3Buffers: mockConcatMp3Buffers,
}));

import { synthesizeClassroomAudio } from './classroom-audio.js';

describe('synthesizeClassroomAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTextToSpeech.mockImplementation(
      (text: string, opts: { languageCode: string }) =>
        Promise.resolve({
          audio: Buffer.from(`${opts.languageCode}:${text}`),
          cost: [
            {
              category: 'tts',
              label: 'TTS classroom audio',
              provider: 'test-provider',
              model: opts.languageCode,
              costUsd: 0.00001,
            },
          ],
        }),
    );
    mockConcatMp3Buffers.mockResolvedValue(Buffer.from('classroom-mp3'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synthesizes ordered classroom segments with each segment language and concatenates them', async () => {
    const lesson = classroomLesson();

    const result = await synthesizeClassroomAudio(lesson, {
      episodeId: 'episode-1',
    });

    expect(result.audio).toEqual(Buffer.from('classroom-mp3'));
    expect(result.cost).toHaveLength(4);
    expect(mockTextToSpeech.mock.calls).toEqual([
      [
        '接下來是日文小教室。',
        {
          languageCode: 'zh-Hant',
          usage: 'classroom',
          costLabel: 'TTS classroom audio',
        },
      ],
      [
        'この記事は市場流動性を説明します。',
        {
          languageCode: 'ja',
          usage: 'classroom',
          costLabel: 'TTS classroom audio',
        },
      ],
      [
        '流動性，りゅうどうせい。',
        {
          languageCode: 'ja',
          usage: 'classroom',
          costLabel: 'TTS classroom audio',
        },
      ],
      [
        '意思是資金容易進出市場的程度。',
        {
          languageCode: 'zh-Hant',
          usage: 'classroom',
          costLabel: 'TTS classroom audio',
        },
      ],
    ]);
    expect(mockConcatMp3Buffers).toHaveBeenCalledWith([
      Buffer.from('zh-Hant:接下來是日文小教室。'),
      Buffer.from('ja:この記事は市場流動性を説明します。'),
      Buffer.from('ja:流動性，りゅうどうせい。'),
      Buffer.from('zh-Hant:意思是資金容易進出市場的程度。'),
    ]);
  });

  it('returns null and logs structured context when classroom synthesis fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTextToSpeech.mockRejectedValue(new Error('Fish Audio timeout'));

    const result = await synthesizeClassroomAudio(classroomLesson(), {
      episodeId: 'episode-1',
    });

    expect(result).toEqual({
      audio: null,
      cost: [],
    });
    expect(mockConcatMp3Buffers).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[classroom-audio] synthesis failed:',
      expect.objectContaining({
        episodeId: 'episode-1',
        targetLanguageCode: 'ja',
        message: 'Fish Audio timeout',
      }),
    );
  });

  it('handles non-Error thrown values when synthesizing', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTextToSpeech.mockRejectedValue('string error');

    const result = await synthesizeClassroomAudio(classroomLesson(), {
      episodeId: 'episode-1',
    });

    expect(result).toEqual({
      audio: null,
      cost: [],
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[classroom-audio] synthesis failed:',
      expect.objectContaining({
        episodeId: 'episode-1',
        targetLanguageCode: 'ja',
        message: 'string error',
      }),
    );
  });

  it('returns cost for already synthesized segments when a later segment fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTextToSpeech
      .mockResolvedValueOnce({
        audio: Buffer.from('intro'),
        cost: [
          {
            category: 'tts',
            label: 'TTS classroom audio',
            provider: 'fish-audio',
            model: 's2-pro',
            costUsd: 0.00009,
          },
        ],
      })
      .mockRejectedValueOnce(new Error('Google TTS timeout'));

    const result = await synthesizeClassroomAudio(classroomLesson(), {
      episodeId: 'episode-1',
    });

    expect(result).toEqual({
      audio: null,
      cost: [
        {
          category: 'tts',
          label: 'TTS classroom audio',
          provider: 'fish-audio',
          model: 's2-pro',
          costUsd: 0.00009,
        },
      ],
    });
    expect(mockConcatMp3Buffers).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

function classroomLesson(): LanguageClassroomLesson {
  return {
    sourceLanguageCode: 'zh-Hant',
    targetLanguageCode: 'ja',
    oneLiner: 'この記事は市場流動性を説明します。',
    keywords: [
      {
        term: '流動性',
        reading: 'りゅうどうせい',
        meaning: '資金容易進出市場的程度',
        note: null,
      },
    ],
  };
}
