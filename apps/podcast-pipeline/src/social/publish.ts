import {
  getPublishedPlatform,
  markPlatformPublished,
  readPublishState,
} from './state.js';
import type {
  BrowserPublisher,
  GeneratedSocialCopy,
  SocialLanguage,
  SocialPlatform,
} from './types.js';

export interface PublishPlatformOutcome {
  platform: SocialPlatform;
  status: 'published' | 'skipped' | 'failed';
  url?: string;
  error?: Error;
}

export async function publishSocialPlatforms(input: {
  episodeId: string;
  language: SocialLanguage;
  platforms: SocialPlatform[];
  force: boolean;
  copy: GeneratedSocialCopy;
  videoPath: string;
  publisher: BrowserPublisher;
  statePath?: string;
  onLog?: (message: string) => void;
}): Promise<PublishPlatformOutcome[]> {
  const log = input.onLog ?? (() => undefined);
  const outcomes: PublishPlatformOutcome[] = [];

  for (const platform of input.platforms) {
    const state = await readPublishState(input.statePath);
    const existing = getPublishedPlatform(
      state,
      input.episodeId,
      input.language,
      platform,
    );
    if (existing && !input.force) {
      log(`[${platform}] already published — skipping.`);
      outcomes.push({ platform, status: 'skipped', url: existing.url });
      continue;
    }

    try {
      const result =
        platform === 'x'
          ? await input.publisher.publishX({
              text: input.copy.x.text,
              videoPath: input.videoPath,
            })
          : await input.publisher.publishRednote({
              title: input.copy.rednote.title,
              body: input.copy.rednote.body,
              hashtags: input.copy.rednote.hashtags,
              videoPath: input.videoPath,
            });

      await markPlatformPublished({
        episodeId: input.episodeId,
        language: input.language,
        platform,
        result: {
          published: true,
          publishedAt: result.publishedAt,
          ...(result.url ? { url: result.url } : {}),
        },
        path: input.statePath,
      });
      log(`[${platform}] ✓ ${result.url ?? 'Published'}`);
      outcomes.push({
        platform,
        status: 'published',
        ...(result.url ? { url: result.url } : {}),
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      log(`[${platform}] ✗ ${normalized.message}`);
      outcomes.push({ platform, status: 'failed', error: normalized });
    }
  }

  return outcomes;
}
