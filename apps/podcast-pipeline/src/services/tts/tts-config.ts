import type { LanguageClassroomLanguageCode } from '../../types.js';

export type TtsProvider = 'fish-audio' | 'google';
export type FishAudioEngine = 's2-pro' | 's1' | 's2.1-pro-free' | (string & {});
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
const FISH_AUDIO_PROVIDER = 'fish-audio';
const DEFAULT_FISH_AUDIO_ENGINE: FishAudioEngine = 's2-pro';
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

const FISH_AUDIO_ZH_HANT_CONFIG: FishAudioTtsLanguageConfig = {
  provider: FISH_AUDIO_PROVIDER,
  modelId: '',
  engine: DEFAULT_FISH_AUDIO_ENGINE,
};
const FISH_AUDIO_JA_CONFIG: FishAudioTtsLanguageConfig = {
  provider: FISH_AUDIO_PROVIDER,
  modelId: '',
  engine: DEFAULT_FISH_AUDIO_ENGINE,
};
const FISH_AUDIO_EN_CONFIG: FishAudioTtsLanguageConfig = {
  provider: FISH_AUDIO_PROVIDER,
  modelId: '',
  engine: DEFAULT_FISH_AUDIO_ENGINE,
};

const GOOGLE_MAIN_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': GOOGLE_ZH_HANT_CONFIG,
  ja: GOOGLE_JA_CONFIG,
  en: GOOGLE_EN_CONFIG,
};

const GOOGLE_CLASSROOM_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': GOOGLE_ZH_HANT_CONFIG,
  ja: GOOGLE_JA_CONFIG,
  en: GOOGLE_EN_CONFIG,
};

const FISH_AUDIO_MAIN_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': FISH_AUDIO_ZH_HANT_CONFIG,
  ja: FISH_AUDIO_JA_CONFIG,
  en: FISH_AUDIO_EN_CONFIG,
};

const FISH_AUDIO_CLASSROOM_TTS_CONFIG: Record<
  LanguageClassroomLanguageCode,
  TtsLanguageConfig
> = {
  'zh-Hant': FISH_AUDIO_ZH_HANT_CONFIG,
  ja: FISH_AUDIO_JA_CONFIG,
  en: FISH_AUDIO_EN_CONFIG,
};

function resolveTtsProvider(): TtsProvider {
  const envProvider = process.env['TTS_PROVIDER']?.trim().toLowerCase();
  if (envProvider === FISH_AUDIO_PROVIDER) {
    const referenceId = getFishAudioReferenceId();
    if (!referenceId) {
      console.warn(
        'TTS_PROVIDER=fish-audio but neither FISH_AUDIO_REFERENCE_ID nor FISH_AUDIO_MODEL_ID is set; falling back to google',
      );
      return 'google';
    }
    return FISH_AUDIO_PROVIDER;
  }
  return 'google';
}

function getFishAudioReferenceId(): string | null {
  const referenceId =
    process.env['FISH_AUDIO_REFERENCE_ID']?.trim() ||
    process.env['FISH_AUDIO_MODEL_ID']?.trim();

  return referenceId && referenceId.length > 0 ? referenceId : null;
}

function getFishAudioEngine(defaultEngine: FishAudioEngine): FishAudioEngine {
  return process.env['FISH_AUDIO_ENGINE']?.trim() || defaultEngine;
}

function buildFishAudioConfig(
  base: FishAudioTtsLanguageConfig,
): FishAudioTtsLanguageConfig {
  return {
    ...base,
    modelId: getFishAudioReferenceId()!,
    engine: getFishAudioEngine(base.engine),
  };
}

export function getTtsConfig(
  usage: TtsUsage,
  languageCode: LanguageClassroomLanguageCode,
): TtsLanguageConfig {
  const provider = resolveTtsProvider();

  if (provider === 'fish-audio') {
    const baseMap =
      usage === 'main'
        ? FISH_AUDIO_MAIN_TTS_CONFIG
        : FISH_AUDIO_CLASSROOM_TTS_CONFIG;
    const base = baseMap[languageCode];
    return buildFishAudioConfig(base as FishAudioTtsLanguageConfig);
  }

  const googleMap =
    usage === 'main' ? GOOGLE_MAIN_TTS_CONFIG : GOOGLE_CLASSROOM_TTS_CONFIG;
  return googleMap[languageCode];
}
