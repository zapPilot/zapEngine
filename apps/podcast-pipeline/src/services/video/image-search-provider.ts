import type { ImageCandidate } from '../../types.js';
import {
  BRAVE_MAX_RESULT_COUNT,
  searchBraveImages,
} from './brave-image-search.js';

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
 * Brave is the only external image-search provider. Pexels and Pixabay were
 * retired because proper-noun searches routinely returned unrelated stock
 * imagery (for example `Stripe` as literal stripes). Article images and subject
 * reuse remain separate planner inputs/fallbacks; external search is Brave-only.
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
  return [
    {
      origin: 'brave',
      maxResults: BRAVE_MAX_RESULT_COUNT,
      search: (query, options = {}) =>
        searchBraveImages(query, braveApiKey, options),
    },
  ];
}
