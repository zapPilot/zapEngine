import { useLocalSearchParams } from 'expo-router';

import {
  parsePodcastEpisodeRouteParams,
  type PodcastEpisodeRouteParams,
} from '@/integration/podcastFeed';

export function usePodcastEpisodeRoute(fallbackLanguageCode = ''): {
  episodeId: string;
  languageCode: string;
} {
  const params = useLocalSearchParams() as PodcastEpisodeRouteParams;
  return parsePodcastEpisodeRouteParams(params, fallbackLanguageCode);
}
