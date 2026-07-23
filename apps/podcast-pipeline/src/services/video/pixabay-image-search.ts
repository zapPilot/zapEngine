import { z } from 'zod';

import type { ImageCandidate } from '../../types.js';
import { performStockImageSearch } from './stock-image-search.js';

const PIXABAY_SEARCH_ENDPOINT = 'https://pixabay.com/api/';
const DEFAULT_RESULT_COUNT = 60;
const MAX_RESULT_COUNT = 200;
// Pixabay caps queries at 100 characters and rejects longer ones outright.
const MAX_QUERY_LENGTH = 100;
// largeImageURL is scaled to at most 1280px on its longest side; fullHDURL
// (1920px) is only present for accounts with full API access.
const LARGE_IMAGE_MAX_EDGE = 1_280;
const FULL_HD_MAX_EDGE = 1_920;

export interface SearchPixabayImagesOptions {
  count?: number;
  signal?: AbortSignal;
  fetchJson?: typeof fetch;
}

export class PixabayImagesProviderError extends Error {
  override readonly name = 'PixabayImagesProviderError';
}

const pixabayHitSchema = z.object({
  pageURL: z.string().url(),
  tags: z.string().nullish(),
  user: z.string().nullish(),
  user_id: z.number().int().nullish(),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  largeImageURL: z.string().url(),
  fullHDURL: z.string().url().nullish(),
});

const pixabayResponseSchema = z.object({
  hits: z.array(z.unknown()),
});

export function buildPixabaySearchUrl(
  query: string,
  apiKey: string,
  options: Pick<SearchPixabayImagesOptions, 'count'> = {},
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error('Pixabay query must not be empty');
  const count = options.count ?? DEFAULT_RESULT_COUNT;
  if (!Number.isInteger(count) || count < 3 || count > MAX_RESULT_COUNT) {
    throw new Error(
      `Pixabay count must be an integer between 3 and ${MAX_RESULT_COUNT}`,
    );
  }

  const url = new URL(PIXABAY_SEARCH_ENDPOINT);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', trimmedQuery.slice(0, MAX_QUERY_LENGTH));
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', String(count));
  url.searchParams.set('min_width', '1000');
  url.searchParams.set('min_height', '800');
  return url.href;
}

function scaledRendition(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function candidateFromHit(hit: unknown): ImageCandidate | null {
  const parsed = pixabayHitSchema.safeParse(hit);
  if (!parsed.success) return null;
  const data = parsed.data;

  const imageUrl = data.fullHDURL ?? data.largeImageURL;
  const rendition = scaledRendition(
    data.imageWidth,
    data.imageHeight,
    data.fullHDURL ? FULL_HD_MAX_EDGE : LARGE_IMAGE_MAX_EDGE,
  );
  const photographer = data.user?.trim();
  return {
    imageUrl,
    sourceUrl: data.pageURL,
    origin: 'pixabay',
    width: rendition.width,
    height: rendition.height,
    ...(data.tags?.trim() ? { altText: data.tags.trim() } : {}),
    ...(photographer ? { photographer } : {}),
    ...(photographer && data.user_id
      ? {
          photographerUrl: `https://pixabay.com/users/${encodeURIComponent(photographer)}-${data.user_id}/`,
        }
      : {}),
  };
}

export async function searchPixabayImages(
  query: string,
  apiKey: string,
  options: SearchPixabayImagesOptions = {},
): Promise<ImageCandidate[]> {
  if (!apiKey.trim()) {
    throw new PixabayImagesProviderError('Pixabay API key must not be empty');
  }
  return performStockImageSearch({
    providerName: 'Pixabay',
    searchUrl: buildPixabaySearchUrl(query, apiKey, options),
    headers: { accept: 'application/json' },
    fetchJson: options.fetchJson ?? fetch,
    signal: options.signal,
    createError: (message, errorOptions) =>
      new PixabayImagesProviderError(message, errorOptions),
    isProviderError: (error) => error instanceof PixabayImagesProviderError,
    parseBody: (body) => {
      const parsed = pixabayResponseSchema.safeParse(body);
      if (!parsed.success) return null;
      return parsed.data.hits
        .map(candidateFromHit)
        .filter((candidate): candidate is ImageCandidate => candidate !== null);
    },
  });
}
