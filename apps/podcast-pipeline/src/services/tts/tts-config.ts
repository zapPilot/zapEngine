import type { LanguageClassroomLanguageCode } from '../../types.js';

export type TtsProvider = 'fish-audio' | 'google';
export type FishAudioEngine = 's2-pro' | 's1';
export type TtsUsage = 'main' | 'classroom';

export interface FishAudioTtsLanguageConfig {
  provider: 'fish-audio';
  modelId: string;
  engine: FishAudioEngine;
}

export interface GoogleTtsLanguageConfig {
  provider: 'google';
  languageCode: string;
  voiceName: string;
}

export type TtsLanguageConfig =
  | FishAudioTtsLanguageConfig
  | GoogleTtsLanguageConfig;

const FISH_AUDIO_PROVIDER = 'fish-audio';
const GOOGLE_PROVIDER = 'google';
const DEFAULT_FISH_AUDIO_MODEL_ID = 'debb4c1065114ffda03f3a60abdcc421';

export const MAIN_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': {
    provider: FISH_AUDIO_PROVIDER,
    modelId: DEFAULT_FISH_AUDIO_MODEL_ID,
    engine: 's2-pro',
  },
  ja: {
    provider: GOOGLE_PROVIDER,
    languageCode: 'ja-JP',
    voiceName: 'ja-JP-Wavenet-A',
  },
  en: {
    provider: GOOGLE_PROVIDER,
    languageCode: 'en-US',
    voiceName: 'en-US-Wavenet-A',
  },
};

export const CLASSROOM_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': {
    provider: GOOGLE_PROVIDER,
    languageCode: 'cmn-TW',
    voiceName: 'cmn-TW-Wavenet-A',
  },
  ja: {
    provider: GOOGLE_PROVIDER,
    languageCode: 'ja-JP',
    voiceName: 'ja-JP-Wavenet-A',
  },
  en: {
    provider: GOOGLE_PROVIDER,
    languageCode: 'en-US',
    voiceName: 'en-US-Wavenet-A',
  },
};

export function getTtsConfig(
  usage: TtsUsage,
  languageCode: LanguageClassroomLanguageCode,
): TtsLanguageConfig {
  return usage === 'main'
    ? MAIN_TTS_CONFIG[languageCode]
    : CLASSROOM_TTS_CONFIG[languageCode];
}
