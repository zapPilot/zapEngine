export type FishAudioEngine = 's2-pro' | 's1' | 's2.1-pro-free' | (string & {});

export interface FishAudioTtsConfig {
  modelId: string;
  engine: FishAudioEngine;
}

const DEFAULT_FISH_AUDIO_ENGINE: FishAudioEngine = 's2-pro';

function getFishAudioReferenceId(): string {
  const referenceId = process.env['FISH_AUDIO_REFERENCE_ID']?.trim();
  if (!referenceId) {
    throw new Error('FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS');
  }
  return referenceId;
}

function getFishAudioEngine(): FishAudioEngine {
  return process.env['FISH_AUDIO_ENGINE']?.trim() || DEFAULT_FISH_AUDIO_ENGINE;
}

export function getTtsConfig(): FishAudioTtsConfig {
  return {
    modelId: getFishAudioReferenceId(),
    engine: getFishAudioEngine(),
  };
}
