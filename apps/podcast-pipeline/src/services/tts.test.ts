import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFishGetMetadata,
  mockFishSynthesize,
  mockGoogleGetMetadata,
  mockGoogleSynthesize,
} = vi.hoisted(() => ({
  mockFishGetMetadata: vi.fn(),
  mockFishSynthesize: vi.fn(),
  mockGoogleGetMetadata: vi.fn(),
  mockGoogleSynthesize: vi.fn(),
}));

vi.mock('./tts/fish-audio.js', () => ({
  getMetadata: mockFishGetMetadata,
  synthesize: mockFishSynthesize,
}));

vi.mock('./tts/google.js', () => ({
  getMetadata: mockGoogleGetMetadata,
  synthesize: mockGoogleSynthesize,
}));

import { getTtsMetadata, textToSpeech } from './tts.js';

describe('TTS provider dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFishSynthesize.mockResolvedValue(Buffer.from('fish-audio'));
    mockGoogleSynthesize.mockResolvedValue(Buffer.from('google'));
    mockFishGetMetadata.mockImplementation(
      (opts?: { languageCode?: string; config?: { modelId?: string } }) => ({
        provider: 'fish-audio',
        languageCode: opts?.languageCode ?? 'zh-Hant',
        voiceName: opts?.config?.modelId ?? 'debb4c1065114ffda03f3a60abdcc421',
      }),
    );
    mockGoogleGetMetadata.mockImplementation(
      (opts?: { config?: { languageCode?: string; voiceName?: string } }) => ({
        provider: 'google',
        languageCode: opts?.config?.languageCode ?? 'cmn-TW',
        voiceName: opts?.config?.voiceName ?? 'cmn-TW-Wavenet-A',
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults zh-Hant to Fish Audio when no language is specified', async () => {
    const result = await textToSpeech('測試文字');

    expect(result).toEqual(Buffer.from('fish-audio'));
    expect(mockFishSynthesize).toHaveBeenCalledWith('測試文字', {
      languageCode: 'zh-Hant',
      config: {
        provider: 'fish-audio',
        modelId: 'debb4c1065114ffda03f3a60abdcc421',
        engine: 's2-pro',
      },
    });
    expect(mockGoogleSynthesize).not.toHaveBeenCalled();
  });

  it('routes classroom target languages to Google by default', async () => {
    await expect(
      textToSpeech('market liquidity', { languageCode: 'en' }),
    ).resolves.toEqual(Buffer.from('google'));

    expect(mockGoogleSynthesize).toHaveBeenCalledWith('market liquidity', {
      languageCode: 'en',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('ignores TTS env overrides when routing because config is code-owned', async () => {
    vi.stubEnv('TTS_EN_PROVIDER', 'fish-audio');
    vi.stubEnv('TTS_EN_MODEL_ID', 'custom-en-model');

    await expect(
      textToSpeech('market liquidity', { languageCode: 'en' }),
    ).resolves.toEqual(Buffer.from('google'));

    expect(mockGoogleSynthesize).toHaveBeenCalledWith('market liquidity', {
      languageCode: 'en',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('returns Fish Audio metadata by default', () => {
    expect(getTtsMetadata()).toEqual({
      provider: 'fish-audio',
      languageCode: 'zh-Hant',
      voiceName: 'debb4c1065114ffda03f3a60abdcc421',
    });
    expect(mockFishGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      config: {
        provider: 'fish-audio',
        modelId: 'debb4c1065114ffda03f3a60abdcc421',
        engine: 's2-pro',
      },
    });
    expect(mockGoogleGetMetadata).not.toHaveBeenCalled();
  });

  it('returns metadata for a requested classroom language', () => {
    expect(getTtsMetadata({ languageCode: 'en' })).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalledWith({
      languageCode: 'en',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
    });
  });

  it('ignores TTS env overrides when returning metadata', () => {
    vi.stubEnv('TTS_ZH_HANT_PROVIDER', 'google');

    expect(getTtsMetadata()).toEqual({
      provider: 'fish-audio',
      languageCode: 'zh-Hant',
      voiceName: 'debb4c1065114ffda03f3a60abdcc421',
    });
    expect(mockFishGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      config: {
        provider: 'fish-audio',
        modelId: 'debb4c1065114ffda03f3a60abdcc421',
        engine: 's2-pro',
      },
    });
    expect(mockGoogleGetMetadata).not.toHaveBeenCalled();
  });
});
