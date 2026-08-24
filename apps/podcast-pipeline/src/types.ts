import type { EpisodeVideoProgressStage } from './services/video-progress.js';
import type {
  SocialContentFeatures,
  SocialHookType,
  SocialPlatform,
  SocialReviewStatus,
  SocialTopic,
} from './social/types.js';

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
export type PrimaryLanguageCode =
  (typeof SUPPORTED_PRIMARY_LANGUAGE_CODES)[number];
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
  script_body?: string | null;
  packaging_version?: string | null;
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
  like_count: number;
  language_classrooms: LanguageClassroomLesson[];
}

export type PublishedEpisodeCatalog = Record<
  (typeof SUPPORTED_PRIMARY_LANGUAGE_CODES)[number],
  string[]
>;

// The feed never serves the full script or classroom lessons: episode detail
// refetches them, and 31 rows of TOASTed text per page was enough to push the
// view past PostgREST's statement timeout. like_count is unreferenced too,
// which lets Postgres drop the view's likes aggregate join entirely.
export type EpisodeFeedRow = Omit<
  EpisodeListRow,
  'script' | 'language_classrooms' | 'like_count'
>;

export interface EpisodeClassroomTrackResponse {
  languageCode: string;
  hlsUrl: string;
}

export interface EpisodeAudioTrackResponse {
  languageCode: string;
  title: string;
  hlsUrl: string;
  classroomHlsUrl: string | null;
  classrooms: EpisodeClassroomTrackResponse[];
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

/** A generated lesson before persistence, carrying the 100%-target-language TTS narration. */
export type LanguageClassroomLessonDraft = LanguageClassroomLesson & {
  script: string;
};

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
  script: string | null;
  hls_url: string | null;
  r2_prefix: string | null;
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
  scriptBody?: string | null;
  packagingVersion?: string | null;
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
  script: string;
}

export interface SocialPostRow {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code?: PrimaryLanguageCode;
  experiment_key?: string | null;
  experiment_variant?: string | null;
  post_url: string | null;
  platform_post_id: string | null;
  published_at: string;
  topic: SocialTopic;
  hook_type: SocialHookType;
  generated_title: string | null;
  published_title: string | null;
  generated_body: string;
  published_body: string;
  hashtags: string[];
  video_duration_sec: number | null;
  content_features: SocialContentFeatures;
  llm_model: string | null;
  review_status: SocialReviewStatus | null;
  created_at: string;
  updated_at: string;
}

export interface SocialDistributionMetadata {
  languageCode?: PrimaryLanguageCode;
  experimentKey?: string | null;
  experimentVariant?: string | null;
}

export interface NewSocialPost extends SocialDistributionMetadata {
  episodeId: string;
  platform: SocialPlatform;
  postUrl: string | null;
  platformPostId: string | null;
  publishedAt: string;
  topic: SocialTopic;
  hookType: SocialHookType;
  generatedTitle: string | null;
  publishedTitle: string | null;
  generatedBody: string;
  publishedBody: string;
  hashtags: string[];
  videoDurationSec: number | null;
  contentFeatures: SocialContentFeatures;
  llmModel: string | null;
}

export interface SocialAccountSnapshotRow {
  id: string;
  platform: SocialPlatform;
  captured_at: string;
  followers: number;
  /** Provenance of a scraped number, e.g. the label text it was read from. */
  details: Record<string, string>;
}

export interface NewSocialAccountSnapshot {
  platform: SocialPlatform;
  followers: number;
  details?: Record<string, string>;
}

export interface SocialAudienceDemographics {
  gender?: Record<string, number>;
  age?: Record<string, number>;
}

export interface SocialPostMetricDetails {
  engagedViews?: number;
  coverCtr?: number;
  fiveSecondRetentionRate?: number;
  averageViewDurationSec?: number;
  averageViewPercentage?: number;
  audienceDemographics?: SocialAudienceDemographics;
  platformMetrics?: Record<string, number | string | boolean | null>;
}

export interface SocialPostMetricRow {
  id: string;
  social_post_id: string;
  captured_at: string;
  age_hours: number;
  measurement_window?: '1h' | '6h' | '24h' | '72h' | '7d' | null;
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profile_visits: number | null;
  followers_gained: number | null;
  details: SocialPostMetricDetails;
  created_at: string;
}

// jscpd:ignore-start — the same metric columns in the app's camelCase naming.
// Both spellings are load-bearing: the row type pins the DDL column list in
// socialPostsMigration.test.ts, and the insert type follows the camelCase
// `New*` convention every other writer in db.ts uses. Factoring out the fields
// whose two spellings happen to match would split one table across two
// declarations for no reader's benefit.
export interface NewSocialPostMetric {
  socialPostId: string;
  capturedAt: string;
  ageHours: number;
  measurementWindow?: '1h' | '6h' | '24h' | '72h' | '7d';
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profileVisits: number | null;
  followersGained: number | null;
  details?: SocialPostMetricDetails;
}
// jscpd:ignore-end
