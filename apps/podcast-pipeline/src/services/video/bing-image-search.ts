import { JSDOM } from 'jsdom';

import { runWithDeadline } from '../../lib/deadline.js';
import type { ImageCandidate } from '../../types.js';

const BING_IMAGES_SEARCH_ENDPOINT = 'https://www.bing.com/images/search';
const DEFAULT_RESULT_COUNT = 35;
const MAX_RESULT_COUNT = 150;
// aspect-square favors sources that survive the near-square 1080x960 media
// window crop of the vertical news layout.
const BING_IMAGE_QUALITY_FILTERS =
  '+filterui:imagesize-large+filterui:aspect-square+filterui:photo-photo';
const BING_IMAGE_VISUAL_QUERY_SUFFIX =
  'real world documentary photograph -text -typography -infographic -diagram -chart -presentation -slide -poster -tutorial -screenshot -banner -cover -quote -guide -explained -report -ppt -powerpoint -template -vector -clipart';
export const BING_IMAGES_FETCH_TIMEOUT_MS = 15_000;

export interface BingImagesSearchUrlOptions {
  count?: number;
  offset?: number;
}

export type FetchBingImagesHtml = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface SearchBingImagesOptions extends BingImagesSearchUrlOptions {
  fetchHtml?: FetchBingImagesHtml;
  signal?: AbortSignal;
}

export class BingImagesProviderError extends Error {
  override readonly name = 'BingImagesProviderError';
}

function boundedInteger(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

export function buildBingImagesSearchUrl(
  query: string,
  options: BingImagesSearchUrlOptions = {},
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error('Bing Images query must not be empty');

  const count = boundedInteger(
    options.count ?? DEFAULT_RESULT_COUNT,
    'Bing Images count',
    1,
    MAX_RESULT_COUNT,
  );
  const offset = boundedInteger(
    options.offset ?? 0,
    'Bing Images offset',
    0,
    Number.MAX_SAFE_INTEGER - 1,
  );
  const url = new URL(BING_IMAGES_SEARCH_ENDPOINT);
  url.searchParams.set(
    'q',
    `${trimmedQuery} ${BING_IMAGE_VISUAL_QUERY_SUFFIX}`,
  );
  url.searchParams.set('form', 'HDRSC2');
  url.searchParams.set('first', String(offset + 1));
  url.searchParams.set('count', String(count));
  url.searchParams.set('adlt', 'strict');
  url.searchParams.set('qft', BING_IMAGE_QUALITY_FILTERS);
  return url.href;
}

function searchRequestLanguage(query: string): string {
  return /[\u3400-\u9fff]/u.test(query)
    ? 'zh-TW,zh;q=0.9,en;q=0.8'
    : 'en-US,en;q=0.9';
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function positiveInteger(value: unknown): number | undefined {
  let parsed = Number.NaN;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = Number(value);
  }
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/* jscpd:ignore-start -- URL validation function; irreducible by design (different return type from parseWebUrl) */
function normalizedWebUrl(value: unknown): string | null {
  const rawUrl = nonEmptyString(value);
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
/* jscpd:ignore-end */

function candidateFromMetadata(
  metadata: Record<string, unknown>,
): ImageCandidate | null {
  const imageUrl = normalizedWebUrl(metadata['murl']);
  const sourceUrl = normalizedWebUrl(metadata['purl']);
  if (!imageUrl || !sourceUrl) return null;

  const width =
    positiveInteger(metadata['ow']) ??
    positiveInteger(metadata['w']) ??
    positiveInteger(metadata['width']);
  const height =
    positiveInteger(metadata['oh']) ??
    positiveInteger(metadata['h']) ??
    positiveInteger(metadata['height']);
  const altText =
    nonEmptyString(metadata['t']) ?? nonEmptyString(metadata['desc']);

  /* jscpd:ignore-start -- ImageCandidate with optional fields; irreducible spread pattern */
  return {
    imageUrl,
    sourceUrl,
    origin: 'bing',
    ...(altText ? { altText } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
  /* jscpd:ignore-end */
}

function mergeCandidate(
  candidatesByUrl: Map<string, ImageCandidate>,
  candidate: ImageCandidate,
): void {
  const existing = candidatesByUrl.get(candidate.imageUrl);
  if (!existing) {
    candidatesByUrl.set(candidate.imageUrl, candidate);
    return;
  }
  if (!existing.altText && candidate.altText) {
    existing.altText = candidate.altText;
  }
  if (!existing.width && candidate.width) existing.width = candidate.width;
  if (!existing.height && candidate.height) {
    existing.height = candidate.height;
  }
}

export function parseBingImagesHtml(html: string): ImageCandidate[] {
  const dom = new JSDOM(html);
  const candidatesByUrl = new Map<string, ImageCandidate>();

  try {
    for (const anchor of dom.window.document.querySelectorAll<HTMLAnchorElement>(
      'a.iusc[m]',
    )) {
      const rawMetadata = anchor.getAttribute('m');
      if (!rawMetadata) continue;

      try {
        const parsed: unknown = JSON.parse(rawMetadata);
        if (!isUnknownRecord(parsed)) continue;
        const candidate = candidateFromMetadata(parsed);
        if (candidate) mergeCandidate(candidatesByUrl, candidate);
      } catch {
        continue;
      }
    }
  } finally {
    dom.window.close();
  }

  return [...candidatesByUrl.values()];
}

function isExplicitZeroResultsPage(html: string): boolean {
  const dom = new JSDOM(html);
  try {
    const notice = dom.window.document.querySelector(
      '#mmComponent_no_results, #b_results .b_no, .mm_no_results, [data-tag="no-results"]',
    );
    return (
      notice !== null &&
      /(?:no|couldn['’]t find any)\s+(?:image\s+)?results/i.test(
        notice.textContent ?? '',
      )
    );
  } finally {
    dom.window.close();
  }
}

export async function searchBingImages(
  query: string,
  options: SearchBingImagesOptions = {},
): Promise<ImageCandidate[]> {
  const searchUrl = buildBingImagesSearchUrl(query, options);
  const fetchHtml = options.fetchHtml ?? fetch;
  try {
    return await runWithDeadline(
      async (signal) => {
        const response = await fetchHtml(searchUrl, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'accept-language': searchRequestLanguage(query),
            'user-agent':
              'Mozilla/5.0 (compatible; ZapEngine image research/0.1; +https://zap-pilot.org)',
          },
          redirect: 'follow',
          signal,
        });

        if (!response.ok) {
          throw new BingImagesProviderError(
            `Bing Images search failed: ${response.status} ${response.statusText}`,
          );
        }

        const html = await response.text();
        const candidates = parseBingImagesHtml(html);
        if (candidates.length === 0) {
          if (isExplicitZeroResultsPage(html)) return [];
          throw new BingImagesProviderError(
            'Bing Images search returned no parseable image results',
          );
        }
        return candidates;
      },
      options.signal,
      BING_IMAGES_FETCH_TIMEOUT_MS,
      'Bing Images search',
    );
    /* jscpd:ignore-start — same error-normalization tail as the JSON stock
       providers, but the HTML scrape keeps its own deadline/parse flow, so
       only this catch block coincides */
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof BingImagesProviderError) throw error;
    throw new BingImagesProviderError(
      `Bing Images provider request failed: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/* jscpd:ignore-end */
