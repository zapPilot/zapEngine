import type { PodcastEpisode } from '@/integration/podcastFeed';
import type {
  PodcastPlaybackSection,
  PodcastSectionKind,
} from '@/integration/podcastSections';

export interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  /** Playback position within the current section (section-local seconds). */
  currentTime: number;
  /** Duration of the current section (section-local seconds). */
  duration: number;
  /** Effective playback speed of the current section. */
  speed: number;
  /** Playback sections of `nowPlaying`: `[main]` or `[main, classroom]`. */
  sections: readonly PodcastPlaybackSection[];
  /** Which section is currently loaded ('main' when idle). */
  currentSection: PodcastSectionKind;
  queue: readonly PodcastEpisode[];
  queueIndex: number;
  hasPreviousEpisode: boolean;
  hasNextEpisode: boolean;
  pause: () => void;
  toggle: (episode: PodcastEpisode) => void;
  playFromQueue: (
    episodes: readonly PodcastEpisode[],
    episode: PodcastEpisode,
  ) => void;
  playFromQueueAt: (
    episodes: readonly PodcastEpisode[],
    episode: PodcastEpisode,
    seconds: number,
    shouldPlay?: boolean,
  ) => void;
  seek: (seconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  skipToPreviousEpisode: () => PodcastEpisode | null;
  skipToNextEpisode: () => PodcastEpisode | null;
  /** Jump to a section of the current episode (e.g. the classroom chip). */
  skipToSection: (kind: PodcastSectionKind, atSeconds?: number) => void;
  setSpeed: (speed: number) => void;
}
