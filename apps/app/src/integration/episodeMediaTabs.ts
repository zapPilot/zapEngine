import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  classroomHlsUrlFor,
  type PodcastSectionKind,
} from '@/integration/podcastSections';

export type EpisodeMediaTab = 'story' | 'classroom' | 'video';

export interface EpisodeMediaTabAvailability {
  story: true;
  classroom: boolean;
  video: boolean;
}

type EpisodeMediaTabEpisode = Pick<
  PodcastEpisode,
  'hlsUrl' | 'languageCode' | 'audioTracks' | 'video'
>;

export function episodeMediaTabAvailability(
  episode: EpisodeMediaTabEpisode,
): EpisodeMediaTabAvailability {
  return {
    story: true,
    classroom: classroomHlsUrlFor(episode) !== null,
    video: episode.video !== null,
  };
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
