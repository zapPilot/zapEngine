import { errorMessage } from '../lib/errorMessage.js';
import { insertSocialPost, toSocialPostInsertPayload } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import { composeSocialContent, type SocialComposeEpisode } from './compose.js';
import { platformVideoMode } from './platforms.js';
import type {
  GeneratedSocialCopy,
  PublishResult,
  SocialContentFeatures,
  SocialLanguageCode,
  SocialPlatform,
} from './types.js';
import { xTeaserDurationSeconds } from './video.js';

const QUESTION_PATTERN = /[?？]/u;
const NUMBER_PATTERN = /[0-9０-９]/u;

export interface SocialCopySnapshot {
  generated: GeneratedSocialCopy;
  published: GeneratedSocialCopy;
  model: string;
}

export interface PublishedSocialPost {
  platform: SocialPlatform;
  languageCode?: SocialLanguageCode;
  experimentKey?: string | null;
  experimentVariant?: string | null;
  result: PublishResult;
}

export function buildContentFeatures(input: {
  title: string | null;
  body: string;
  hashtags: readonly string[];
}): SocialContentFeatures {
  const visibleCopy = [input.title, input.body].filter(Boolean).join('\n');
  return {
    containsQuestion: QUESTION_PATTERN.test(visibleCopy),
    containsNumber: NUMBER_PATTERN.test(visibleCopy),
    titleChars: input.title === null ? null : Array.from(input.title).length,
    bodyChars: Array.from(input.body).length,
    hashtagCount: input.hashtags.length,
  };
}

export function buildSocialPostRecord(input: {
  episodeId: string;
  platform: SocialPlatform;
  languageCode?: SocialLanguageCode;
  experimentKey?: string | null;
  experimentVariant?: string | null;
  result: PublishResult;
  snapshot: SocialCopySnapshot;
  episode: SocialComposeEpisode;
  videoDurationSeconds: number;
  xVideoDurationSeconds?: number;
}): NewSocialPost {
  // Recorded through the same composition the publisher used, so telemetry
  // cannot describe a different post than the one that went out. `cta: 'omit'`
  // is what keeps the generated columns pre-branding.
  const generated = composeSocialContent(input.platform, {
    copy: input.snapshot.generated,
    episode: input.episode,
    cta: 'omit',
  });
  const published = composeSocialContent(input.platform, {
    copy: input.snapshot.published,
    episode: input.episode,
  });

  // `published` is what the publisher was asked to post; a platform that
  // accepted only some of it reports back what it kept, and that is what
  // telemetry has to store.
  const publishedHashtags = input.result.hashtags ?? published.hashtags;

  return {
    episodeId: input.episodeId,
    platform: input.platform,
    languageCode: input.languageCode ?? 'zh-Hant',
    experimentKey: input.experimentKey ?? null,
    experimentVariant: input.experimentVariant ?? null,
    postUrl: input.platform === 'rednote' ? null : (input.result.url ?? null),
    platformPostId:
      input.platform === 'rednote' ? null : (input.result.postId ?? null),
    publishedAt: input.result.publishedAt,
    topic: input.snapshot.published.topic,
    hookType: input.snapshot.published.hookType,
    generatedTitle: generated.title,
    publishedTitle: published.title,
    generatedBody: generated.body,
    publishedBody: published.body,
    hashtags: publishedHashtags,
    videoDurationSec: publishedVideoDuration(
      input.platform,
      input.videoDurationSeconds,
      input.xVideoDurationSeconds,
    ),
    contentFeatures: buildContentFeatures({
      title: published.title,
      body: published.body,
      hashtags: publishedHashtags,
    }),
    llmModel: input.snapshot.model,
  };
}

// The duration of the media actually delivered, which is not the same as the
// episode length: X publishes a teaser, and a recovery caller can report the
// exact teaser it produced.
function publishedVideoDuration(
  platform: SocialPlatform,
  videoDurationSeconds: number,
  xVideoDurationSeconds?: number,
): number {
  if (platformVideoMode(platform) === 'full') return videoDurationSeconds;
  const teaser = xTeaserDurationSeconds(videoDurationSeconds);
  return platform === 'x' ? (xVideoDurationSeconds ?? teaser) : teaser;
}

export function createSocialPostPersister(input: {
  episodeId: string;
  languageCode?: SocialLanguageCode;
  experimentByPlatform?: Partial<
    Record<
      SocialPlatform,
      { experimentKey: string | null; experimentVariant: string | null }
    >
  >;
  snapshot: SocialCopySnapshot;
  episode: SocialComposeEpisode;
  videoDurationSeconds: number;
  xVideoDurationSeconds?: number;
  insert?: (post: NewSocialPost) => Promise<SocialPostRow>;
  onError?: (message: string) => void;
}): (published: PublishedSocialPost) => Promise<void> {
  const insert = input.insert ?? insertSocialPost;
  const logError = input.onError ?? console.error;

  return async ({ platform, result }) => {
    const record = buildSocialPostRecord({
      episodeId: input.episodeId,
      platform,
      languageCode: input.languageCode,
      ...input.experimentByPlatform?.[platform],
      result,
      snapshot: input.snapshot,
      episode: input.episode,
      videoDurationSeconds: input.videoDurationSeconds,
      ...(input.xVideoDurationSeconds !== undefined
        ? { xVideoDurationSeconds: input.xVideoDurationSeconds }
        : {}),
    });

    try {
      await insert(record);
    } catch (error) {
      const detail = errorMessage(error);
      logError(
        `[${platform}] Post is live, but telemetry was not recorded: ${detail}\nManually insert this social_posts payload:\n${JSON.stringify(toSocialPostInsertPayload(record))}`,
      );
      throw error;
    }
  };
}
