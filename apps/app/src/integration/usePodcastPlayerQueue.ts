import { useCallback, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import {
  findPodcastQueueIndex,
  isSamePodcastEpisode,
} from '@/integration/podcastPlayerShared';

interface PodcastPlayerQueueParams {
  nowPlaying: PodcastEpisode | null;
  playEpisode: (episode: PodcastEpisode) => void;
  toggleCurrentPlayback: () => void;
}

interface PodcastPlayerQueueState {
  queue: readonly PodcastEpisode[];
  queueIndex: number;
  toggle: PodcastPlayer['toggle'];
  playFromQueue: PodcastPlayer['playFromQueue'];
  skipToPreviousEpisode: PodcastPlayer['skipToPreviousEpisode'];
  skipToNextEpisode: PodcastPlayer['skipToNextEpisode'];
}

export function usePodcastPlayerQueue({
  nowPlaying,
  playEpisode,
  toggleCurrentPlayback,
}: PodcastPlayerQueueParams): PodcastPlayerQueueState {
  const [queue, setQueue] = useState<readonly PodcastEpisode[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  const toggle = useCallback(
    (episode: PodcastEpisode) => {
      if (isSamePodcastEpisode(nowPlaying, episode)) {
        toggleCurrentPlayback();
        return;
      }

      setQueue([]);
      setQueueIndex(-1);
      playEpisode(episode);
    },
    [nowPlaying, playEpisode, toggleCurrentPlayback],
  );

  const playFromQueue = useCallback(
    (episodes: readonly PodcastEpisode[], episode: PodcastEpisode) => {
      const nextQueue = [...episodes];
      const targetIndex = findPodcastQueueIndex(nextQueue, episode);
      if (nextQueue.length === 0 || targetIndex < 0) {
        toggle(episode);
        return;
      }

      setQueue(nextQueue);
      setQueueIndex(targetIndex);

      if (isSamePodcastEpisode(nowPlaying, episode)) {
        toggleCurrentPlayback();
        return;
      }

      playEpisode(episode);
    },
    [nowPlaying, playEpisode, toggle, toggleCurrentPlayback],
  );

  const skipToQueueIndex = useCallback(
    (targetIndex: number): PodcastEpisode | null => {
      const episode = queue[targetIndex];
      if (episode === undefined) return null;
      setQueueIndex(targetIndex);
      playEpisode(episode);
      return episode;
    },
    [playEpisode, queue],
  );

  const skipToPreviousEpisode = useCallback(() => {
    return skipToQueueIndex(queueIndex - 1);
  }, [queueIndex, skipToQueueIndex]);

  const skipToNextEpisode = useCallback(() => {
    return skipToQueueIndex(queueIndex + 1);
  }, [queueIndex, skipToQueueIndex]);

  return {
    queue,
    queueIndex,
    toggle,
    playFromQueue,
    skipToPreviousEpisode,
    skipToNextEpisode,
  };
}
