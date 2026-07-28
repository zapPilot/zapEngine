/** Selected-language list selection for the podcast screen sections. */
import {
  type EpisodeSortDirection,
  sortEpisodes,
} from '@/components/podcast/episodeSorting';
import type { PodcastEpisode } from '@/integration/podcastFeed';

export interface PodcastListSelection {
  /** Selected language's unheard episodes, ordered by the direction toggle. */
  unheard: PodcastEpisode[];
  /** Selected language's listened episodes, always newest-first. */
  listened: PodcastEpisode[];
}

/**
 * Restricts the podcast list to the selected language (the header dropdown is
 * the single language selector) and splits it into the 未聽 / 已聽完 sections.
 */
export function selectPodcastLists(
  episodesByLanguage: Readonly<Record<string, readonly PodcastEpisode[]>>,
  languageCode: string,
  direction: EpisodeSortDirection,
): PodcastListSelection {
  const pool = episodesByLanguage[languageCode] ?? [];
  return {
    unheard: sortEpisodes(
      pool.filter((episode) => !episode.listened),
      direction,
    ),
    listened: sortEpisodes(
      pool.filter((episode) => episode.listened),
      'newest',
    ),
  };
}
