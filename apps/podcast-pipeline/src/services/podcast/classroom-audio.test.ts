import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguageClassroomRow } from '../../types.js';

const { mockTextToSpeech } = vi.hoisted(() => ({
  mockTextToSpeech: vi.fn(),
}));

vi.mock('../tts.js', () => ({
  textToSpeech: mockTextToSpeech,
}));

import { synthesizeClassroomAudio } from './classroom-audio.js';

function classroomRow(
  overrides: Partial<LanguageClassroomRow> = {},
): Pick<LanguageClassroomRow, 'target_language_code' | 'script'> {
  return {
    target_language_code: 'ja',
    script: '流動性とは、資産を素早く現金化できる度合いのことです。',
    ...overrides,
  };
}

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synthesizes the whole lesson script in a single TTS call for the target language', async () => {
    const row = classroomRow();

    const result = await synthesizeClassroomAudio(row, {
      episodeId: 'episode-1',
    });

    expect(result.audio).toEqual(
      Buffer.from('ja:流動性とは、資産を素早く現金化できる度合いのことです。'),
    );
    expect(result.cost).toHaveLength(1);
    expect(mockTextToSpeech).toHaveBeenCalledTimes(1);
    expect(mockTextToSpeech).toHaveBeenCalledWith(
      '流動性とは、資産を素早く現金化できる度合いのことです。',
      {
        languageCode: 'ja',
        usage: 'classroom',
        costLabel: 'TTS classroom audio',
      },
    );
  });

  it('strips stray separator lines before synthesis, mirroring main narration cleansing', async () => {
    const row = classroomRow({
      script: 'Liquidity matters.\n\n---\n\nSo does volatility.',
    });

    await synthesizeClassroomAudio(row);

    expect(mockTextToSpeech).toHaveBeenCalledWith(
      'Liquidity matters.\n\nSo does volatility.',
      expect.objectContaining({ languageCode: 'ja' }),
    );
  });

  it('logs target-level classroom progress', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await synthesizeClassroomAudio(classroomRow(), {
      episodeId: 'episode-1',
    });

    expect(log.mock.calls.map(([message]) => String(message))).toEqual(
      expect.arrayContaining([
        '[/ingest] classroom:target:start targetLanguage=ja',
        '[/ingest] classroom:target:done targetLanguage=ja',
      ]),
    );
    log.mockRestore();
  });

  it('rejects an unsupported target language code', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await synthesizeClassroomAudio(
      classroomRow({ target_language_code: 'ko' }),
      { episodeId: 'episode-1' },
    );

    expect(result).toEqual({ audio: null, cost: [] });
    expect(mockTextToSpeech).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[classroom-audio] synthesis failed:',
      expect.objectContaining({
        episodeId: 'episode-1',
        targetLanguageCode: 'ko',
        message: 'Unsupported language classroom code: ko',
      }),
    );
  });

  it('returns null and logs structured context when classroom synthesis fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTextToSpeech.mockRejectedValue(new Error('Fish Audio timeout'));

    const result = await synthesizeClassroomAudio(classroomRow(), {
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
        message: 'Fish Audio timeout',
      }),
    );
  });

  it('unwraps a nested Error cause and supports omitted episode context', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const cause = new Error('provider root cause');
    mockTextToSpeech.mockRejectedValue(new Error('step wrapper', { cause }));

    await expect(synthesizeClassroomAudio(classroomRow())).resolves.toEqual({
      audio: null,
      cost: [],
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[classroom-audio] synthesis failed:',
      expect.objectContaining({
        episodeId: undefined,
        message: 'step wrapper',
        cause,
      }),
    );
  });

  it('handles non-Error thrown values when synthesizing', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockTextToSpeech.mockRejectedValue('string error');

    const result = await synthesizeClassroomAudio(classroomRow(), {
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
});
