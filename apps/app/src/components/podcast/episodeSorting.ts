/** Podcast episode ordering, ported from the retired mobile `episode_sorting.dart`. */
import type { PodcastEpisode } from '@/integration/podcastFeed';

export type EpisodeSortDirection = 'newest' | 'oldest';

export function compareEpisodesNewestFirst(
  left: PodcastEpisode,
  right: PodcastEpisode,
): number {
  const dateOrder = right.createdAt.localeCompare(left.createdAt);
  if (dateOrder !== 0) return dateOrder;
  return right.id.localeCompare(left.id);
}

export function compareEpisodesOldestFirst(
  left: PodcastEpisode,
  right: PodcastEpisode,
): number {
  const dateOrder = left.createdAt.localeCompare(right.createdAt);
  if (dateOrder !== 0) return dateOrder;
  return left.id.localeCompare(right.id);
}

export function sortEpisodes(
  episodes: readonly PodcastEpisode[],
  direction: EpisodeSortDirection,
): PodcastEpisode[] {
  const comparator =
    direction === 'newest'
      ? compareEpisodesNewestFirst
      : compareEpisodesOldestFirst;
  return [...episodes].sort(comparator);
}
