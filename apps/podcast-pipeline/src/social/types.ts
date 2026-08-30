import type { PrimaryLanguageCode } from '../types.js';
import type { SocialPlatform } from './platforms.js';

export type { SocialPlatform } from './platforms.js';

/**
 * Publishing is canonical-Chinese only. The key stays in the on-disk state so
 * existing published records keep matching and are not re-posted.
 */
export const SOCIAL_STATE_LANGUAGE_KEY = 'zh';
export const SOCIAL_STATE_LANGUAGE_KEYS = {
  'zh-Hant': SOCIAL_STATE_LANGUAGE_KEY,
  ja: 'ja',
  en: 'en',
} as const satisfies Record<PrimaryLanguageCode, string>;
export type SocialLanguageCode = PrimaryLanguageCode;

export const SOCIAL_TOPICS = [
  'macro',
  'btc',
  'eth',
  'defi',
  'stablecoin',
  'traditional_finance',
  'portfolio',
  'market_event',
  'technology',
] as const;

export type SocialTopic = (typeof SOCIAL_TOPICS)[number];

export const SOCIAL_HOOK_TYPES = [
  'question',
  'contrarian',
  'surprising_number',
  'breaking_event',
  'explainer',
  'prediction',
  'risk_warning',
  'comparison',
] as const;

export type SocialHookType = (typeof SOCIAL_HOOK_TYPES)[number];

/**
 * Platform review state, observed after publishing rather than at publish time.
 * Rednote is the only platform that reports one today, and it removes a rejected
 * note silently — so anything other than `visible` means the post was
 * suppressed, not unpopular.
 */
export type SocialReviewStatus =
  | 'visible'
  | 'under_review'
  | 'rejected'
  | 'self_only';

export interface SocialContentFeatures {
  containsQuestion: boolean;
  containsNumber: boolean;
  titleChars: number | null;
  bodyChars: number;
  hashtagCount: number;
  /** True when a missing telemetry row was reconstructed from the live platform. */
  telemetryRecovered?: boolean;
  /** Optional immutable technical media score produced by render inspection. */
  mediaQuality?: {
    score: number;
  };
  packagingExperiment?: { key: string; variant: string };
}

export interface SocialEpisode {
  id: string;
  languageCode: SocialLanguageCode;
  title: string;
  description?: string;
  summary: string;
  transcript: string;
  publishedAt: string;
  episodeUrl: string;
  videoDurationSeconds: number;
  videoUrl: string;
}

export interface GeneratedSocialCopy {
  topic: SocialTopic;
  x?: {
    hookType: SocialHookType;
    text: string;
  };
  threads?: {
    hookType: SocialHookType;
    text: string;
  };
  rednote?: {
    hookType: SocialHookType;
    title: string;
    body: string;
    hashtags: string[];
  };
  youtube?: {
    hookType: SocialHookType;
    title: string;
  };
}

export interface XPublishInput {
  text: string;
  videoPath: string;
}

export interface ThreadsPublishInput {
  text: string;
  videoUrl: string;
}

export interface RednotePublishInput {
  /** Rednote's own title field, filled last -- see `rednote-playwright.ts`. */
  title: string;
  hashtags: string[];
  videoPath: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
}

export const YOUTUBE_PRIVACY_STATUSES = [
  'private',
  'unlisted',
  'public',
] as const;

export type YouTubePrivacyStatus = (typeof YOUTUBE_PRIVACY_STATUSES)[number];

export interface YouTubePublishInput extends YouTubeMetadata {
  videoPath: string;
  languageCode?: SocialLanguageCode;
  privacyStatus: YouTubePrivacyStatus;
}

export interface PublishResult {
  status: 'published';
  url?: string;
  postId?: string;
  publishedAt: string;
  /**
   * What the platform actually accepted, when that can differ from what was
   * composed. Rednote is the only case today: a generated hashtag with no
   * matching topic is skipped rather than typed in as literal text, so telemetry
   * has to record the topics the note really carries -- otherwise the strategy
   * learner credits a tag that was never on it.
   */
  hashtags?: string[];
  /**
   * What the platform actually received as its prose body, when that differs
   * from what was composed. Rednote is the only case today: its note carries
   * no prose body at all, so `record.ts` has no other way to learn that and
   * would otherwise store the composed (never-sent) draft as if it published.
   */
  body?: string;
}

export interface XPublisher {
  publishX(input: XPublishInput): Promise<PublishResult>;
}

export interface ThreadsPublisher {
  publishThreads(input: ThreadsPublishInput): Promise<PublishResult>;
}

export interface RednotePublisher {
  publishRednote(input: RednotePublishInput): Promise<PublishResult>;
}

export interface YouTubePublisher {
  publishYouTube(input: YouTubePublishInput): Promise<PublishResult>;
}

export interface SocialPublishJob {
  platform: SocialPlatform;
  publish(): Promise<PublishResult>;
}

export interface PlatformPublishState {
  published: true;
  publishedAt: string;
  url?: string;
}

export type LanguagePublishState = Partial<
  Record<SocialPlatform, PlatformPublishState>
>;

export type SocialPublishState = Record<
  string,
  Partial<
    Record<
      (typeof SOCIAL_STATE_LANGUAGE_KEYS)[SocialLanguageCode],
      LanguagePublishState
    >
  >
>;
