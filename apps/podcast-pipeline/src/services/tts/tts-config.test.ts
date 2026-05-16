import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLASSROOM_TTS_CONFIG,
  getTtsConfig,
  MAIN_TTS_CONFIG,
  type TtsUsage,
} from './tts-config.js';

describe('TTS language config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('declares main-body and classroom routing in named config maps', () => {
    expect(MAIN_TTS_CONFIG['zh-Hant']).toEqual({
      provider: 'fish-audio',
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro',
    });
    expect(MAIN_TTS_CONFIG.ja).toEqual({
      provider: 'google',
      languageCode: 'ja-JP',
      voiceName: 'ja-JP-Wavenet-A',
    });
    expect(MAIN_TTS_CONFIG.en).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
    expect(CLASSROOM_TTS_CONFIG['zh-Hant']).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(CLASSROOM_TTS_CONFIG.ja).toEqual({
      provider: 'google',
      languageCode: 'ja-JP',
      voiceName: 'ja-JP-Wavenet-A',
    });
    expect(CLASSROOM_TTS_CONFIG.en).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
  });

  it.each([
    ['main', 'zh-Hant', 'fish-audio'],
    ['main', 'ja', 'google'],
    ['main', 'en', 'google'],
    ['classroom', 'zh-Hant', 'google'],
    ['classroom', 'ja', 'google'],
    ['classroom', 'en', 'google'],
  ] as const)(
    'routes %s %s audio to %s',
    (usage: TtsUsage, languageCode, provider) => {
      expect(getTtsConfig(usage, languageCode).provider).toBe(provider);
    },
  );

  it('ignores TTS env overrides because model config is code-owned', () => {
    vi.stubEnv('TTS_ZH_HANT_MODEL_ID', 'custom-zh-model');
    vi.stubEnv('TTS_ZH_HANT_ENGINE', 'speech-1.6');
    vi.stubEnv('TTS_JA_VOICE_NAME', 'ja-JP-Neural2-B');
    vi.stubEnv('TTS_EN_PROVIDER', 'fish-audio');
    vi.stubEnv('TTS_JA_PROVIDER', 'elevenlabs');

    expect(getTtsConfig('main', 'zh-Hant')).toEqual({
      provider: 'fish-audio',
      modelId: 'debb4c1065114ffda03f3a60abdcc421',
      engine: 's2-pro',
    });
    expect(getTtsConfig('main', 'ja')).toEqual({
      provider: 'google',
      languageCode: 'ja-JP',
      voiceName: 'ja-JP-Wavenet-A',
    });
    expect(getTtsConfig('classroom', 'zh-Hant')).toEqual({
      provider: 'google',
      languageCode: 'cmn-TW',
      voiceName: 'cmn-TW-Wavenet-A',
    });
    expect(getTtsConfig('main', 'en')).toEqual({
      provider: 'google',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });
  });
});
