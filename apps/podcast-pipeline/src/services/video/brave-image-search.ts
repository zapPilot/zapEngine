import { z } from 'zod';

import type { ImageCandidate } from '../../types.js';
import { performJsonImageSearch } from './json-image-search.js';

const BRAVE_IMAGES_SEARCH_ENDPOINT =
  'https://api.search.brave.com/res/v1/images/search';
const DEFAULT_RESULT_COUNT = 35;
// The endpoint's own ceiling; asking for more is a 422, not a truncation.
const MAX_RESULT_COUNT = 100;

export interface BraveImagesSearchUrlOptions {
  count?: number;
}

export interface SearchBraveImagesOptions extends BraveImagesSearchUrlOptions {
  signal?: AbortSignal;
  fetchJson?: typeof fetch;
}

export class BraveImagesProviderError extends Error {
  override readonly name = 'BraveImagesProviderError';
}

/**
 * Only the fields this service can act on. `properties.url` is the publisher's
 * own image; `thumbnail.src` is Brave's CDN copy and is deliberately not used —
 * mirroring a search engine's thumbnail would store a downscaled derivative and
 * credit the wrong host.
 */
const braveImageResultSchema = z.object({
  title: z.string().nullish(),
  url: z.string().url(),
  properties: z.object({ url: z.string().url() }),
});

const braveResponseSchema = z.object({
  results: z.array(z.unknown()),
});

export function buildBraveImagesSearchUrl(
  query: string,
  options: BraveImagesSearchUrlOptions = {},
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error('Brave Images query must not be empty');
  const count = options.count ?? DEFAULT_RESULT_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > MAX_RESULT_COUNT) {
    throw new Error(
      `Brave Images count must be an integer between 1 and ${MAX_RESULT_COUNT}`,
    );
  }

  const url = new URL(BRAVE_IMAGES_SEARCH_ENDPOINT);
  url.searchParams.set('q', trimmedQuery);
  url.searchParams.set('count', String(count));
  url.searchParams.set('safesearch', 'strict');
  url.searchParams.set('search_lang', 'en');
  return url.href;
}

function candidateFromResult(result: unknown): ImageCandidate | null {
  const parsed = braveImageResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const { title, url, properties } = parsed.data;
  // Brave reports no pixel dimensions for image results. Leaving them unset is
  // truthful — the real size is measured when the image is downloaded, and the
  // candidate policy treats absent dimensions as "unknown", not "too small".
  return {
    imageUrl: properties.url,
    sourceUrl: url,
    origin: 'brave',
    ...(title?.trim() ? { altText: title.trim() } : {}),
  };
}

export async function searchBraveImages(
  query: string,
  apiKey: string,
  options: SearchBraveImagesOptions = {},
): Promise<ImageCandidate[]> {
  if (!apiKey.trim()) {
    throw new BraveImagesProviderError(
      'Brave Search API key must not be empty',
    );
  }
  return performJsonImageSearch({
    providerName: 'Brave Images',
    searchUrl: buildBraveImagesSearchUrl(query, options),
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip',
      'x-subscription-token': apiKey,
    },
    fetchJson: options.fetchJson ?? fetch,
    signal: options.signal,
    createError: (message, errorOptions) =>
      new BraveImagesProviderError(message, errorOptions),
    isProviderError: (error) => error instanceof BraveImagesProviderError,
    parseBody: (body) => {
      const parsed = braveResponseSchema.safeParse(body);
      if (!parsed.success) return null;
      return parsed.data.results
        .map(candidateFromResult)
        .filter((candidate): candidate is ImageCandidate => candidate !== null);
    },
  });
}
