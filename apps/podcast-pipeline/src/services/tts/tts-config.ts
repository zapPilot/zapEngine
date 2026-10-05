export interface FishAudioTtsConfig {
  modelId: string;
  engine: string;
}

const DEFAULT_FISH_AUDIO_ENGINE = 's2.1-pro-free';

function getFishAudioReferenceId(): string {
  const referenceId = process.env['FISH_AUDIO_REFERENCE_ID']?.trim();
  if (!referenceId) {
    throw new Error('FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS');
  }
  return referenceId;
}

export function resolveFishAudioEngine(value?: string): string {
  const engine = value?.trim() || DEFAULT_FISH_AUDIO_ENGINE;
  if (!engine.endsWith('free'))
    throw new Error(
      `Fish Audio only allows free engines; rejected ${engine}. Use FISH_AUDIO_ENGINE=${DEFAULT_FISH_AUDIO_ENGINE}`,
    );
  return engine;
}

export function getTtsConfig(): FishAudioTtsConfig {
  return {
    modelId: getFishAudioReferenceId(),
    engine: resolveFishAudioEngine(process.env['FISH_AUDIO_ENGINE']),
  };
}
