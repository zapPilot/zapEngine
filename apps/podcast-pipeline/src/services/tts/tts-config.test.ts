import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getTtsConfig,
  type TtsUsage,
} from './tts-config.js';

describe('TTS language config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to google when TTS_PROVIDER is unset', () => {
    expect(getTtsConfig('main', 'zh-Hant')).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(getTtsConfig('main', 'ja')).toEqual({
      provider: 'google',
      languageCode: 'ja-JP',
      voiceName: 'ja-JP-Wavenet-A',
    });
    expect(getTtsConfig('main', 'en')).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
  });

  it.each([
    ['main', 'zh-Hant', 'google'],
    ['main', 'ja', 'google'],
    ['main', 'en', 'google'],
    ['classroom', 'zh-Hant', 'google'],
    ['classroom', 'ja', 'google'],
    ['classroom', 'en', 'google'],
  ] as const)(
    'defaults %s %s audio to %s',
    (usage: TtsUsage, languageCode, provider) => {
      expect(getTtsConfig(usage, languageCode).provider).toBe(provider);
    },
  );

  it('switches to fish-audio when TTS_PROVIDER=fish-audio and FISH_AUDIO_MODEL_ID is set', () => {
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', 'my-voice-model');

    expect(getTtsConfig('main', 'zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-model',
      engine: 's2-pro',
    });
    expect(getTtsConfig('main', 'ja')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-model',
      engine: 's2-pro',
    });
    expect(getTtsConfig('classroom', 'en')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-model',
      engine: 's2-pro',
    });
  });

  it('falls back to google when TTS_PROVIDER=fish-audio but FISH_AUDIO_MODEL_ID is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');

    expect(getTtsConfig('main', 'zh-Hant').provider).toBe('google');
    expect(warnSpy).toHaveBeenCalledWith(
      'TTS_PROVIDER=fish-audio but FISH_AUDIO_MODEL_ID is not set; falling back to google',
    );

    warnSpy.mockRestore();
  });

  it('falls back to google when TTS_PROVIDER=fish-audio but FISH_AUDIO_MODEL_ID is empty', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('TTS_PROVIDER', 'fish-audio');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', '   ');

    expect(getTtsConfig('main', 'en').provider).toBe('google');
    expect(warnSpy).toHaveBeenCalledWith(
      'TTS_PROVIDER=fish-audio but FISH_AUDIO_MODEL_ID is not set; falling back to google',
    );

    warnSpy.mockRestore();
  });

  it('treats unknown TTS_PROVIDER values as google', () => {
    vi.stubEnv('TTS_PROVIDER', 'elevenlabs');

    expect(getTtsConfig('main', 'zh-Hant').provider).toBe('google');
  });

  it('is case-insensitive for TTS_PROVIDER', () => {
    vi.stubEnv('TTS_PROVIDER', 'Fish-Audio');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', 'my-voice-model');

    expect(getTtsConfig('main', 'zh-Hant').provider).toBe('fish-audio');
  });

  it('trims whitespace from TTS_PROVIDER and FISH_AUDIO_MODEL_ID', () => {
    vi.stubEnv('TTS_PROVIDER', '  fish-audio  ');
    vi.stubEnv('FISH_AUDIO_MODEL_ID', '  my-voice-model  ');

    expect(getTtsConfig('main', 'zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'my-voice-model',
      engine: 's2-pro',
    });
  });
});
