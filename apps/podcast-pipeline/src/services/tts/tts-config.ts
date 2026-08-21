import type { LanguageClassroomLanguageCode } from '../../types.js';

export type TtsProvider = 'fish-audio' | 'google';
export type FishAudioEngine = 's2-pro' | 's1' | 's2.1-pro-free' | (string & {});

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

const FISH_AUDIO_CONFIG: FishAudioTtsLanguageConfig = {
  provider: FISH_AUDIO_PROVIDER,
  modelId: '',
  engine: DEFAULT_FISH_AUDIO_ENGINE,
};
const TTS_CONFIG: Record<
  TtsProvider,
  Record<LanguageClassroomLanguageCode, TtsLanguageConfig>
> = {
  google: {
    'zh-Hant': GOOGLE_ZH_HANT_CONFIG,
    ja: GOOGLE_JA_CONFIG,
    en: GOOGLE_EN_CONFIG,
  },
  'fish-audio': {
    'zh-Hant': FISH_AUDIO_CONFIG,
    ja: FISH_AUDIO_CONFIG,
    en: FISH_AUDIO_CONFIG,
  },
};

function resolveTtsProvider(): TtsProvider {
  const envProvider = process.env['TTS_PROVIDER']?.trim().toLowerCase();
  if (envProvider === FISH_AUDIO_PROVIDER) {
    const referenceId = getFishAudioReferenceId();
    if (!referenceId) {
      throw new Error(
        'TTS_PROVIDER=fish-audio requires FISH_AUDIO_REFERENCE_ID',
      );
    }
    return FISH_AUDIO_PROVIDER;
  }
  if (envProvider === GOOGLE_PROVIDER) {
    return GOOGLE_PROVIDER;
  }
  throw new Error('TTS_PROVIDER must be set to fish-audio or google');
}

function getFishAudioReferenceId(): string | null {
  const referenceId = process.env['FISH_AUDIO_REFERENCE_ID']?.trim();

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
  languageCode: LanguageClassroomLanguageCode,
): TtsLanguageConfig {
  const provider = resolveTtsProvider();
  const base = TTS_CONFIG[provider][languageCode];

  if (base.provider === 'fish-audio') {
    return buildFishAudioConfig(base);
  }

  return base;
}
