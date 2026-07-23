import type { ImageCandidate } from '../../types.js';
import { searchBingImages } from './bing-image-search.js';
import { searchPexelsImages } from './pexels-image-search.js';
import { searchPixabayImages } from './pixabay-image-search.js';

export interface ImageSearchOptions {
  count?: number;
  signal?: AbortSignal;
}

export interface ImageSearchProvider {
  origin: 'pexels' | 'pixabay' | 'bing';
  search(
    query: string,
    options?: ImageSearchOptions,
  ): Promise<ImageCandidate[]>;
}

// License-clean stock APIs run before the Bing HTML scrape; each is included
// only when its API key is configured, so the provider chain degrades to the
// zero-config Bing fallback on unconfigured environments.
export function defaultImageSearchProviders(
  env: NodeJS.ProcessEnv = process.env,
): ImageSearchProvider[] {
  const providers: ImageSearchProvider[] = [];

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

  providers.push({
    origin: 'bing',
    search: (query, options = {}) => searchBingImages(query, options),
  });
  return providers;
}
