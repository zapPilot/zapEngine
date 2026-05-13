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

interface TtsProviderModule {
  synthesize(text: string): Promise<Buffer>;
  getMetadata(): TtsMetadata;
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

export async function textToSpeech(text: string): Promise<Buffer> {
  return getProvider().synthesize(text);
}

export function getTtsMetadata(): TtsMetadata {
  return getProvider().getMetadata();
}
