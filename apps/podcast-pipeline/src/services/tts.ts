import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
} from '../types.js';
import type { UsageCostLine } from './cost.js';
import {
  getMetadata as getFishAudioMetadata,
  synthesize as synthesizeWithFishAudio,
} from './tts/fish-audio.js';
import {
  getMetadata as getGoogleMetadata,
  synthesize as synthesizeWithGoogle,
} from './tts/google.js';
import {
  getTtsConfig,
  type TtsLanguageConfig,
  type TtsProvider,
} from './tts/tts-config.js';

export type { TtsLanguageConfig, TtsProvider } from './tts/tts-config.js';

export interface TtsMetadata {
  provider: TtsProvider;
  languageCode: string;
  voiceName: string;
}

export interface TtsSynthesizeOptions {
  languageCode: LanguageClassroomLanguageCode;
  config: TtsLanguageConfig;
  costLabel?: string;
}

export interface TtsSynthesisResult {
  audio: Buffer;
  cost: UsageCostLine[];
}

interface TtsProviderModule {
  synthesize(
    text: string,
    opts: TtsSynthesizeOptions,
  ): Promise<TtsSynthesisResult>;
  getMetadata(opts: TtsSynthesizeOptions): TtsMetadata;
}

function getProvider(config: TtsLanguageConfig): TtsProviderModule {
  switch (config.provider) {
    case 'fish-audio':
      return {
        getMetadata: getFishAudioMetadata,
        synthesize: synthesizeWithFishAudio,
      };
    case 'google':
      return {
        getMetadata: getGoogleMetadata,
        synthesize: synthesizeWithGoogle,
      };
  }
}

function normalizeTtsOptions(opts?: {
  languageCode?: LanguageClassroomLanguageCode;
  costLabel?: string;
}): TtsSynthesizeOptions {
  const languageCode = opts?.languageCode ?? DEFAULT_LANGUAGE_CODE;

  return {
    languageCode,
    config: getTtsConfig(languageCode),
    costLabel: opts?.costLabel ?? 'TTS audio',
  };
}

export async function textToSpeech(
  text: string,
  opts?: {
    languageCode?: LanguageClassroomLanguageCode;
    costLabel?: string;
  },
): Promise<TtsSynthesisResult> {
  const ttsOptions = normalizeTtsOptions(opts);
  return getProvider(ttsOptions.config).synthesize(text, ttsOptions);
}

export function getTtsMetadata(opts?: {
  languageCode?: LanguageClassroomLanguageCode;
}): TtsMetadata {
  const ttsOptions = normalizeTtsOptions(opts);
  return getProvider(ttsOptions.config).getMetadata(ttsOptions);
}
