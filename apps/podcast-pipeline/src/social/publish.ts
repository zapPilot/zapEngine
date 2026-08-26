import { toError } from '../lib/errorMessage.js';
import { SocialReleaseFailureError } from './publish-error.js';
import type { PublishedSocialPost } from './record.js';
import {
  getPublishedPlatform,
  markPlatformPublished,
  readPublishState,
} from './state.js';
import type {
  PublishResult,
  SocialLanguageCode,
  SocialPlatform,
  SocialPublishJob,
} from './types.js';

export interface PublishPlatformOutcome {
  platform: SocialPlatform;
  status: 'published' | 'skipped';
  url?: string;
}

/**
 * Fail-fast: the first transport, local-state, or telemetry failure throws a
 * `SocialReleaseFailureError` instead of recording a soft failure and moving
 * on. A partial outcome here is unreadable -- there is no way to tell "did it
 * actually publish" apart from "did our bookkeeping just not confirm it" --
 * and that ambiguity is exactly what let sibling lanes drift out of sync.
 * Lanes already published before the failure stay published; whichever lane
 * failed and everything after it in `jobs` never runs this tick.
 */
export async function publishSocialPlatforms(input: {
  episodeId: string;
  languageCode?: SocialLanguageCode;
  jobs: readonly SocialPublishJob[];
  force: boolean;
  statePath?: string;
  persistPublished?: (published: PublishedSocialPost) => Promise<void>;
  onLog?: (message: string) => void;
}): Promise<PublishPlatformOutcome[]> {
  const log = input.onLog ?? (() => void 0);
  const languageCode = input.languageCode ?? 'zh-Hant';
  const outcomes: PublishPlatformOutcome[] = [];

  for (const [index, job] of input.jobs.entries()) {
    const platform = job.platform;
    const state = await readPublishState(input.statePath);
    const existing = getPublishedPlatform(
      state,
      input.episodeId,
      platform,
      input.languageCode,
    );
    if (existing && !input.force) {
      log(`[${platform}] already published — skipping.`);
      outcomes.push({
        platform,
        status: 'skipped',
        ...(existing.url ? { url: existing.url } : {}),
      });
      continue;
    }

    const publishedLanes = outcomes.map((outcome) => outcome.platform);
    const untouchedLanes = input.jobs
      .slice(index + 1)
      .map((pending) => pending.platform);
    const fail = (
      phase: 'transport' | 'state' | 'telemetry',
      cause: unknown,
    ): SocialReleaseFailureError =>
      new SocialReleaseFailureError({
        episodeId: input.episodeId,
        languageCode,
        platform,
        phase,
        cause,
        publishedLanes,
        untouchedLanes,
      });

    let result: PublishResult;
    try {
      result = await job.publish();
    } catch (error) {
      const normalized = toError(error);
      log(`[${platform}] ✗ ${normalized.message}`);
      throw fail('transport', normalized);
    }

    try {
      await markPlatformPublished({
        episodeId: input.episodeId,
        platform,
        languageCode: input.languageCode,
        result: {
          published: true,
          publishedAt: result.publishedAt,
          ...(result.url ? { url: result.url } : {}),
        },
        path: input.statePath,
      });
    } catch (error) {
      const normalized = toError(error);
      log(
        `[${platform}] ⚠ Published remotely, but local duplicate state was not saved: ${normalized.message}`,
      );
      throw fail('state', normalized);
    }

    if (input.persistPublished) {
      try {
        await input.persistPublished({ platform, result });
      } catch (error) {
        const normalized = toError(error);
        log(
          `[${platform}] ⚠ Published remotely, but telemetry recording failed: ${normalized.message}`,
        );
        throw fail('telemetry', normalized);
      }
    }

    log(`[${platform}] ✓ ${result.url ?? 'Published'}`);
    outcomes.push({
      platform,
      status: 'published',
      ...(result.url ? { url: result.url } : {}),
    });
  }

  return outcomes;
}
