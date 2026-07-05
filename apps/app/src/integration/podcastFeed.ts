/** From Fed to Chain podcast feed client (podcast-pipeline `/episodes` API). */
import { useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

import { DEFAULT_CONTENT_LANGUAGE_CODE } from '@/config/contentLanguages';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

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
const FEED_PAGE_SIZE = 30;

export function getPodcastApiUrl(): string {
  const configured = getRuntimeEnv('VITE_PODCAST_API_URL')?.trim();
  return configured !== undefined && configured !== ''
    ? configured.replace(/\/$/, '')
    : DEFAULT_PODCAST_API_URL;
}

export async function fetchPodcastEpisodes(
  fetchImpl: typeof fetch = fetch,
  languageCode: string = DEFAULT_CONTENT_LANGUAGE_CODE,
): Promise<PodcastEpisode[]> {
  const url = new URL(`${getPodcastApiUrl()}/episodes`);
  url.searchParams.set('limit', String(FEED_PAGE_SIZE));
  url.searchParams.set('language', languageCode);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`Podcast feed request failed: ${response.status}`);
  }

  const page = (await response.json()) as PodcastFeedPage;
  return page.items.filter((episode) => episode.hlsUrl !== '');
}

export function usePodcastEpisodes() {
  const { languageCode } = useContentLanguage();

  return useQuery({
    queryKey: ['desktop', 'podcast', 'episodes', languageCode],
    queryFn: () => fetchPodcastEpisodes(fetch, languageCode),
    staleTime: 5 * 60 * 1000,
  });
}
