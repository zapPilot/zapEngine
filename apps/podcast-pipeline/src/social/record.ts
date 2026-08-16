import { insertSocialPost, toSocialPostInsertPayload } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import { applyPlatformCta, platformVideoMode } from './platforms.js';
import type {
  GeneratedSocialCopy,
  PublishResult,
  SocialContentFeatures,
  SocialPlatform,
  YouTubeMetadata,
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
  result: PublishResult;
  snapshot: SocialCopySnapshot;
  videoDurationSeconds: number;
  xVideoDurationSeconds?: number;
  youtubeMetadata?: YouTubeMetadata;
}): NewSocialPost {
  const projection = projectPlatformCopy(
    input.platform,
    input.snapshot,
    input.videoDurationSeconds,
    input.xVideoDurationSeconds,
    input.youtubeMetadata,
  );

  return {
    episodeId: input.episodeId,
    platform: input.platform,
    postUrl: input.platform === 'rednote' ? null : (input.result.url ?? null),
    platformPostId:
      input.platform === 'rednote' ? null : (input.result.postId ?? null),
    publishedAt: input.result.publishedAt,
    topic: input.snapshot.published.topic,
    hookType: input.snapshot.published.hookType,
    generatedTitle: projection.generatedTitle,
    publishedTitle: projection.publishedTitle,
    generatedBody: projection.generatedBody,
    publishedBody: projection.publishedBody,
    hashtags: projection.hashtags,
    videoDurationSec: projection.videoDurationSec,
    contentFeatures: buildContentFeatures({
      title: projection.publishedTitle,
      body: projection.publishedBody,
      hashtags: projection.hashtags,
    }),
    llmModel: input.snapshot.model,
  };
}

export function createSocialPostPersister(input: {
  episodeId: string;
  snapshot: SocialCopySnapshot;
  videoDurationSeconds: number;
  xVideoDurationSeconds?: number;
  youtubeMetadata?: YouTubeMetadata;
  insert?: (post: NewSocialPost) => Promise<SocialPostRow>;
  onError?: (message: string) => void;
}): (published: PublishedSocialPost) => Promise<void> {
  const insert = input.insert ?? insertSocialPost;
  const logError = input.onError ?? console.error;

  return async ({ platform, result }) => {
    const record = buildSocialPostRecord({
      episodeId: input.episodeId,
      platform,
      result,
      snapshot: input.snapshot,
      videoDurationSeconds: input.videoDurationSeconds,
      ...(input.xVideoDurationSeconds !== undefined
        ? { xVideoDurationSeconds: input.xVideoDurationSeconds }
        : {}),
      ...(input.youtubeMetadata
        ? { youtubeMetadata: input.youtubeMetadata }
        : {}),
    });

    try {
      await insert(record);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logError(
        `[${platform}] Post is live, but telemetry was not recorded: ${detail}\nManually insert this social_posts payload:\n${JSON.stringify(toSocialPostInsertPayload(record))}`,
      );
      throw error;
    }
  };
}

function projectPlatformCopy(
  platform: SocialPlatform,
  snapshot: SocialCopySnapshot,
  videoDurationSeconds: number,
  xVideoDurationSeconds?: number,
  youtubeMetadata?: YouTubeMetadata,
) {
  if (platform === 'rednote') {
    return {
      generatedTitle: snapshot.generated.rednote.title,
      publishedTitle: snapshot.published.rednote.title,
      generatedBody: snapshot.generated.rednote.body,
      publishedBody: applyPlatformCta(
        'rednote',
        snapshot.published.rednote.body,
      ),
      hashtags: [...snapshot.published.rednote.hashtags],
      videoDurationSec: videoDurationSeconds,
    };
  }

  if (platform === 'youtube') {
    if (!youtubeMetadata) {
      throw new Error('YouTube telemetry requires published metadata.');
    }
    return {
      generatedTitle: youtubeMetadata.title,
      publishedTitle: youtubeMetadata.title,
      generatedBody: youtubeMetadata.description,
      publishedBody: youtubeMetadata.description,
      hashtags: [],
      videoDurationSec: videoDurationSeconds,
    };
  }

  const teaserDuration = xTeaserDurationSeconds(videoDurationSeconds);
  let publishedVideoDuration = teaserDuration;
  if (platformVideoMode(platform) === 'full') {
    publishedVideoDuration = videoDurationSeconds;
  } else if (platform === 'x') {
    publishedVideoDuration = xVideoDurationSeconds ?? teaserDuration;
  }

  return {
    generatedTitle: null,
    publishedTitle: null,
    generatedBody: snapshot.generated.x.text,
    publishedBody: applyPlatformCta(platform, snapshot.published.x.text),
    hashtags: [],
    videoDurationSec: publishedVideoDuration,
  };
}
