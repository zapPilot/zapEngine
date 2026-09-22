import { useRouter } from 'expo-router';
import { useEffect, type ReactElement } from 'react';

import { podcastEpisodeRoutePath } from '@/integration/podcastFeed';
import { usePodcastEpisodeRoute } from '@/hooks/usePodcastEpisodeRoute';

export default function EpisodeShareRedirect(): ReactElement | null {
  const { episodeId, languageCode } = usePodcastEpisodeRoute();
  const router = useRouter();
  const href = podcastEpisodeRoutePath(episodeId, languageCode);

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
