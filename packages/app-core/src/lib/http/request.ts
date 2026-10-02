/**
 * Core HTTP Request Handler
 * Main request execution logic with retry support
 */

import { sleep } from '@zapengine/types/shared';

import { createTimeoutController, isAbortError } from './abortControl';
import {
  hasHeaders,
  parseCacheControlForHint,
  syncQueryCacheDefaultsFromHint,
} from './cacheControl';
import { HTTP_CONFIG, type HttpRequestConfig } from './config';
import {
  APIError,
  NetworkError,
  parseErrorResponse,
  TimeoutError,
  toError,
} from './errors';
import { calculateBackoffDelay, shouldAttemptRetry } from './retry';

function createRequestConfig(config: HttpRequestConfig): RequestInit {
  const { method = 'GET', headers = {}, body } = config;
  const requestConfig: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    requestConfig.body = JSON.stringify(body);
  }

  return requestConfig;
}

function normalizeRequestExecutionError(error: unknown): Error {
  const normalizedError = toError(error);
  if (normalizedError instanceof APIError) {
    return normalizedError;
  }

  if (isAbortError(normalizedError)) {
    return new TimeoutError();
  }

  return normalizedError;
}

async function executeRequest<T>(
  url: string,
  requestInit: RequestInit,
): Promise<T> {
  const response = await fetch(url, requestInit);

  // Some test doubles provide a minimal Response-like object without headers.
  const cacheControlHeader = hasHeaders(response)
    ? ((response as Response).headers?.get?.('cache-control') ?? undefined)
    : undefined;

  const cacheHint = parseCacheControlForHint(cacheControlHeader);
  if (cacheHint) {
    syncQueryCacheDefaultsFromHint(cacheHint);
  }

  if (!response.ok) {
    const errorData = await parseErrorResponse(response);
    throw new APIError(
      errorData.message,
      response.status,
      errorData.code,
      errorData.details,
    );
  }

  return response.json();
}

/**
 * Core HTTP request function with retry logic and error handling
 */
export async function httpRequest<T = unknown>(
  url: string,
  config: HttpRequestConfig = {},
): Promise<T> {
  const {
    timeout = HTTP_CONFIG.timeout,
    retries = HTTP_CONFIG.retries,
    retryDelay = HTTP_CONFIG.retryDelay,
    signal,
  } = config;

  const requestConfig = createRequestConfig(config);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new TimeoutError();
    const { signal: composedSignal, cleanup } = createTimeoutController(
      timeout,
      signal,
    );
    requestConfig.signal = composedSignal;

    try {
      return await executeRequest(url, requestConfig);
    } catch (error) {
      lastError = normalizeRequestExecutionError(error);

      if (signal?.aborted || !shouldAttemptRetry(attempt, retries, lastError)) {
        break;
      }

      await sleep(calculateBackoffDelay(retryDelay, attempt));
    } finally {
      cleanup();
    }
  }

  // Preserve typed HTTP and timeout failures after their retry budget is exhausted.
  if (lastError instanceof APIError || lastError instanceof TimeoutError) {
    throw lastError;
  }

  throw new NetworkError(
    lastError ? lastError.message : 'Network request failed',
  );
}
