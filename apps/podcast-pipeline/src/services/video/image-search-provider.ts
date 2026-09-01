import type { ImageCandidate } from '../../types.js';
import {
  BRAVE_MAX_RESULT_COUNT,
  searchBraveImages,
} from './brave-image-search.js';
import {
  PEXELS_MAX_RESULT_COUNT,
  searchPexelsImages,
} from './pexels-image-search.js';
import {
  PIXABAY_MAX_RESULT_COUNT,
  searchPixabayImages,
} from './pixabay-image-search.js';

export interface ImageSearchOptions {
  count?: number;
  signal?: AbortSignal;
}

export interface ImageSearchProvider {
  origin: 'brave' | 'pexels' | 'pixabay';
  /** Provider-side ceiling for one request. Planner-level limits may be lower. */
  maxResults?: number;
  search(
    query: string,
    options?: ImageSearchOptions,
  ): Promise<ImageCandidate[]>;
}

/**
 * Brave remains the editorial web index for named companies, products, people,
 * and events, so its key is still required. The visual planner owns the quota
 * policy: generic B-roll prefers the license-clean stock providers, named scenes
 * spend Brave only within the episode budget, and stock can take over once that
 * budget is exhausted.
 *
 * Pexels and Pixabay stay optional and key-gated so deployments without those
 * credentials still render via Brave plus image reuse, just with less stock
 * coverage.
 */
export function defaultImageSearchProviders(
  env: NodeJS.ProcessEnv = process.env,
): ImageSearchProvider[] {
  const braveApiKey = env['BRAVE_SEARCH_API_KEY']?.trim();
  if (!braveApiKey) {
    throw new Error(
      'Missing required environment variable: BRAVE_SEARCH_API_KEY',
    );
  }
  const providers: ImageSearchProvider[] = [
    {
      origin: 'brave',
      maxResults: BRAVE_MAX_RESULT_COUNT,
      search: (query, options = {}) =>
        searchBraveImages(query, braveApiKey, options),
    },
  ];

  const pexelsApiKey = env['PEXELS_API_KEY']?.trim();
  if (pexelsApiKey) {
    providers.push({
      origin: 'pexels',
      maxResults: PEXELS_MAX_RESULT_COUNT,
      search: (query, options = {}) =>
        searchPexelsImages(query, pexelsApiKey, options),
    });
  }

  const pixabayApiKey = env['PIXABAY_API_KEY']?.trim();
  if (pixabayApiKey) {
    providers.push({
      origin: 'pixabay',
      maxResults: PIXABAY_MAX_RESULT_COUNT,
      search: (query, options = {}) =>
        searchPixabayImages(query, pixabayApiKey, options),
    });
  }

  return providers;
}
