import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  buildPlaybackSections,
  type PodcastPlaybackSection,
  type PodcastSectionKind,
} from '@/integration/podcastSections';

export type EpisodeMediaTab = 'story' | 'classroom' | 'video';

export interface EpisodeMediaTabAvailability {
  story: true;
  classroom: boolean;
  video: boolean;
}

export type EpisodeVideoPanelState =
  | 'ready'
  | 'generating'
  | 'failed'
  | 'unavailable';

type EpisodeMediaTabEpisode = Pick<
  PodcastEpisode,
  'hlsUrl' | 'languageCode' | 'audioTracks' | 'video'
>;

export function episodeVideoPanelState(
  episode: Pick<PodcastEpisode, 'video' | 'videoGeneration'>,
): EpisodeVideoPanelState {
  if (episode.video !== null) return 'ready';
  if (
    episode.videoGeneration?.status === 'queued' ||
    episode.videoGeneration?.status === 'processing'
  ) {
    return 'generating';
  }
  if (episode.videoGeneration?.status === 'failed') return 'failed';
  return 'unavailable';
}

export function episodeMediaTabAvailability(
  episode: EpisodeMediaTabEpisode,
): EpisodeMediaTabAvailability {
  return {
    story: true,
    classroom: buildPlaybackSections(episode).some(
      (section) => section.kind === 'classroom',
    ),
    video: episode.video !== null,
  };
}

/**
 * Which classroom language chip should be active: the player's current
 * classroom language when it belongs to this episode, otherwise the user's
 * locally selected language, otherwise the first available classroom
 * language. Returns null when the episode has no classroom sections.
 */
export function resolveActiveClassroomLanguage({
  classroomSections,
  playerLanguage,
  selectedLanguage,
}: {
  classroomSections: readonly PodcastPlaybackSection[];
  playerLanguage: string | null;
  selectedLanguage: string | null;
}): string | null {
  const available = new Set(
    classroomSections
      .map((section) => section.languageCode)
      .filter((language): language is string => language !== null),
  );
  if (playerLanguage !== null && available.has(playerLanguage)) {
    return playerLanguage;
  }
  if (selectedLanguage !== null && available.has(selectedLanguage)) {
    return selectedLanguage;
  }
  return classroomSections[0]?.languageCode ?? null;
}

export function resolveActiveEpisodeMediaTab({
  selectedTab,
  isCurrentAudio,
  currentSection,
  isVideoActive,
}: {
  selectedTab: EpisodeMediaTab;
  isCurrentAudio: boolean;
  currentSection: PodcastSectionKind;
  isVideoActive: boolean;
}): EpisodeMediaTab {
  if (isVideoActive) return 'video';
  if (isCurrentAudio) {
    return currentSection === 'classroom' ? 'classroom' : 'story';
  }
  return selectedTab;
}
