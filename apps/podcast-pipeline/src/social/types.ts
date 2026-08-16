import type { SocialPlatform } from './platforms.js';

export type { SocialPlatform } from './platforms.js';

/**
 * Publishing is canonical-Chinese only. The key stays in the on-disk state so
 * existing published records keep matching and are not re-posted.
 */
export const SOCIAL_STATE_LANGUAGE_KEY = 'zh';

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

export interface SocialContentFeatures {
  containsQuestion: boolean;
  containsNumber: boolean;
  titleChars: number | null;
  bodyChars: number;
  hashtagCount: number;
}

export interface SocialEpisode {
  id: string;
  title: string;
  description?: string;
  summary: string;
  transcript: string;
  publishedAt: string;
  episodeUrl: string;
  videoDurationSeconds: number;
  videos: {
    zh?: string;
    ja?: string;
    en?: string;
  };
}

export interface GeneratedSocialCopy {
  topic: SocialTopic;
  hookType: SocialHookType;
  x: {
    text: string;
  };
  rednote: {
    title: string;
    body: string;
    hashtags: string[];
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
  title: string;
  body: string;
  hashtags: string[];
  videoPath: string;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
}

export interface YouTubePublishInput extends YouTubeMetadata {
  videoPath: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export interface PublishResult {
  status: 'published';
  url?: string;
  postId?: string;
  publishedAt: string;
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
  Partial<Record<typeof SOCIAL_STATE_LANGUAGE_KEY, LanguagePublishState>>
>;
