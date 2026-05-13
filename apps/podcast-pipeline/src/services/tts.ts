import * as fishAudio from './tts/fish-audio.js';
import * as google from './tts/google.js';

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
      return fishAudio;
    case 'google':
      return google;
  }
}

export async function textToSpeech(text: string): Promise<Buffer> {
  return getProvider().synthesize(text);
}

export function getTtsMetadata(): TtsMetadata {
  return getProvider().getMetadata();
}
