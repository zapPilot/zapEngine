import type { ImageCandidate } from '../../types.js';
import { searchBraveImages } from './brave-image-search.js';
import { searchPexelsImages } from './pexels-image-search.js';
import { searchPixabayImages } from './pixabay-image-search.js';

export interface ImageSearchOptions {
  count?: number;
  signal?: AbortSignal;
}

export interface ImageSearchProvider {
  origin: 'brave' | 'pexels' | 'pixabay';
  search(
    query: string,
    options?: ImageSearchOptions,
  ): Promise<ImageCandidate[]>;
}

/**
 * Brave is the web index this service retrieves from, and it is not optional:
 * a scene that names a company, product or person needs the editorial photo of
 * that thing, which no stock library holds. A missing key therefore fails here
 * rather than silently shrinking the chain — the previous zero-config fallback
 * is exactly how an episode could ship on stock imagery without anyone noticing.
 *
 * Pexels and Pixabay stay optional and key-gated. They only ever answer scenes
 * that name nothing, where a generic photographable subject is the honest query
 * and a license-clean source is worth more than a web result.
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
      search: (query, options = {}) =>
        searchBraveImages(query, braveApiKey, options),
    },
  ];

  const pexelsApiKey = env['PEXELS_API_KEY']?.trim();
  if (pexelsApiKey) {
    providers.push({
      origin: 'pexels',
      search: (query, options = {}) =>
        searchPexelsImages(query, pexelsApiKey, options),
    });
  }

  const pixabayApiKey = env['PIXABAY_API_KEY']?.trim();
  if (pixabayApiKey) {
    providers.push({
      origin: 'pixabay',
      search: (query, options = {}) =>
        searchPixabayImages(query, pixabayApiKey, options),
    });
  }

  return providers;
}
