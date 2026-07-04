/** From Fed to Chain podcast feed client (podcast-pipeline `/episodes` API). */
import { useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

export interface PodcastEpisode {
  id: string;
  localizationId: string;
  title: string;
  languageCode: string;
  hlsUrl: string;
  createdAt: string;
  listened: boolean;
}

interface PodcastFeedPage {
  items: PodcastEpisode[];
  nextCursor: string | null;
}

const DEFAULT_PODCAST_API_URL = 'https://from-fed-to-chain-api.fly.dev';
// Default content language for the universal app feed.
const PODCAST_LANGUAGE_CODE = 'zh-Hant';
const FEED_PAGE_SIZE = 30;

export function getPodcastApiUrl(): string {
  const configured = getRuntimeEnv('VITE_PODCAST_API_URL')?.trim();
  return configured !== undefined && configured !== ''
    ? configured.replace(/\/$/, '')
    : DEFAULT_PODCAST_API_URL;
}

export async function fetchPodcastEpisodes(
  fetchImpl: typeof fetch = fetch,
): Promise<PodcastEpisode[]> {
  const url = new URL(`${getPodcastApiUrl()}/episodes`);
  url.searchParams.set('limit', String(FEED_PAGE_SIZE));
  url.searchParams.set('language', PODCAST_LANGUAGE_CODE);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`Podcast feed request failed: ${response.status}`);
  }

  const page = (await response.json()) as PodcastFeedPage;
  return page.items.filter((episode) => episode.hlsUrl !== '');
}

export function usePodcastEpisodes() {
  return useQuery({
    queryKey: ['desktop', 'podcast', 'episodes', PODCAST_LANGUAGE_CODE],
    queryFn: () => fetchPodcastEpisodes(),
    staleTime: 5 * 60 * 1000,
  });
}
