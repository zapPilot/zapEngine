import { runWithDeadline } from '../../lib/deadline.js';
import type { ImageCandidate } from '../../types.js';

export const STOCK_IMAGE_FETCH_TIMEOUT_MS = 15_000;

// Shared request/parse/error contract for the JSON stock-photo APIs (Pexels,
// Pixabay): non-OK responses and malformed bodies become the provider's typed
// error, aborts pass through untouched, and anything else is wrapped so the
// planner can attribute the failure to the provider.
export async function performStockImageSearch(input: {
  providerName: string;
  searchUrl: string;
  headers: Record<string, string>;
  fetchJson: typeof fetch;
  signal?: AbortSignal;
  createError: (message: string, options?: { cause?: unknown }) => Error;
  isProviderError: (error: unknown) => boolean;
  parseBody: (body: unknown) => ImageCandidate[] | null;
}): Promise<ImageCandidate[]> {
  try {
    return await runWithDeadline(
      async (signal) => {
        const response = await input.fetchJson(input.searchUrl, {
          headers: input.headers,
          signal,
        });
        if (!response.ok) {
          throw input.createError(
            `${input.providerName} search failed: ${response.status} ${response.statusText}`,
          );
        }
        const body: unknown = await response.json();
        // An empty result set from an official API is trustworthy — unlike
        // the Bing HTML scrape there is no markup-drift failure mode here.
        const candidates = input.parseBody(body);
        if (!candidates) {
          throw input.createError(
            `${input.providerName} search returned an unexpected response shape`,
          );
        }
        return candidates;
      },
      input.signal,
      STOCK_IMAGE_FETCH_TIMEOUT_MS,
      `${input.providerName} search`,
    );
  } catch (error) {
    if (input.signal?.aborted) throw error;
    if (input.isProviderError(error)) throw error;
    throw input.createError(
      `${input.providerName} provider request failed: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
