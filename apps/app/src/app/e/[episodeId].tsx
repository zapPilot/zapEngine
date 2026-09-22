import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, type ReactElement } from 'react';

import {
  parsePodcastEpisodeRouteParams,
  podcastEpisodeRoutePath,
} from '@/integration/podcastFeed';

export default function EpisodeShareRedirect(): ReactElement | null {
  const params = useLocalSearchParams<{
    episodeId?: string | string[];
    lang?: string | string[];
    language?: string | string[];
  }>();
  const router = useRouter();
  const { episodeId, languageCode } = parsePodcastEpisodeRouteParams(params);
  const href = podcastEpisodeRoutePath(episodeId, languageCode);

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
