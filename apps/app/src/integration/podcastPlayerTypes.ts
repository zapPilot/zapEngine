import type { PodcastEpisode } from '@/integration/podcastFeed';
import type {
  PodcastPlaybackSection,
  PodcastSectionKind,
} from '@/integration/podcastSections';

export interface PodcastSectionPlaybackOptions {
  atSeconds?: number;
  shouldPlay?: boolean;
  languageCode?: string | null;
}

export interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  /** Playback position within the current section (section-local seconds). */
  currentTime: number;
  /** Duration of the current section (section-local seconds). */
  duration: number;
  /** Effective playback speed of the current section. */
  speed: number;
  /** Playback sections of `nowPlaying`: main plus zero or more classroom languages. */
  sections: readonly PodcastPlaybackSection[];
  /** Which section kind is currently loaded ('main' when idle). */
  currentSection: PodcastSectionKind;
  /** Classroom language of the current section, or null for main / the legacy combined track. */
  currentSectionLanguage: string | null;
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
  playSectionFromQueue: (
    episodes: readonly PodcastEpisode[],
    episode: PodcastEpisode,
    section: PodcastSectionKind,
    options?: PodcastSectionPlaybackOptions,
  ) => void;
  seek: (seconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  skipToPreviousEpisode: () => PodcastEpisode | null;
  skipToNextEpisode: () => PodcastEpisode | null;
  /** Jump to a section of the current episode (e.g. the classroom chip). */
  skipToSection: (
    kind: PodcastSectionKind,
    atSeconds?: number,
    languageCode?: string | null,
  ) => void;
  setSpeed: (speed: number) => void;
}
