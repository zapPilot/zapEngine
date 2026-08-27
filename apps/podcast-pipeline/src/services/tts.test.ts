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
    vi.stubEnv('FISH_AUDIO_ENGINE', 's2-pro');
    mocks.synthesize.mockResolvedValue({
      audio: Buffer.from('fish-audio'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'fish-audio',
          model: 's2-pro',
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
          model: 's2-pro',
          costUsd: 0.00001,
        },
      ],
    });

    expect(mocks.synthesize).toHaveBeenCalledWith('測試文字', {
      languageCode: 'zh-Hant',
      config: {
        modelId: 'fish-reference',
        engine: 's2-pro',
      },
      costLabel: 'TTS audio',
    });
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
        engine: 's2-pro',
      },
      costLabel: 'English main TTS',
    });
  });

  it('returns Fish Audio metadata', () => {
    expect(getTtsMetadata({ languageCode: 'ja' })).toEqual({
      languageCode: 'ja',
      voiceName: 'fish-reference',
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

    expect(() => getTtsMetadata({ languageCode: 'ja' })).toThrow(
      'FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS',
    );
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });
});
