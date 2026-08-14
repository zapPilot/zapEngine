export type SocialPlatform = 'x' | 'rednote';

/**
 * Publishing is canonical-Chinese only. The key stays in the on-disk state so
 * existing published records keep matching and are not re-posted.
 */
export const SOCIAL_STATE_LANGUAGE_KEY = 'zh';

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
  hook: string;
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
  episodeUrl: string;
}

export interface RednotePublishInput {
  title: string;
  body: string;
  hashtags: string[];
  videoPath: string;
}

export interface PublishResult {
  status: 'published';
  url?: string;
  publishedAt: string;
}

// X and Rednote are driven by different automation stacks (OpenCLI adapter vs
// Playwright), so each side is its own interface and the CLI composes them.
export interface XPublisher {
  publishX(input: XPublishInput): Promise<PublishResult>;
}

export interface RednotePublisher {
  publishRednote(input: RednotePublishInput): Promise<PublishResult>;
}

export type BrowserPublisher = XPublisher & RednotePublisher;

export interface PlatformPublishState {
  published: true;
  publishedAt: string;
  url?: string;
}

export interface LanguagePublishState {
  x?: PlatformPublishState;
  rednote?: PlatformPublishState;
}

export type SocialPublishState = Record<
  string,
  Partial<Record<typeof SOCIAL_STATE_LANGUAGE_KEY, LanguagePublishState>>
>;
