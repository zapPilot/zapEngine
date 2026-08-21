import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTtsConfig } from './tts-config.js';

describe('TTS language config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Google only when TTS_PROVIDER=google', () => {
    vi.stubEnv('TTS_PROVIDER', 'google');

    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(getTtsConfig('ja')).toEqual({
      provider: 'google',
      languageCode: 'ja-JP',
      voiceName: 'ja-JP-Wavenet-A',
    });
    expect(getTtsConfig('en')).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
  });

  it.each([
    ['zh-Hant', 'google'],
    ['ja', 'google'],
    ['en', 'google'],
  ] as const)(
    'routes %s audio to %s when explicitly configured',
    (languageCode, provider) => {
      vi.stubEnv('TTS_PROVIDER', 'google');
      expect(getTtsConfig(languageCode).provider).toBe(provider);
    },
  );

  it('switches to fish-audio when TTS_PROVIDER=fish-audio and FISH_AUDIO_REFERENCE_ID is set', () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'my-voice-reference');

    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-reference',
      engine: 's2-pro',
    });
    expect(getTtsConfig('ja')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-reference',
      engine: 's2-pro',
    });
    expect(getTtsConfig('en')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-reference',
      engine: 's2-pro',
    });
  });

  it('uses FISH_AUDIO_ENGINE for the Fish Audio request model header', () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'my-voice-reference');
    vi.stubEnv('FISH_AUDIO_ENGINE', 's2.1-pro-free');

    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-reference',
      engine: 's2.1-pro-free',
    });
  });

  it('fails closed when TTS_PROVIDER=fish-audio but no Fish Audio reference id is set', () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');

    expect(() => getTtsConfig('zh-Hant')).toThrow(
      'TTS_PROVIDER=fish-audio requires FISH_AUDIO_REFERENCE_ID',
    );
  });

  it('fails closed when Fish Audio reference id is empty', () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '   ');

    expect(() => getTtsConfig('en')).toThrow(
      'TTS_PROVIDER=fish-audio requires FISH_AUDIO_REFERENCE_ID',
    );
  });

  it('fails closed when TTS_PROVIDER is unset', () => {
    expect(() => getTtsConfig('zh-Hant')).toThrow(
      'TTS_PROVIDER must be set to fish-audio or google',
    );
  });

  it('fails closed for unknown TTS_PROVIDER values', () => {
    vi.stubEnv('TTS_PROVIDER', 'elevenlabs');

    expect(() => getTtsConfig('zh-Hant')).toThrow(
      'TTS_PROVIDER must be set to fish-audio or google',
    );
  });

  it('is case-insensitive for TTS_PROVIDER', () => {
    vi.stubEnv('TTS_PROVIDER', 'Fish-Audio');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'my-voice-reference');

    expect(getTtsConfig('zh-Hant').provider).toBe('fish-audio');
  });

  it('trims whitespace from TTS_PROVIDER, FISH_AUDIO_REFERENCE_ID, and FISH_AUDIO_ENGINE', () => {
    vi.stubEnv('TTS_PROVIDER', '  fish-audio  ');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '  my-voice-reference  ');
    vi.stubEnv('FISH_AUDIO_ENGINE', '  s2.1-pro-free  ');

    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-reference',
      engine: 's2.1-pro-free',
    });
  });
});
