import type { EpisodeVideoProgressStage } from './services/video-progress.js';

export type ImageCandidateOrigin =
  | 'openGraph'
  | 'article'
  | 'figure'
  | 'pexels'
  | 'pixabay'
  | 'bing';

export interface ImageCandidate {
  imageUrl: string;
  sourceUrl: string;
  origin: ImageCandidateOrigin;
  altText?: string;
  width?: number;
  height?: number;
  photographer?: string;
  photographerUrl?: string;
}

export interface Article {
  title: string;
  text: string;
  images?: ImageCandidate[];
}

export const DEFAULT_LANGUAGE_CODE = 'zh-Hant';
export const LEGACY_LANGUAGE_ALIASES = {
  'zh-TW': DEFAULT_LANGUAGE_CODE,
} as const;
export const SUPPORTED_PRIMARY_LANGUAGE_CODES = [
  DEFAULT_LANGUAGE_CODE,
  'ja',
  'en',
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

interface EpisodeLocalizationProjection {
  language_code: string;
  title: string;
  hls_url: string;
  classroom_hls_url: string | null;
  script: string | null;
  llm_model: string | null;
  llm_thinking_model: string | null;
  llm_provider: string | null;
  status: EpisodeStatus;
  created_at: string;
}

export interface EpisodeLocalizationRow extends EpisodeLocalizationProjection {
  id: string;
  episode_id: string;
  raw_text: string | null;
  tts_language_code: string | null;
  tts_voice_name: string | null;
  r2_prefix: string | null;
  classroom_r2_prefix: string | null;
  updated_at: string;
}

export interface EpisodeListRow extends EpisodeLocalizationProjection {
  id: string;
  episode_id: string;
  localization_id: string;
  listened: boolean;
  like_count: number;
  language_classrooms: LanguageClassroomLesson[];
}

// The feed never serves the full script or classroom lessons: episode detail
// refetches them, and 31 rows of TOASTed text per page was enough to push the
// view past PostgREST's statement timeout. like_count is unreferenced too,
// which lets Postgres drop the view's likes aggregate join entirely.
export type EpisodeFeedRow = Omit<
  EpisodeListRow,
  'script' | 'language_classrooms' | 'like_count'
>;

export interface EpisodeAudioTrackResponse {
  languageCode: string;
  title: string;
  hlsUrl: string;
  classroomHlsUrl: string | null;
}

export interface EpisodeVideoResponse {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

export type EpisodeVideoGenerationPublicStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface EpisodeVideoGenerationSummary {
  status: EpisodeVideoGenerationPublicStatus;
  updatedAt: string | null;
  /**
   * 0-100. Capped at 99 unless `status` is `completed`, so the client never shows
   * a finished bar over an unfinished video.
   */
  progressPercent: number;
  /**
   * What the pipeline is doing right now, or null when nothing is in flight
   * (idle queue, completed, failed). The client uses this — not `status` — to
   * decide between a determinate bar and an indeterminate spinner.
   *
   * Stages never go in `status`: the app rejects an unknown status value by
   * discarding the whole summary.
   */
  stage: EpisodeVideoProgressStage | null;
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
  audioTracks: EpisodeAudioTrackResponse[];
  createdAt: string;
  listened: boolean;
  script: string | null;
  llmModel: string | null;
  llmThinkingModel: string | null;
  llmProvider: string | null;
  status: EpisodeStatus;
  video: EpisodeVideoResponse | null;
  videoGeneration: EpisodeVideoGenerationSummary | null;
  languageClassrooms: LanguageClassroomLesson[];
}

export type EpisodeFeedResponse = Omit<
  EpisodeResponse,
  'script' | 'languageClassrooms'
>;

export type EpisodeSearchMatchSource = 'title' | 'script';

export interface EpisodeSearchResult {
  episode: EpisodeResponse;
  matchSource: EpisodeSearchMatchSource;
  snippet: string | null;
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
  classroomHlsUrl?: string | null;
  classroomR2Prefix?: string | null;
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
