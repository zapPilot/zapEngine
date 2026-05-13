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
    mockFishGetMetadata.mockReturnValue({
      provider: 'fish-audio',
      languageCode: 'zh-Hant',
      voiceName: '8957c0744def4b5aafb37103fa8c9efb',
    });
    mockGoogleGetMetadata.mockReturnValue({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Fish Audio when TTS_PROVIDER is unset', async () => {
    const result = await textToSpeech('測試文字');

    expect(result).toEqual(Buffer.from('fish-audio'));
    expect(mockFishSynthesize).toHaveBeenCalledWith('測試文字');
    expect(mockGoogleSynthesize).not.toHaveBeenCalled();
  });

  it('routes to Fish Audio when TTS_PROVIDER=fish-audio', async () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');

    await expect(textToSpeech('測試文字')).resolves.toEqual(
      Buffer.from('fish-audio'),
    );
    expect(mockFishSynthesize).toHaveBeenCalledWith('測試文字');
    expect(mockGoogleSynthesize).not.toHaveBeenCalled();
  });

  it('routes to Google when TTS_PROVIDER=google', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google');

    await expect(textToSpeech('測試文字')).resolves.toEqual(
      Buffer.from('google'),
    );
    expect(mockGoogleSynthesize).toHaveBeenCalledWith('測試文字');
    expect(mockFishSynthesize).not.toHaveBeenCalled();
  });

  it('throws for unsupported providers', async () => {
    vi.stubEnv('TTS_PROVIDER', 'elevenlabs');

    await expect(textToSpeech('測試文字')).rejects.toThrow(
      'Unsupported TTS_PROVIDER "elevenlabs". Expected "fish-audio" or "google".',
    );
  });

  it('returns Fish Audio metadata by default', () => {
    expect(getTtsMetadata()).toEqual({
      provider: 'fish-audio',
      languageCode: 'zh-Hant',
      voiceName: '8957c0744def4b5aafb37103fa8c9efb',
    });
    expect(mockFishGetMetadata).toHaveBeenCalled();
    expect(mockGoogleGetMetadata).not.toHaveBeenCalled();
  });

  it('returns Google metadata when TTS_PROVIDER=google', () => {
    vi.stubEnv('TTS_PROVIDER', 'google');

    expect(getTtsMetadata()).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(mockGoogleGetMetadata).toHaveBeenCalled();
    expect(mockFishGetMetadata).not.toHaveBeenCalled();
  });
});
