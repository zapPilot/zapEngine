import type { PodcastEpisode } from '@/integration/podcastFeed';

export interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  queue: readonly PodcastEpisode[];
  queueIndex: number;
  hasPreviousEpisode: boolean;
  hasNextEpisode: boolean;
  toggle: (episode: PodcastEpisode) => void;
  playFromQueue: (
    episodes: readonly PodcastEpisode[],
    episode: PodcastEpisode,
  ) => void;
  seek: (seconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  skipToPreviousEpisode: () => PodcastEpisode | null;
  skipToNextEpisode: () => PodcastEpisode | null;
  setSpeed: (speed: number) => void;
}
