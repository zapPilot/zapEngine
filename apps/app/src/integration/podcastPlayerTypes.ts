import type { PodcastEpisode } from '@/integration/podcastFeed';

export interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  toggle: (episode: PodcastEpisode) => void;
  seek: (seconds: number) => void;
}
