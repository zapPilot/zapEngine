import type { FetchLike } from '../types.js';

const REQUEST_MAX_ATTEMPTS = 3;
const REQUEST_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUS = new Set([408, 429]);

export type Sleep = (milliseconds: number) => Promise<void>;

export interface RetryingGetRequest {
  url: URL | string;
  headers: Record<string, string>;
  /**
   * Prefix of every message this request can throw. `safeProviderError` in
   * control-center only passes an error through verbatim when it starts with a
   * known provider prefix, so the label is what decides whether the operator
   * reads the real failure or the generic "Provider request failed".
   */
  label: string;
  fetch?: FetchLike;
  sleep?: Sleep;
}

/**
 * One GET, retried the only way a nightly cost sync can afford to retry: three
 * attempts, exponential backoff, and a fresh timeout per attempt.
 *
 * The attempt budget and delays are deliberately not options. Every knob here
 * would be another default branch in a package pinned at 100% branch coverage,
 * and no caller has ever wanted a different answer to "how long do we wait for
 * a billing endpoint once a night".
 */
export async function fetchWithRetry(
  request: RetryingGetRequest,
): Promise<Response> {
  const fetcher = request.fetch ?? globalThis.fetch;
  const sleep =
    request.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(request.url, {
        headers: request.headers,
        // A per-attempt signal: a shared `init` would hand the retry an
        // already-aborted signal and fail it instantly.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempt === REQUEST_MAX_ATTEMPTS) {
        throw new Error(
          `${request.label} request failed after ${REQUEST_MAX_ATTEMPTS} attempts: ${safeErrorMessage(error)}`,
          { cause: error },
        );
      }
      await sleep(REQUEST_RETRY_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      return response;
    }

    const statusError = new Error(
      `${request.label} request failed (${response.status})`,
    );
    if (
      attempt === REQUEST_MAX_ATTEMPTS ||
      !isRetryableStatus(response.status)
    ) {
      throw statusError;
    }

    await response.body?.cancel().catch(() => {});
    await sleep(REQUEST_RETRY_DELAY_MS * 2 ** (attempt - 1));
  }
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
