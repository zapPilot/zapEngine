import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

export function finiteSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isSamePodcastEpisode(
  first: PodcastEpisode | null,
  second: PodcastEpisode,
): boolean {
  return first?.id === second.id;
}

export function findPodcastQueueIndex(
  episodes: readonly PodcastEpisode[],
  episode: PodcastEpisode,
): number {
  return episodes.findIndex(
    (candidate) =>
      candidate.id === episode.id &&
      candidate.localizationId === episode.localizationId,
  );
}

export function hasPreviousPodcastEpisode(
  queue: readonly PodcastEpisode[],
  queueIndex: number,
): boolean {
  return queueIndex > 0 && queueIndex < queue.length;
}

export function hasNextPodcastEpisode(
  queue: readonly PodcastEpisode[],
  queueIndex: number,
): boolean {
  return queueIndex >= 0 && queueIndex < queue.length - 1;
}

export type PodcastPlayerSnapshotParams = Omit<
  PodcastPlayer,
  'hasPreviousEpisode' | 'hasNextEpisode'
>;

export function createPodcastPlayerSnapshot({
  nowPlaying,
  isPlaying,
  currentTime,
  duration,
  speed,
  queue,
  queueIndex,
  pause,
  toggle,
  playFromQueue,
  seek,
  seekRelative,
  skipToPreviousEpisode,
  skipToNextEpisode,
  setSpeed,
}: PodcastPlayerSnapshotParams): PodcastPlayer {
  return {
    nowPlaying,
    isPlaying,
    currentTime: finiteSeconds(currentTime),
    duration: finiteSeconds(duration),
    speed,
    queue,
    queueIndex,
    hasPreviousEpisode: hasPreviousPodcastEpisode(queue, queueIndex),
    hasNextEpisode: hasNextPodcastEpisode(queue, queueIndex),
    pause,
    toggle,
    playFromQueue,
    seek,
    seekRelative,
    skipToPreviousEpisode,
    skipToNextEpisode,
    setSpeed,
  };
}
