import { runWithDeadline } from '../../lib/deadline.js';
import { errorMessage } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';

export const JSON_IMAGE_SEARCH_TIMEOUT_MS = 15_000;

// Shared request/parse/error contract for every JSON image-search API this
// service calls: non-OK responses and malformed bodies become the provider's
// typed error, aborts pass through untouched, and anything else is wrapped so
// the planner can attribute the failure to the provider.
export async function performJsonImageSearch(input: {
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
        // An empty result set from an official API is trustworthy: there is
        // no markup-drift failure mode to mistake for "nothing matched".
        const candidates = input.parseBody(body);
        if (!candidates) {
          throw input.createError(
            `${input.providerName} search returned an unexpected response shape`,
          );
        }
        return candidates;
      },
      input.signal,
      JSON_IMAGE_SEARCH_TIMEOUT_MS,
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
