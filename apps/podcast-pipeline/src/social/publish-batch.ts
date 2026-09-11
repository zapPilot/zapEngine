import { socialLandingUrl } from '../brand/cta.js';
import { generateSocialCopy } from './copy.js';
import { getSocialEpisode } from './episode.js';
import {
  type PackagingAssignment,
  resolvePackagingAssignments,
} from './packaging-experiments.js';
import type { SocialPlatform } from './platforms.js';
import { prepareSocialBatchAssets } from './prepare-batch-assets.js';
import {
  type PublishPlatformOutcome,
  publishSocialPlatforms,
} from './publish.js';
import { createSocialPublishJobs } from './publishers.js';
import {
  createSocialPostPersister,
  type SocialCopySnapshot,
} from './record.js';
import type {
  SocialEpisode,
  SocialLanguageCode,
  YouTubePrivacyStatus,
} from './types.js';
import type { PreparedVideo } from './video.js';

export interface SocialBatchPlatform {
  platform: SocialPlatform;
  experimentKey?: string | null;
  experimentVariant?: string | null;
}

export interface PreparedSocialBatchCopy {
  episode: SocialEpisode;
  packagingByPlatform: Partial<Record<SocialPlatform, PackagingAssignment>>;
  snapshot: SocialCopySnapshot;
}

/**
 * Everything a release needs before its first transport call, and the only
 * step left that can fail for one language of an otherwise healthy article.
 * It is a separate entry point so the daemon can run it for every claimed
 * language *before* publishing any of them: generating copy inside the
 * per-language publish loop meant a rejected Rednote note arrived after the
 * article's other languages were already live, which is the permanently
 * partial article the cohort contract forbids.
 *
 * Deliberately without a try/catch. `generateSocialCopy` already throws
 * `SocialCopyGenerationError` for the one case that is a decided-copy failure;
 * wrapping the call here would swallow a missing prompt file or unset
 * OpenRouter config into the same hold, and those are deployment failures that
 * have to stay fatal.
 */
export async function prepareSocialBatchCopy(input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialPlatform[];
  strategyGuidanceByPlatform?: Partial<Record<SocialPlatform, string>>;
}): Promise<PreparedSocialBatchCopy> {
  const episode = await getSocialEpisode(input.episodeId, input.languageCode);
  const packagingByPlatform = await resolvePackagingAssignments({
    episodeId: input.episodeId,
    languageCode: input.languageCode,
    platforms: input.platforms,
  });
  const generated = await generateSocialCopy({
    episode,
    languageCode: input.languageCode,
    platforms: input.platforms,
    packagingByPlatform,
    ...(input.strategyGuidanceByPlatform
      ? { strategyGuidanceByPlatform: input.strategyGuidanceByPlatform }
      : {}),
  });
  return {
    episode,
    packagingByPlatform,
    snapshot: {
      generated: generated.copy,
      published: generated.copy,
      model: generated.model,
    },
  };
}

export async function publishSocialBatch(input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialBatchPlatform[];
  packagingByPlatform: Partial<Record<SocialPlatform, PackagingAssignment>>;
  copySnapshot: SocialCopySnapshot;
  episode: SocialEpisode;
  video?: PreparedVideo;
  teaserVideo?: PreparedVideo;
  force?: boolean;
  youtubePrivacyStatus?: YouTubePrivacyStatus;
  onLog?: (message: string) => void;
}): Promise<PublishPlatformOutcome[]> {
  const onLog = input.onLog ?? (() => void 0);
  const platforms = input.platforms.map(({ platform }) => platform);
  const { episode, video, teaserVideo } = await prepareSocialBatchAssets({
    episodeId: input.episodeId,
    languageCode: input.languageCode,
    platforms,
    existing: {
      episode: input.episode,
      ...(input.video ? { video: input.video } : {}),
      ...(input.teaserVideo ? { teaserVideo: input.teaserVideo } : {}),
    },
  });
  const { packagingByPlatform, copySnapshot: snapshot } = input;

  if (platforms.includes('rednote') && episode.videoDurationSeconds > 900) {
    onLog(
      `[rednote] video is ${Math.round(episode.videoDurationSeconds)}s, above the general 15-minute limit; publishing will still be attempted.`,
    );
  }

  const destinationUrlByPlatform = Object.fromEntries(
    platforms.map((platform) => [
      platform,
      socialLandingUrl({
        episodeId: input.episodeId,
        platform,
        languageCode: input.languageCode,
      }),
    ]),
  ) as Partial<Record<SocialPlatform, string>>;

  const jobs = createSocialPublishJobs({
    platforms,
    copy: snapshot.published,
    episode,
    videoUrl: episode.videoUrl,
    thumbnailUrl: episode.videoThumbnailUrl,
    destinationUrlByPlatform,
    ...(video ? { videoPath: video.path } : {}),
    ...(teaserVideo ? { xVideoPath: teaserVideo.path } : {}),
    ...(input.youtubePrivacyStatus
      ? { youtubePrivacyStatus: input.youtubePrivacyStatus }
      : {}),
    onLog,
  });
  const experimentByPlatform = Object.fromEntries(
    input.platforms.map((entry) => [
      entry.platform,
      {
        experimentKey: entry.experimentKey ?? null,
        experimentVariant: entry.experimentVariant ?? null,
      },
    ]),
  );
  const persistPublished = createSocialPostPersister({
    episodeId: input.episodeId,
    languageCode: input.languageCode,
    experimentByPlatform,
    packagingByPlatform,
    destinationUrlByPlatform,
    snapshot,
    episode,
    videoDurationSeconds: episode.videoDurationSeconds,
    onError: (message) => onLog(message),
  });

  return publishSocialPlatforms({
    episodeId: input.episodeId,
    languageCode: input.languageCode,
    jobs,
    force: input.force ?? false,
    persistPublished,
    onLog,
  });
}
