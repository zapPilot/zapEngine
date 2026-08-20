import { sleep } from '@zapengine/types/shared';

import { RATE_LIMITS } from '../../config/constants.js';
import { APIError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';

export interface RequestStats {
  requestCount: number;
  lastRequestTime: number;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  timeout?: number;
}

export abstract class BaseApiFetcher {
  protected baseUrl: string;
  protected requestCount = 0;
  protected lastRequestTime = 0;
  protected readonly rateLimitDelay: number;
  protected readonly userAgent = 'alpha-etl/1.0.0';

  constructor(
    baseUrl: string,
    rateLimitDelay: number = RATE_LIMITS.DEBANK_DELAY_MS,
  ) {
    this.baseUrl = baseUrl;
    this.rateLimitDelay = rateLimitDelay;
  }

  // Real provider delays would make the unit suite sleep for seconds per request.
  protected static resolveRateLimitDelay(productionDelayMs: number): number {
    return process.env['NODE_ENV'] === 'test' ? 0 : productionDelayMs;
  }

  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug('Rate limiting API request', {
        fetcher: this.constructor.name,
        delay,
      });
      await sleep(delay);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  protected async fetchWithRateLimit(
    url: string,
    options: FetchOptions = {},
  ): Promise<Response> {
    await this.enforceRateLimit();

    const headers = this.buildRequestHeaders(options.headers);

    logger.debug('Making API request', {
      fetcher: this.constructor.name,
      url,
      requestCount: this.requestCount,
    });

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new APIError(
        `${response.status} ${response.statusText}`,
        response.status,
        url,
        this.constructor.name,
      );
    }

    return response;
  }

  protected async fetchJson<T>(
    url: string,
    options: FetchOptions = {},
  ): Promise<T> {
    const response = await this.fetchWithRateLimit(url, options);
    return response.json() as Promise<T>;
  }

  /**
   * Fetch JSON with retry + exponential backoff
   */
  protected async fetchWithRetry<T>(
    url: string,
    options: FetchOptions = {},
    maxRetries = 3,
    baseDelayMs = 1000,
  ): Promise<T> {
    const maxAttempts = maxRetries + 1;

    try {
      return await withRetry(() => this.fetchJson<T>(url, options), {
        maxAttempts,
        baseDelayMs,
        label: `Fetch ${url}`,
      });
    } catch (error) {
      throw this.toErrorObject(error);
    }
  }

  public getRequestStats(): RequestStats {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
    };
  }

  private buildRequestHeaders(
    customHeaders?: Record<string, string>,
  ): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Accept: 'application/json',
      ...customHeaders,
    };
  }

  protected toErrorObject(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  // Abstract method that subclasses must implement for health checks
  abstract healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }>;
}
