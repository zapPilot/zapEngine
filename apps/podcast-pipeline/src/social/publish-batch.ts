import { socialLandingUrl } from '../brand/cta.js';
import { generateSocialCopy } from './copy.js';
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

export async function publishSocialBatch(input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialBatchPlatform[];
  strategyGuidanceByPlatform?: Partial<Record<SocialPlatform, string>>;
  packagingByPlatform?: Partial<Record<SocialPlatform, PackagingAssignment>>;
  copySnapshot?: SocialCopySnapshot;
  episode?: SocialEpisode;
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
      ...(input.episode ? { episode: input.episode } : {}),
      ...(input.video ? { video: input.video } : {}),
      ...(input.teaserVideo ? { teaserVideo: input.teaserVideo } : {}),
    },
  });
  const packagingByPlatform =
    input.packagingByPlatform ??
    (await resolvePackagingAssignments({
      episodeId: input.episodeId,
      languageCode: input.languageCode,
      platforms,
    }));
  let snapshot = input.copySnapshot;
  if (!snapshot) {
    const generated = await generateSocialCopy({
      episode,
      languageCode: input.languageCode,
      platforms,
      packagingByPlatform,
      ...(input.strategyGuidanceByPlatform
        ? { strategyGuidanceByPlatform: input.strategyGuidanceByPlatform }
        : {}),
    });
    snapshot = {
      generated: generated.copy,
      published: generated.copy,
      model: generated.model,
    };
  }

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
