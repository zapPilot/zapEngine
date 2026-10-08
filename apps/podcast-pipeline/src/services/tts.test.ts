import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock('./tts/fish-audio.js', () => ({
  getMetadata: mocks.getMetadata,
  synthesize: mocks.synthesize,
}));

import { getTtsMetadata, textToSpeech } from './tts.js';

describe('Fish Audio TTS facade', () => {
  beforeEach(() => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');
    vi.stubEnv('FISH_AUDIO_ENGINE', 's2.1-pro-free');
    mocks.synthesize.mockResolvedValue({
      audio: Buffer.from('fish-audio'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'fish-audio',
          model: 's2.1-pro-free',
          costUsd: 0.00001,
        },
      ],
    });
    mocks.getMetadata.mockImplementation((opts) => ({
      languageCode: opts.languageCode,
      voiceName: opts.config.modelId,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('always synthesizes through Fish Audio', async () => {
    await expect(
      textToSpeech('測試文字', { languageCode: 'zh-Hant' }),
    ).resolves.toEqual({
      audio: Buffer.from('fish-audio'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'fish-audio',
          model: 's2.1-pro-free',
          costUsd: 0.00001,
        },
      ],
    });

    expect(mocks.synthesize).toHaveBeenCalledWith('測試文字', {
      languageCode: 'zh-Hant',
      config: {
        modelId: 'fish-reference',
        engine: 's2.1-pro-free',
      },
      costLabel: 'TTS audio',
    });
  });

  it('normalizes Fish byte usage to zero billed USD', async () => {
    mocks.synthesize.mockResolvedValue({
      audio: Buffer.from('audio'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'fish-audio',
          model: 's2.1-pro-free',
          costUsd: 9,
          usage: { unit: 'utf8_bytes', quantity: 12 },
        },
      ],
    });
    const result = await textToSpeech('market', { languageCode: 'en' });
    expect(result.cost).toEqual([
      expect.objectContaining({
        costUsd: 0,
        usage: { unit: 'utf8_bytes', quantity: 12, unitPriceUsd: 0 },
      }),
    ]);
  });

  it('passes a custom cost label through to Fish Audio', async () => {
    await textToSpeech('market liquidity', {
      languageCode: 'en',
      costLabel: 'English main TTS',
    });

    expect(mocks.synthesize).toHaveBeenCalledWith('market liquidity', {
      languageCode: 'en',
      config: {
        modelId: 'fish-reference',
        engine: 's2.1-pro-free',
      },
      costLabel: 'English main TTS',
    });
  });

  it.each([
    ['English DeFi terms', 'en'],
    ['中文 DeFi 旁白', 'zh-Hant'],
    ['日本語の DeFi ナレーション', 'ja'],
  ] as const)(
    'keeps the complete %s text in one Fish Audio request',
    async (text, languageCode) => {
      await textToSpeech(text, { languageCode });
      expect(mocks.synthesize).toHaveBeenCalledTimes(1);
      expect(mocks.synthesize).toHaveBeenCalledWith(
        text,
        expect.objectContaining({ languageCode }),
      );
    },
  );

  it('returns Fish Audio metadata', () => {
    expect(getTtsMetadata({ languageCode: 'zh-Hant' })).toEqual({
      languageCode: 'zh-Hant',
      voiceName: 'fish-reference',
    });
  });

  it('routes Japanese narration to someone else’s voice', async () => {
    await textToSpeech('日本語ナレーション', { languageCode: 'ja' });

    expect(mocks.synthesize).toHaveBeenCalledWith('日本語ナレーション', {
      languageCode: 'ja',
      config: {
        modelId: '63bc41e652214372b15d9416a30a60b4',
        engine: 's2.1-pro-free',
      },
      costLabel: 'TTS audio',
    });
    expect(getTtsMetadata({ languageCode: 'ja' })).toEqual({
      languageCode: 'ja',
      voiceName: '63bc41e652214372b15d9416a30a60b4',
    });
  });

  it('prefers FISH_AUDIO_REFERENCE_ID_JA for Japanese narration only', async () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID_JA', 'ja-override');

    await textToSpeech('日本語ナレーション', { languageCode: 'ja' });
    expect(mocks.synthesize).toHaveBeenCalledWith('日本語ナレーション', {
      languageCode: 'ja',
      config: { modelId: 'ja-override', engine: 's2.1-pro-free' },
      costLabel: 'TTS audio',
    });

    await textToSpeech('中文旁白', { languageCode: 'zh-Hant' });
    expect(mocks.synthesize).toHaveBeenCalledWith('中文旁白', {
      languageCode: 'zh-Hant',
      config: { modelId: 'fish-reference', engine: 's2.1-pro-free' },
      costLabel: 'TTS audio',
    });
  });

  it('fails closed when the Fish Audio reference id is missing', async () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '');

    await expect(
      textToSpeech('測試文字', { languageCode: 'zh-Hant' }),
    ).rejects.toThrow('FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS');
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it('fails closed on metadata when the Fish Audio reference id is missing', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '');

    expect(() => getTtsMetadata({ languageCode: 'zh-Hant' })).toThrow(
      'FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS',
    );
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });

  it('fails closed on Japanese metadata when the JA override is blank', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID_JA', '   ');

    expect(() => getTtsMetadata({ languageCode: 'ja' })).toThrow(
      'FISH_AUDIO_REFERENCE_ID_JA is required for Japanese Fish Audio TTS when set',
    );
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });
});
