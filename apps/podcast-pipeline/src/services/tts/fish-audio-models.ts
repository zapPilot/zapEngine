import type { LanguageClassroomLanguageCode } from '../../types.js';

interface FishAudioModelConfig {
  modelId: string;
  engine: 's2-pro' | 'speech-1.6' | 'speech-1.5';
}

const ZH_HANT_MODEL_ID = 'debb4c1065114ffda03f3a60abdcc421';

export const FISH_AUDIO_MODELS: Record<
  LanguageClassroomLanguageCode,
  FishAudioModelConfig
> = {
  'zh-Hant': { modelId: ZH_HANT_MODEL_ID, engine: 's2-pro' },
  ja: { modelId: ZH_HANT_MODEL_ID, engine: 's2-pro' },
  en: { modelId: ZH_HANT_MODEL_ID, engine: 's2-pro' },
};
