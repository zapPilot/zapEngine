/**
 * Core HTTP Request Handler
 * Main request execution logic with retry support
 */

import { createTimeoutController, isAbortError } from "./abort-control";
import {
  hasHeaders,
  parseCacheControlForHint,
  syncQueryCacheDefaultsFromHint,
} from "./cache-control";
import {
  HTTP_CONFIG,
  type HttpRequestConfig,
  type ResponseTransformer,
} from "./config";
import {
  APIError,
  NetworkError,
  parseErrorResponse,
  TimeoutError,
  toError,
} from "./errors";
import { calculateBackoffDelay, delay, shouldAttemptRetry } from "./retry";

function createRequestConfig(config: HttpRequestConfig): RequestInit {
  const { method = "GET", headers = {}, body } = config;
  const requestConfig: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body && method !== "GET") {
    requestConfig.body = JSON.stringify(body);
  }

  return requestConfig;
}

function normalizeRequestExecutionError(error: unknown): Error {
  const normalizedError = toError(error);
  if (normalizedError instanceof APIError) {
    throw normalizedError;
  }

  if (isAbortError(normalizedError)) {
    throw new TimeoutError();
  }

  return normalizedError;
}

async function executeRequest<T>(
  url: string,
  requestInit: RequestInit,
  transformer?: ResponseTransformer<T>
): Promise<T> {
  const response = await fetch(url, requestInit);

  // Some test doubles provide a minimal Response-like object without headers.
  const cacheControlHeader = hasHeaders(response)
    ? ((response as Response).headers?.get?.("cache-control") ?? undefined)
    : undefined;

  const cacheHint = parseCacheControlForHint(cacheControlHeader);
  if (cacheHint) {
    syncQueryCacheDefaultsFromHint(cacheHint);
  }

  if (!response.ok) {
    const errorData = await parseErrorResponse(response);
    throw new APIError(
      errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData.code,
      errorData.details
    );
  }

  const data = await response.json();
  return transformer ? transformer(data) : data;
}

/**
 * Core HTTP request function with retry logic and error handling
 */
export async function httpRequest<T = unknown>(
  url: string,
  config: HttpRequestConfig = {},
  transformer?: ResponseTransformer<T>
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
    const { signal: composedSignal, cleanup } = createTimeoutController(
      timeout,
      signal
    );
    requestConfig.signal = composedSignal;

    try {
      return await executeRequest(url, requestConfig, transformer);
    } catch (error) {
      lastError = normalizeRequestExecutionError(error);

      if (!shouldAttemptRetry(attempt, retries, lastError)) {
        break;
      }

      await delay(calculateBackoffDelay(retryDelay, attempt));
    } finally {
      cleanup();
    }
  }

  // If we get here, all retries failed
  throw new NetworkError(
    lastError ? lastError.message : "Network request failed"
  );
}
