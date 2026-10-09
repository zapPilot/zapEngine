import { useLocalSearchParams } from 'expo-router';

import {
  parsePodcastEpisodeRouteParams,
  type PodcastEpisodeRouteParams,
} from '@/integration/podcastFeed';

export function usePodcastEpisodeRoute(fallbackLanguageCode = ''): {
  episodeId: string;
  languageCode: string;
  mediaTab: 'video' | 'classroom' | 'transcript' | undefined;
} {
  const params = useLocalSearchParams() as PodcastEpisodeRouteParams;
  const destination = useLocalSearchParams<{ view?: string | string[] }>().view;
  const view = Array.isArray(destination) ? destination[0] : destination;
  const mediaTab =
    view === 'video' || view === 'classroom' || view === 'transcript'
      ? view
      : undefined;
  return {
    ...parsePodcastEpisodeRouteParams(params, fallbackLanguageCode),
    mediaTab,
  };
}
