import { getSocialEpisode, requireSocialEpisodeVideoUrl } from './episode.js';
import { requiresLocalTeaser, requiresLocalVideo } from './platforms.js';
import type {
  SocialEpisode,
  SocialLanguageCode,
  SocialPlatform,
} from './types.js';
import {
  type PreparedVideo,
  prepareSocialVideo,
  prepareXTeaserVideo,
  xTeaserDurationSeconds,
} from './video.js';

export interface SocialBatchAssets {
  episode: SocialEpisode;
  video?: PreparedVideo;
  teaserVideo?: PreparedVideo;
}

interface SocialBatchExistingAssets {
  episode?: SocialEpisode;
  video?: PreparedVideo;
  teaserVideo?: PreparedVideo;
}

export function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

export function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Fetches the episode plus whatever local video/teaser the requested
 * platforms need. Shared by the interactive CLI, which reports each step
 * through `onLog`, and the daemon's batch publisher, which passes
 * already-prepared assets through `existing` instead of refetching them.
 */
export async function prepareSocialBatchAssets(input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialPlatform[];
  existing?: SocialBatchExistingAssets;
  onLog?: (message: string) => void;
}): Promise<SocialBatchAssets> {
  const log = input.onLog ?? ((): void => void 0);

  let episode = input.existing?.episode;
  if (!episode) {
    log(`Fetching episode ${input.episodeId}...`);
    episode = await getSocialEpisode(input.episodeId, input.languageCode);
    log('✓ metadata');
    log('✓ transcript');
  }

  const video =
    input.existing?.video ??
    (requiresLocalVideo(input.platforms)
      ? await prepareSocialVideo({
          episodeId: input.episodeId,
          languageCode: input.languageCode,
          url: requireSocialEpisodeVideoUrl(episode),
        })
      : undefined);
  if (video && !input.existing?.video) {
    log(
      `✓ ${input.languageCode} video (${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}${video.reused ? ', cached' : ''})`,
    );
  }

  const teaserVideo =
    input.existing?.teaserVideo ??
    (video && requiresLocalTeaser(input.platforms)
      ? await prepareXTeaserVideo({
          episodeId: input.episodeId,
          sourcePath: video.path,
          durationSeconds: episode.videoDurationSeconds,
        })
      : undefined);
  if (teaserVideo && !input.existing?.teaserVideo) {
    log(
      `✓ X video (${formatDuration(xTeaserDurationSeconds(episode.videoDurationSeconds))}, ${formatBytes(teaserVideo.sizeBytes)}${teaserVideo.reused ? ', cached/reused' : ''})`,
    );
  }

  return { episode, video, teaserVideo };
}
