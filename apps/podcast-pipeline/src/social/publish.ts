import { toError } from '../lib/errorMessage.js';
import type { PublishedSocialPost } from './record.js';
import {
  getPublishedPlatform,
  markPlatformPublished,
  readPublishState,
} from './state.js';
import type {
  PublishResult,
  SocialPlatform,
  SocialPublishJob,
} from './types.js';

export interface PublishPlatformOutcome {
  platform: SocialPlatform;
  status: 'published' | 'skipped' | 'failed';
  url?: string;
  error?: Error;
  stateError?: Error;
  recordError?: Error;
}

export async function publishSocialPlatforms(input: {
  episodeId: string;
  jobs: readonly SocialPublishJob[];
  force: boolean;
  statePath?: string;
  persistPublished?: (published: PublishedSocialPost) => Promise<void>;
  onLog?: (message: string) => void;
}): Promise<PublishPlatformOutcome[]> {
  const log = input.onLog ?? (() => void 0);
  const outcomes: PublishPlatformOutcome[] = [];

  for (const job of input.jobs) {
    const platform = job.platform;
    const state = await readPublishState(input.statePath);
    const existing = getPublishedPlatform(state, input.episodeId, platform);
    if (existing && !input.force) {
      log(`[${platform}] already published — skipping.`);
      outcomes.push({
        platform,
        status: 'skipped',
        ...(existing.url ? { url: existing.url } : {}),
      });
      continue;
    }

    let result: PublishResult;
    try {
      result = await job.publish();
    } catch (error) {
      const normalized = toError(error);
      log(`[${platform}] ✗ ${normalized.message}`);
      outcomes.push({ platform, status: 'failed', error: normalized });
      continue;
    }

    const stateError = await savePublishedState({
      save: () =>
        markPlatformPublished({
          episodeId: input.episodeId,
          platform,
          result: {
            published: true,
            publishedAt: result.publishedAt,
            ...(result.url ? { url: result.url } : {}),
          },
          path: input.statePath,
        }),
      platform,
      log,
    });

    const recordError = await persistPublishedPost({
      persistPublished: input.persistPublished,
      published: { platform, result },
      log,
    });

    log(`[${platform}] ✓ ${result.url ?? 'Published'}`);
    outcomes.push({
      platform,
      status: 'published',
      ...(result.url ? { url: result.url } : {}),
      ...(stateError ? { stateError } : {}),
      ...(recordError ? { recordError } : {}),
    });
  }

  return outcomes;
}

async function savePublishedState(input: {
  save: () => Promise<void>;
  platform: SocialPlatform;
  log: (message: string) => void;
}): Promise<Error | undefined> {
  try {
    await input.save();
    return undefined;
  } catch (error) {
    const normalized = toError(error);
    input.log(
      `[${input.platform}] ⚠ Published remotely, but local duplicate state was not saved: ${normalized.message}`,
    );
    return normalized;
  }
}

async function persistPublishedPost(input: {
  persistPublished:
    | ((published: PublishedSocialPost) => Promise<void>)
    | undefined;
  published: PublishedSocialPost;
  log: (message: string) => void;
}): Promise<Error | undefined> {
  if (!input.persistPublished) return undefined;

  try {
    await input.persistPublished(input.published);
    return undefined;
  } catch (error) {
    const normalized = toError(error);
    input.log(
      `[${input.published.platform}] ⚠ Published remotely, but telemetry recording failed: ${normalized.message}`,
    );
    return normalized;
  }
}
