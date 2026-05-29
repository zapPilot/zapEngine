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

const GOOGLE_PROVIDER = 'google';
const GOOGLE_ZH_HANT_CONFIG = {
  provider: GOOGLE_PROVIDER,
  languageCode: 'cmn-TW',
  voiceName: 'cmn-TW-Wavenet-A',
} satisfies GoogleTtsLanguageConfig;
const GOOGLE_JA_CONFIG = {
  provider: GOOGLE_PROVIDER,
  languageCode: 'ja-JP',
  voiceName: 'ja-JP-Wavenet-A',
} satisfies GoogleTtsLanguageConfig;
const GOOGLE_EN_CONFIG = {
  provider: GOOGLE_PROVIDER,
  languageCode: 'en-US',
  voiceName: 'en-US-Wavenet-A',
} satisfies GoogleTtsLanguageConfig;

export const MAIN_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': GOOGLE_ZH_HANT_CONFIG,
  ja: GOOGLE_JA_CONFIG,
  en: GOOGLE_EN_CONFIG,
};

export const CLASSROOM_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': GOOGLE_ZH_HANT_CONFIG,
  ja: GOOGLE_JA_CONFIG,
  en: GOOGLE_EN_CONFIG,
};

export function getTtsConfig(
  usage: TtsUsage,
  languageCode: LanguageClassroomLanguageCode,
): TtsLanguageConfig {
  return usage === 'main'
    ? MAIN_TTS_CONFIG[languageCode]
    : CLASSROOM_TTS_CONFIG[languageCode];
}
