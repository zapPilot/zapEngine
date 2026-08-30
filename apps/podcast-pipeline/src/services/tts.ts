import { type LanguageClassroomLanguageCode } from '../types.js';
import type { UsageCostLine } from './cost.js';
import { applyFishAudioPricing } from './tts-pricing.js';
import {
  getMetadata as getFishAudioMetadata,
  synthesize as synthesizeWithFishAudio,
} from './tts/fish-audio.js';
import { type FishAudioTtsConfig, getTtsConfig } from './tts/tts-config.js';

export type { FishAudioTtsConfig } from './tts/tts-config.js';

export interface TtsMetadata {
  languageCode: string;
  voiceName: string;
}

export interface TtsSynthesizeOptions {
  languageCode: LanguageClassroomLanguageCode;
  config: FishAudioTtsConfig;
  costLabel?: string;
}

export interface TtsSynthesisResult {
  audio: Buffer;
  cost: UsageCostLine[];
}

function normalizeTtsOptions(opts: {
  languageCode: LanguageClassroomLanguageCode;
  costLabel?: string;
}): TtsSynthesizeOptions {
  return {
    languageCode: opts.languageCode,
    config: getTtsConfig(),
    costLabel: opts.costLabel ?? 'TTS audio',
  };
}

export async function textToSpeech(
  text: string,
  opts: {
    languageCode: LanguageClassroomLanguageCode;
    costLabel?: string;
  },
): Promise<TtsSynthesisResult> {
  const result = await synthesizeWithFishAudio(text, normalizeTtsOptions(opts));
  return {
    ...result,
    cost: applyFishAudioPricing(result.cost),
  };
}

export function getTtsMetadata(opts: {
  languageCode: LanguageClassroomLanguageCode;
}): TtsMetadata {
  return getFishAudioMetadata(normalizeTtsOptions(opts));
}
