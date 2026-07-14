/**
 * Device-local podcast listening progress. Mirrors the retired mobile app's
 * `user_episode_state` model (`listened` + `last_position_seconds`) but is keyed
 * per `localizationId` so each language tracks separately, and it lives on the
 * device (web `localStorage`) instead of an account-synced backend.
 */
import type { PodcastEpisode } from '@/integration/podcastFeed';

export interface PodcastEpisodeProgress {
  listened: boolean;
  lastPositionSeconds: number;
}

export type PodcastProgressMap = Record<string, PodcastEpisodeProgress>;

export type EpisodePlaybackStatus = 'unplayed' | 'inProgress' | 'completed';

/** Completed-episode progress for one language's currently available feed. */
export interface PodcastCompletionSummary {
  completed: number;
  total: number;
  percentage: number;
}

/** `localStorage` key for the per-localization progress map (web only). */
export const PODCAST_PROGRESS_STORAGE_KEY = 'podcast_episode_progress';

/** Saved position (seconds) an episode must exceed before it counts as in-progress. */
export const PODCAST_IN_PROGRESS_MIN_SECONDS = 5;

export function resolveEpisodeStatus(
  listened: boolean,
  lastPositionSeconds: number,
): EpisodePlaybackStatus {
  if (listened) return 'completed';
  if (lastPositionSeconds > PODCAST_IN_PROGRESS_MIN_SECONDS) {
    return 'inProgress';
  }
  return 'unplayed';
}

/**
 * Summarizes completed episodes without treating a saved resume position as a
 * completion. The feed currently exposes a finite page, so callers should
 * describe this as progress through the available episodes rather than a
 * lifetime catalog percentage.
 */
export function summarisePodcastCompletion(
  episodes: readonly Pick<PodcastEpisode, 'listened'>[],
): PodcastCompletionSummary {
  const total = episodes.length;
  const completed = episodes.filter((episode) => episode.listened).length;
  return {
    completed,
    total,
    percentage:
      total === 0
        ? 0
        : completed === total
          ? 100
          : Math.min(99, Math.round((completed / total) * 100)),
  };
}

/**
 * Overlays device-local progress onto a server episode; local wins, matching
 * the mobile `hydrateUserState` merge (`listened: server || local`).
 */
export function mergeEpisodeProgress(
  episode: PodcastEpisode,
  progress: PodcastProgressMap,
): PodcastEpisode {
  const local = progress[episode.localizationId];
  if (local === undefined) return episode;
  return {
    ...episode,
    listened: episode.listened || local.listened,
    lastPositionSeconds:
      local.lastPositionSeconds > 0
        ? local.lastPositionSeconds
        : episode.lastPositionSeconds,
  };
}
