import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTtsConfig } from './tts-config.js';

describe('TTS language config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Fish Audio for Traditional Chinese and Google for classroom target languages', () => {
    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro',
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

  it('ignores TTS env overrides because model config is code-owned', () => {
    vi.stubEnv('TTS_ZH_HANT_MODEL_ID', 'custom-zh-model');
    vi.stubEnv('TTS_ZH_HANT_ENGINE', 'speech-1.6');
    vi.stubEnv('TTS_JA_VOICE_NAME', 'ja-JP-Neural2-B');
    vi.stubEnv('TTS_EN_PROVIDER', 'fish-audio');
    vi.stubEnv('TTS_JA_PROVIDER', 'elevenlabs');

    expect(getTtsConfig('zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro',
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
});
