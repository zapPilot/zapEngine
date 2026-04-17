import { APIError } from "../../utils/errors.js";
import { RATE_LIMITS } from "../../config/database.js";
import { logger } from "../../utils/logger.js";
import { sleep } from "../../utils/sleep.js";
import { withRetry } from "../../utils/retry.js";

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
  protected readonly userAgent = "alpha-etl/1.0.0";

  constructor(
    baseUrl: string,
    rateLimitDelay: number = RATE_LIMITS.DEBANK_DELAY_MS,
  ) {
    this.baseUrl = baseUrl;
    this.rateLimitDelay = rateLimitDelay;
  }

  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      logger.debug("Rate limiting API request", {
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

    logger.debug("Making API request", {
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
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
  ): Promise<T> {
    let attemptNum = 0;
    const maxAttempts = maxRetries + 1;

    try {
      return await withRetry(
        async () => {
          try {
            return await this.fetchJson<T>(url, options);
          } catch (error) {
            const errorMsg = this.toErrorObject(error).message;
            attemptNum++;
            if (attemptNum < maxAttempts) {
              this.logRetryAttempt(url, attemptNum, maxAttempts, errorMsg, 0);
            }
            throw error;
          }
        },
        {
          maxAttempts,
          baseDelayMs,
          label: `Fetch ${url}`,
        },
      );
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

  public resetStats(): void {
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  private buildRequestHeaders(
    customHeaders?: Record<string, string>,
  ): Record<string, string> {
    return {
      "User-Agent": this.userAgent,
      Accept: "application/json",
      ...customHeaders,
    };
  }

  protected toErrorObject(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private logRetryAttempt(
    url: string,
    attempt: number,
    maxAttempts: number,
    errorMessage: string,
    delayMs: number,
  ): void {
    logger.warn(`Fetch attempt ${attempt}/${maxAttempts} failed, retrying`, {
      fetcher: this.constructor.name,
      url,
      error: errorMessage,
      delayMs,
    });
  }

  // Abstract method that subclasses must implement for health checks
  abstract healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details?: string;
  }>;
}
