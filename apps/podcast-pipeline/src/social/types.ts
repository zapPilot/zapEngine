export type SocialPlatform = 'x' | 'rednote';
export type SocialLanguage = 'zh';

export interface SocialEpisode {
  id: string;
  title: string;
  description?: string;
  summary: string;
  transcript: string;
  publishedAt: string;
  episodeUrl: string;
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
  videoPath: string;
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

export interface BrowserPublisher {
  publishX(input: XPublishInput): Promise<PublishResult>;
  publishRednote(input: RednotePublishInput): Promise<PublishResult>;
}

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
  Partial<Record<SocialLanguage, LanguagePublishState>>
>;
