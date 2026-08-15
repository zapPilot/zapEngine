import { insertSocialPost, toSocialPostInsertPayload } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import type {
  GeneratedSocialCopy,
  PublishResult,
  SocialContentFeatures,
  SocialPlatform,
} from './types.js';

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
}): NewSocialPost {
  const projection = projectPlatformCopy(
    input.platform,
    input.snapshot,
    input.videoDurationSeconds,
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
    contentFeatures: {
      ...buildContentFeatures({
        title: projection.publishedTitle,
        body: projection.publishedBody,
        hashtags: projection.hashtags,
      }),
    },
    llmModel: input.snapshot.model,
  };
}

export function createSocialPostPersister(input: {
  episodeId: string;
  snapshot: SocialCopySnapshot;
  videoDurationSeconds: number;
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
) {
  if (platform === 'rednote') {
    return {
      generatedTitle: snapshot.generated.rednote.title,
      publishedTitle: snapshot.published.rednote.title,
      generatedBody: snapshot.generated.rednote.body,
      publishedBody: snapshot.published.rednote.body,
      hashtags: [...snapshot.published.rednote.hashtags],
      videoDurationSec: videoDurationSeconds,
    };
  }

  return {
    generatedTitle: null,
    publishedTitle: null,
    generatedBody: snapshot.generated.x.text,
    publishedBody: snapshot.published.x.text,
    hashtags: [],
    videoDurationSec: null,
  };
}
