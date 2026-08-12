/** Selected-language list selection for the podcast screen sections. */
import {
  type EpisodeSortDirection,
  sortEpisodes,
} from '@/components/podcast/episodeSorting';
import type { PlayUnheardMode } from '@/components/podcast/PlayUnheardCard';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { resolveEpisodeStatus } from '@/integration/podcastProgress';

export interface PodcastListSelection {
  /** Selected language's unheard episodes, ordered by the direction toggle. */
  unheard: PodcastEpisode[];
  /** Selected language's listened episodes, always newest-first. */
  listened: PodcastEpisode[];
}

export interface PlayUnheardSelection {
  mode: PlayUnheardMode;
  target: PodcastEpisode | null;
  queue: PodcastEpisode[];
}

/**
 * Selects the smart-play target and queue: resume in-progress episodes first,
 * then unplayed episodes, or replay completed episodes when none remain.
 */
export function selectPlayUnheardTarget(
  episodes: readonly PodcastEpisode[],
  direction: EpisodeSortDirection,
): PlayUnheardSelection {
  if (episodes.length === 0) {
    return { mode: 'empty', target: null, queue: [] };
  }

  const inProgress = sortEpisodes(
    episodes.filter(
      (episode) =>
        resolveEpisodeStatus(episode.listened, episode.lastPositionSeconds) ===
        'inProgress',
    ),
    direction,
  );
  const unplayed = sortEpisodes(
    episodes.filter(
      (episode) =>
        resolveEpisodeStatus(episode.listened, episode.lastPositionSeconds) ===
        'unplayed',
    ),
    direction,
  );
  const unheard = [...inProgress, ...unplayed];
  if (unheard.length > 0) {
    return {
      mode: inProgress.length > 0 ? 'inProgress' : 'unplayed',
      target: unheard[0] ?? null,
      queue: unheard,
    };
  }

  const completed = sortEpisodes(
    episodes.filter((episode) => episode.listened),
    direction,
  );
  return {
    mode: 'allCompleted',
    target: completed[0] ?? null,
    queue: completed,
  };
}

/**
 * Splits the selected-language feed into the 未聽 / 已聽完 sections.
 */
export function selectPodcastLists(
  episodes: readonly PodcastEpisode[],
  direction: EpisodeSortDirection,
): PodcastListSelection {
  return {
    unheard: sortEpisodes(
      episodes.filter((episode) => !episode.listened),
      direction,
    ),
    listened: sortEpisodes(
      episodes.filter((episode) => episode.listened),
      'newest',
    ),
  };
}
