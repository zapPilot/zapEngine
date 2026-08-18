import { parseSocialEpisodeId } from './episode.js';
import { isSocialPlatform, SOCIAL_PLATFORMS } from './platforms.js';
import {
  type SocialPlatform,
  YOUTUBE_PRIVACY_STATUSES,
  type YouTubePrivacyStatus,
} from './types.js';

/**
 * The argument contract every social command shares, so the publisher and the
 * metrics recorder cannot drift into accepting different episode references or
 * reporting a different platform vocabulary. `--help` and a malformed episode
 * reference both raise the caller's own usage line.
 */
export function requireEpisodeArgument(
  help: boolean,
  positionals: string[],
  usage: string,
): string {
  const [episode] = positionals;
  if (help || positionals.length !== 1 || !episode?.trim()) {
    throw new Error(usage);
  }
  return parseSocialEpisodeId(episode);
}

export function parsePlatformOption(value: string): SocialPlatform {
  if (!isSocialPlatform(value)) {
    throw new Error(
      `--platform must be one of: ${SOCIAL_PLATFORMS.join(', ')}.`,
    );
  }
  return value;
}

export function parseYouTubePrivacyOption(value: string): YouTubePrivacyStatus {
  const status = YOUTUBE_PRIVACY_STATUSES.find(
    (candidate) => candidate === value,
  );
  if (!status) {
    throw new Error(
      `--youtube-privacy must be one of: ${YOUTUBE_PRIVACY_STATUSES.join(', ')}.`,
    );
  }
  return status;
}
