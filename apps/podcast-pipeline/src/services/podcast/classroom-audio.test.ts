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
        Promise.resolve(Buffer.from(`${opts.languageCode}:${text}`)),
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

    expect(result).toEqual(Buffer.from('classroom-mp3'));
    expect(mockTextToSpeech.mock.calls).toEqual([
      ['接下來是日文小教室。', { languageCode: 'zh-Hant' }],
      ['この記事は市場流動性を説明します。', { languageCode: 'ja' }],
      ['流動性，りゅうどうせい。', { languageCode: 'ja' }],
      ['意思是資金容易進出市場的程度。', { languageCode: 'zh-Hant' }],
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

    expect(result).toBeNull();
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
