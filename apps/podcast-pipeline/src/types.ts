export interface Article {
  title: string;
  text: string;
}

export const DEFAULT_LANGUAGE_CODE = 'zh-Hant';
export const LEGACY_LANGUAGE_ALIASES = {
  'zh-TW': DEFAULT_LANGUAGE_CODE,
} as const;
export const SUPPORTED_PRIMARY_LANGUAGE_CODES = [
  DEFAULT_LANGUAGE_CODE,
] as const;
export const LANGUAGE_CLASSROOM_LANGUAGE_CODES = [
  DEFAULT_LANGUAGE_CODE,
  'ja',
  'en',
] as const;

export type LanguageClassroomLanguageCode =
  (typeof LANGUAGE_CLASSROOM_LANGUAGE_CODES)[number];

export type EpisodeStatus =
  | 'pending'
  | 'scraped'
  | 'script_generated'
  | 'audio_generated'
  | 'completed';

export interface EpisodeRow {
  id: string;
  source_url: string;
  source_title: string | null;
  created_at: string;
  listened: boolean;
}

export interface EpisodeLocalizationRow {
  id: string;
  episode_id: string;
  language_code: string;
  title: string;
  hls_url: string;
  raw_text: string | null;
  script: string | null;
  llm_model: string | null;
  llm_thinking_model: string | null;
  llm_provider: string | null;
  tts_language_code: string | null;
  tts_voice_name: string | null;
  r2_prefix: string | null;
  status: EpisodeStatus;
  created_at: string;
  updated_at: string;
}

export interface EpisodeListRow {
  id: string;
  episode_id: string;
  localization_id: string;
  title: string;
  language_code: string;
  hls_url: string;
  script: string | null;
  llm_model: string | null;
  llm_thinking_model: string | null;
  llm_provider: string | null;
  status: EpisodeStatus;
  created_at: string;
  listened: boolean;
  like_count: number;
  language_classrooms: unknown;
}

export interface LanguageClassroomKeyword {
  term: string;
  reading: string | null;
  meaning: string;
  note: string | null;
}

export interface LanguageClassroomLesson {
  sourceLanguageCode: string;
  targetLanguageCode: string;
  oneLiner: string;
  keywords: LanguageClassroomKeyword[];
}

export interface LanguageClassroomRow {
  id: string;
  episode_localization_id: string;
  source_language_code: string;
  target_language_code: string;
  one_liner: string;
  keywords: LanguageClassroomKeyword[];
  llm_model: string | null;
  llm_thinking_model: string | null;
  llm_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpisodeResponse {
  id: string;
  localizationId: string;
  title: string;
  languageCode: string;
  hlsUrl: string;
  createdAt: string;
  listened: boolean;
  script: string | null;
  llmModel: string | null;
  llmThinkingModel: string | null;
  llmProvider: string | null;
  status: EpisodeStatus;
  languageClassrooms: LanguageClassroomLesson[];
}

export interface NewEpisode {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface NewEpisodeLocalization {
  id: string;
  episodeId: string;
  languageCode: string;
  title: string;
  hlsUrl: string;
  rawText: string;
  script: string;
  llmModel: string;
  llmThinkingModel: string | null;
  llmProvider: string;
  ttsLanguageCode: string | null;
  ttsVoiceName: string | null;
  r2Prefix: string | null;
  status: EpisodeStatus;
}

export interface NewLanguageClassroom {
  id: string;
  episodeLocalizationId: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  oneLiner: string;
  keywords: LanguageClassroomKeyword[];
  llmModel: string;
  llmThinkingModel: string | null;
  llmProvider: string;
}
