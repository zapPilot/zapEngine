import { z } from 'zod';

import type { ImageCandidate } from '../../types.js';
import { performStockImageSearch } from './stock-image-search.js';

const PEXELS_SEARCH_ENDPOINT = 'https://api.pexels.com/v1/search';
const DEFAULT_RESULT_COUNT = 40;
const MAX_RESULT_COUNT = 80;
// large2x renditions are capped at 1880px wide — plenty for the 1080-wide
// media window while keeping downloads far below the acquisition size limits.
const LARGE2X_MAX_WIDTH = 1_880;

export type PexelsOrientation = 'landscape' | 'portrait' | 'square';

export interface SearchPexelsImagesOptions {
  count?: number;
  orientation?: PexelsOrientation;
  signal?: AbortSignal;
  fetchJson?: typeof fetch;
}

export class PexelsImagesProviderError extends Error {
  override readonly name = 'PexelsImagesProviderError';
}

const pexelsPhotoSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  url: z.string().url(),
  alt: z.string().nullish(),
  photographer: z.string().nullish(),
  photographer_url: z.string().nullish(),
  src: z.object({ large2x: z.string().url() }),
});

const pexelsResponseSchema = z.object({
  photos: z.array(z.unknown()),
});

export function buildPexelsSearchUrl(
  query: string,
  options: Pick<SearchPexelsImagesOptions, 'count' | 'orientation'> = {},
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error('Pexels query must not be empty');
  const count = options.count ?? DEFAULT_RESULT_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > MAX_RESULT_COUNT) {
    throw new Error(
      `Pexels count must be an integer between 1 and ${MAX_RESULT_COUNT}`,
    );
  }

  const url = new URL(PEXELS_SEARCH_ENDPOINT);
  url.searchParams.set('query', trimmedQuery);
  url.searchParams.set('per_page', String(count));
  url.searchParams.set('orientation', options.orientation ?? 'square');
  return url.href;
}

function candidateFromPhoto(photo: unknown): ImageCandidate | null {
  const parsed = pexelsPhotoSchema.safeParse(photo);
  if (!parsed.success) return null;
  const { width, height, url, alt, photographer, photographer_url, src } =
    parsed.data;

  const renditionWidth = Math.min(width, LARGE2X_MAX_WIDTH);
  const renditionHeight = Math.round((height * renditionWidth) / width);
  return {
    imageUrl: src.large2x,
    sourceUrl: url,
    origin: 'pexels',
    width: renditionWidth,
    height: renditionHeight,
    ...(alt?.trim() ? { altText: alt.trim() } : {}),
    ...(photographer?.trim() ? { photographer: photographer.trim() } : {}),
    ...(photographer_url?.trim()
      ? { photographerUrl: photographer_url.trim() }
      : {}),
  };
}

export async function searchPexelsImages(
  query: string,
  apiKey: string,
  options: SearchPexelsImagesOptions = {},
): Promise<ImageCandidate[]> {
  if (!apiKey.trim()) {
    throw new PexelsImagesProviderError('Pexels API key must not be empty');
  }
  return performStockImageSearch({
    providerName: 'Pexels',
    searchUrl: buildPexelsSearchUrl(query, options),
    headers: { accept: 'application/json', authorization: apiKey },
    fetchJson: options.fetchJson ?? fetch,
    signal: options.signal,
    createError: (message, errorOptions) =>
      new PexelsImagesProviderError(message, errorOptions),
    isProviderError: (error) => error instanceof PexelsImagesProviderError,
    parseBody: (body) => {
      const parsed = pexelsResponseSchema.safeParse(body);
      if (!parsed.success) return null;
      return parsed.data.photos
        .map(candidateFromPhoto)
        .filter((candidate): candidate is ImageCandidate => candidate !== null);
    },
  });
}
