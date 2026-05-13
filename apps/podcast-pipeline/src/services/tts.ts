import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
} from '../types.js';
import {
  getMetadata as getFishAudioMetadata,
  synthesize as synthesizeWithFishAudio,
} from './tts/fish-audio.js';
import {
  getMetadata as getGoogleMetadata,
  synthesize as synthesizeWithGoogle,
} from './tts/google.js';

export type TtsProvider = 'fish-audio' | 'google';

export interface TtsMetadata {
  provider: TtsProvider;
  languageCode: string;
  voiceName: string;
}

export interface TtsSynthesizeOptions {
  languageCode: LanguageClassroomLanguageCode;
}

interface TtsProviderModule {
  synthesize(text: string, opts: TtsSynthesizeOptions): Promise<Buffer>;
  getMetadata(opts: TtsSynthesizeOptions): TtsMetadata;
}

function getProviderName(): TtsProvider {
  const provider = process.env['TTS_PROVIDER']?.trim() || 'fish-audio';

  if (provider === 'fish-audio' || provider === 'google') {
    return provider;
  }

  throw new Error(
    `Unsupported TTS_PROVIDER "${provider}". Expected "fish-audio" or "google".`,
  );
}

function getProvider(): TtsProviderModule {
  switch (getProviderName()) {
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
}): TtsSynthesizeOptions {
  return {
    languageCode: opts?.languageCode ?? DEFAULT_LANGUAGE_CODE,
  };
}

export async function textToSpeech(
  text: string,
  opts?: { languageCode?: LanguageClassroomLanguageCode },
): Promise<Buffer> {
  return getProvider().synthesize(text, normalizeTtsOptions(opts));
}

export function getTtsMetadata(opts?: {
  languageCode?: LanguageClassroomLanguageCode;
}): TtsMetadata {
  return getProvider().getMetadata(normalizeTtsOptions(opts));
}
