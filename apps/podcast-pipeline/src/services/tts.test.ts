import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TtsConfigModule = typeof import('./tts/tts-config.js');

const {
  mockFishGetMetadata,
  mockFishSynthesize,
  mockGoogleGetMetadata,
  mockGoogleSynthesize,
  mockGetTtsConfig,
  realTtsConfig,
} = vi.hoisted(() => ({
  mockFishGetMetadata: vi.fn(),
  mockFishSynthesize: vi.fn(),
  mockGoogleGetMetadata: vi.fn(),
  mockGoogleSynthesize: vi.fn(),
  mockGetTtsConfig: vi.fn(),
  realTtsConfig: {} as { getTtsConfig?: TtsConfigModule['getTtsConfig'] },
}));

vi.mock('./tts/fish-audio.js', () => ({
  getMetadata: mockFishGetMetadata,
  synthesize: mockFishSynthesize,
}));

vi.mock('./tts/google.js', () => ({
  getMetadata: mockGoogleGetMetadata,
  synthesize: mockGoogleSynthesize,
}));

vi.mock('./tts/tts-config.js', async (importOriginal) => {
  const actual = await importOriginal<TtsConfigModule>();
  realTtsConfig.getTtsConfig = actual.getTtsConfig;
  return { ...actual, getTtsConfig: mockGetTtsConfig };
});

import { getTtsMetadata, textToSpeech } from './tts.js';

describe('TTS provider dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTtsConfig.mockImplementation((usage, languageCode) =>
      realTtsConfig.getTtsConfig!(usage, languageCode),
    );
    mockFishSynthesize.mockResolvedValue({
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
    mockGoogleSynthesize.mockResolvedValue({
      audio: Buffer.from('google'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'google',
          model: 'en-US-Wavenet-A',
          costUsd: 0.00002,
        },
      ],
    });
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

  it('routes zh-Hant main audio to Google', async () => {
    const result = await textToSpeech('測試文字', {
      languageCode: 'zh-Hant',
      usage: 'main',
    });

    expect(result).toEqual({
      audio: Buffer.from('google'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'google',
          model: 'en-US-Wavenet-A',
          costUsd: 0.00002,
        },
      ],
    });
    expect(mockGoogleSynthesize).toHaveBeenCalledWith('測試文字', {
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'cmn-TW',
        voiceName: 'cmn-TW-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('routes target-language main audio to Google', async () => {
    await expect(
      textToSpeech('market liquidity', {
        languageCode: 'en',
        usage: 'main',
      }),
    ).resolves.toEqual({
      audio: Buffer.from('google'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'google',
          model: 'en-US-Wavenet-A',
          costUsd: 0.00002,
        },
      ],
    });

    expect(mockGoogleSynthesize).toHaveBeenCalledWith('market liquidity', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('routes zh-Hant classroom audio to Google', async () => {
    await textToSpeech('接下來是日文小教室。', {
      languageCode: 'zh-Hant',
      usage: 'classroom',
    });

    expect(mockGoogleSynthesize).toHaveBeenCalledWith('接下來是日文小教室。', {
      languageCode: 'zh-Hant',
      usage: 'classroom',
      config: {
        provider: 'google',
        languageCode: 'cmn-TW',
        voiceName: 'cmn-TW-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('ignores TTS env overrides when routing because config is code-owned', async () => {
    vi.stubEnv('TTS_EN_PROVIDER', 'fish-audio');
    vi.stubEnv('TTS_EN_MODEL_ID', 'custom-en-model');

    await expect(
      textToSpeech('market liquidity', {
        languageCode: 'en',
        usage: 'main',
      }),
    ).resolves.toEqual({
      audio: Buffer.from('google'),
      cost: [
        {
          category: 'tts',
          label: 'TTS audio',
          provider: 'google',
          model: 'en-US-Wavenet-A',
          costUsd: 0.00002,
        },
      ],
    });

    expect(mockGoogleSynthesize).toHaveBeenCalledWith('market liquidity', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('returns Google metadata for zh-Hant main audio', () => {
    expect(getTtsMetadata({ languageCode: 'zh-Hant', usage: 'main' })).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'cmn-TW',
        voiceName: 'cmn-TW-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishGetMetadata).not.toHaveBeenCalled();
  });

  it('returns metadata for a requested main language', () => {
    expect(getTtsMetadata({ languageCode: 'en', usage: 'main' })).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalledWith({
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
  });

  it('returns Google metadata for zh-Hant classroom audio', () => {
    expect(
      getTtsMetadata({ languageCode: 'zh-Hant', usage: 'classroom' }),
    ).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      usage: 'classroom',
      config: {
        provider: 'google',
        languageCode: 'cmn-TW',
        voiceName: 'cmn-TW-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
  });

  it('ignores TTS env overrides when returning metadata', () => {
    vi.stubEnv('TTS_ZH_HANT_PROVIDER', 'fish-audio');

    expect(getTtsMetadata({ languageCode: 'zh-Hant', usage: 'main' })).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'cmn-TW',
        voiceName: 'cmn-TW-Wavenet-A',
      },
      costLabel: 'TTS audio',
    });
    expect(mockFishGetMetadata).not.toHaveBeenCalled();
  });

  it('dispatches synthesis to the Fish Audio provider for a fish-audio config', async () => {
    const fishConfig = {
      provider: 'fish-audio' as const,
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro' as const,
    };
    mockGetTtsConfig.mockReturnValue(fishConfig);

    await expect(
      textToSpeech('測試文字', { languageCode: 'zh-Hant', usage: 'main' }),
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

    expect(mockFishSynthesize).toHaveBeenCalledWith('測試文字', {
      languageCode: 'zh-Hant',
      usage: 'main',
      config: fishConfig,
      costLabel: 'TTS audio',
    });
    expect(mockGoogleSynthesize).not.toHaveBeenCalled();
  });

  it('returns Fish Audio metadata for a fish-audio config', () => {
    const fishConfig = {
      provider: 'fish-audio' as const,
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro' as const,
    };
    mockGetTtsConfig.mockReturnValue(fishConfig);

    expect(getTtsMetadata({ languageCode: 'zh-Hant', usage: 'main' })).toEqual({
      provider: 'fish-audio',
      languageCode: 'zh-Hant',
      voiceName: 'debb4c1065114ffda03f3a60abdcc421',
    });
    expect(mockFishGetMetadata).toHaveBeenCalledWith({
      languageCode: 'zh-Hant',
      usage: 'main',
      config: fishConfig,
      costLabel: 'TTS audio',
    });
    expect(mockGoogleGetMetadata).not.toHaveBeenCalled();
  });
});
