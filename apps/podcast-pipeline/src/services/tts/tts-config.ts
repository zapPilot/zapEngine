export interface FishAudioTtsConfig {
  modelId: string;
  engine: string;
}

const DEFAULT_FISH_AUDIO_ENGINE = 's2.1-pro-free';

/**
 * Japanese narration uses someone else's voice; zh-Hant/en keep the owner's
 * voice from FISH_AUDIO_REFERENCE_ID. An explicit FISH_AUDIO_REFERENCE_ID_JA
 * overrides the code-owned Japanese default without touching other languages.
 */
export const JAPANESE_FISH_AUDIO_REFERENCE_ID =
  '63bc41e652214372b15d9416a30a60b4';

function getFishAudioReferenceId(): string {
  const referenceId = process.env['FISH_AUDIO_REFERENCE_ID']?.trim();
  if (!referenceId) {
    throw new Error('FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS');
  }
  return referenceId;
}

function getJapaneseFishAudioReferenceId(): string {
  const override = process.env['FISH_AUDIO_REFERENCE_ID_JA'];
  if (override !== undefined) {
    const trimmed = override.trim();
    if (!trimmed) {
      throw new Error(
        'FISH_AUDIO_REFERENCE_ID_JA is required for Japanese Fish Audio TTS when set',
      );
    }
    return trimmed;
  }
  return JAPANESE_FISH_AUDIO_REFERENCE_ID;
}

export function getFishAudioReferenceIdForLanguage(
  languageCode?: string,
): string {
  if (languageCode === 'ja') {
    return getJapaneseFishAudioReferenceId();
  }
  return getFishAudioReferenceId();
}

export function resolveFishAudioEngine(value?: string): string {
  const engine = value?.trim() || DEFAULT_FISH_AUDIO_ENGINE;
  if (!engine.endsWith('free'))
    throw new Error(
      `Fish Audio only allows free engines; rejected ${engine}. Use FISH_AUDIO_ENGINE=${DEFAULT_FISH_AUDIO_ENGINE}`,
    );
  return engine;
}

export function getTtsConfig(languageCode?: string): FishAudioTtsConfig {
  return {
    modelId: getFishAudioReferenceIdForLanguage(languageCode),
    engine: resolveFishAudioEngine(process.env['FISH_AUDIO_ENGINE']),
  };
}
