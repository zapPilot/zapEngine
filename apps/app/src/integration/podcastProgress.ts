/**
 * Device-local podcast listening progress. Mirrors the retired mobile app's
 * `user_episode_state` model (`listened` + `last_position_seconds`) but is keyed
 * per `localizationId` so each language tracks separately, and it lives in
 * durable device storage instead of an account-synced backend.
 */
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastSectionKind } from '@/integration/podcastSections';

export interface PodcastEpisodeProgress {
  listened: boolean;
  lastPositionSeconds: number;
  /**
   * Which playback section `lastPositionSeconds` belongs to. Absent means the
   * main narration (backward compatible: entries written before sectioned
   * playback resume into the main section).
   */
  lastPositionSection?: PodcastSectionKind;
}

export type PodcastProgressMap = Record<string, PodcastEpisodeProgress>;

export type EpisodePlaybackStatus = 'unplayed' | 'inProgress' | 'completed';

/** Completed-episode progress for one language's full catalog. */
export interface PodcastCompletionSummary {
  completed: number;
  total: number;
  percentage: number;
}

/** Durable device-storage key for the per-localization progress map. */
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

/** Summarizes locally completed episodes from one language's full catalog. */
export function summariseCatalogCompletion(
  catalogIds: readonly string[],
  progress: PodcastProgressMap,
): PodcastCompletionSummary {
  const total = catalogIds.length;
  const completed = catalogIds.filter(
    (localizationId) => progress[localizationId]?.listened === true,
  ).length;
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
 * Overlays device-local progress onto a server episode. The server response is
 * catalog data only; listening state is exclusively device-local.
 */
export function mergeEpisodeProgress(
  episode: PodcastEpisode,
  progress: PodcastProgressMap,
): PodcastEpisode {
  const local = progress[episode.localizationId];
  return {
    ...episode,
    listened: local?.listened ?? false,
    lastPositionSeconds: local?.lastPositionSeconds ?? 0,
  };
}
