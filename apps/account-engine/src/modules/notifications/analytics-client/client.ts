/**
 * HTTP transport for the analytics-engine API.
 *
 * Handles fetch, retries, timeout, error mapping, and URL resolution.
 * Response-shape normalisation is delegated to ./mappers.
 */

import { ANALYTICS_CONFIG } from '../../../common/constants';
import { ServiceLayerException } from '../../../common/exceptions';
import { HttpStatus } from '../../../common/http';
import { Logger } from '../../../common/logger';
import { getErrorMessage, UrlValidator } from '../../../common/utils';
import { ConfigService } from '../../../config/config.service';
import { PortfolioNotFoundError } from '../errors/portfolio-not-found.error';
import { DailySuggestionData } from '../interfaces/daily-suggestion.interface';
import { PortfolioResponse } from '../interfaces/portfolio-response.interface';
import { PortfolioTrendResponse } from '../interfaces/portfolio-trend.interface';
import { EmailMetrics } from '../template.service';
import {
  normalizeDailySuggestionResponse,
  transformToEmailMetrics,
} from './mappers';

export class AnalyticsClientService {
  private readonly logger = new Logger(AnalyticsClientService.name);
  private readonly analyticsEngineUrl: string;
  private readonly portfolioTrendsBaseUrl: string;

  /* istanbul ignore next -- DI constructor */
  constructor(private configService: ConfigService) {
    const configuredAnalyticsEngineUrl =
      this.configService.get<string>('ANALYTICS_ENGINE_URL') ?? '';
    this.analyticsEngineUrl = UrlValidator.normalizeLoopbackUrl(
      configuredAnalyticsEngineUrl,
    );

    // Validate environment variable is loaded
    if (!this.analyticsEngineUrl) {
      const error =
        'ANALYTICS_ENGINE_URL environment variable is not configured';
      this.logger.error(error);
      throw new Error(error);
    }

    this.portfolioTrendsBaseUrl = this.resolvePortfolioTrendsBaseUrl(
      this.analyticsEngineUrl,
    );

    if (configuredAnalyticsEngineUrl !== this.analyticsEngineUrl) {
      this.logger.log(
        `Analytics Engine URL configured: ${configuredAnalyticsEngineUrl} -> ${this.analyticsEngineUrl}`,
      );
    } else {
      this.logger.log(
        `Analytics Engine URL configured: ${this.analyticsEngineUrl}`,
      );
    }
  }

  async getPortfolioData(userId: string): Promise<PortfolioResponse> {
    return this.fetchFromAnalytics<PortfolioResponse>(
      `/api/v2/portfolio/${userId}/landing`,
      'portfolio data',
      userId,
    );
  }

  async getDailySuggestion(userId: string): Promise<DailySuggestionData> {
    // Daily suggestion occasionally has a cold-path spike on the first upstream call
    // (~13-14s observed) before subsequent requests drop below 1s.
    const response = await this.fetchFromAnalytics<unknown>(
      `/api/v3/strategy/daily-suggestion/${userId}`,
      'daily suggestion',
      userId,
      {
        retryOnTimeout: true,
        timeoutMs: ANALYTICS_CONFIG.DAILY_SUGGESTION_REQUEST_TIMEOUT_MS,
      },
    );

    return normalizeDailySuggestionResponse(response);
  }

  private async fetchFromAnalytics<T>(
    path: string,
    label: string,
    userId: string,
    options?: {
      baseUrl?: string;
      params?: Record<string, unknown>;
      retryOnTimeout?: boolean;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const base = UrlValidator.normalizeLoopbackUrl(
      options?.baseUrl ?? this.analyticsEngineUrl,
    );
    const maxAttempts = options?.retryOnTimeout ? 2 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      this.logger.log(`Fetching ${label} for user: ${userId} from ${base}`);

      try {
        const response = await this.fetchJson<T>(`${base}${path}`, {
          timeoutMs: options?.timeoutMs,
          params: options?.params,
        });

        this.logger.log(
          `Successfully retrieved ${label} for user: ${userId} from ${base} in ${Date.now() - startedAt}ms`,
        );
        return response;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - startedAt;

        if (attempt < maxAttempts && this.isRetryableTimeoutError(error)) {
          this.logger.warn(
            `Timed out fetching ${label} for user ${userId} from ${base} after ${elapsedMs}ms; retrying once`,
          );
          continue;
        }

        this.logger.error(
          `Failed to get ${label} for user ${userId} from ${base} after ${elapsedMs}ms:`,
          error,
        );
        this.handleAnalyticsError(error, userId, label);
      }
    }

    /* v8 ignore next -- all loop paths call handleAnalyticsError (which throws) before reaching here */
    this.handleAnalyticsError(lastError, userId, label);
  }

  private handleAnalyticsError(
    error: unknown,
    userId: string,
    operationLabel: string,
  ): never {
    if (error instanceof ServiceLayerException) {
      throw error;
    }

    const httpError = error as {
      response?: { status?: number };
      code?: string;
    };

    if (httpError.response?.status === 404) {
      throw new PortfolioNotFoundError(
        userId,
        `${operationLabel.charAt(0).toUpperCase() + operationLabel.slice(1)} not found for user: ${userId}. User may be newly onboarded or portfolio not yet indexed.`,
      );
    }
    if (httpError.response?.status === 500) {
      throw new ServiceLayerException(
        `Analytics engine internal error for user: ${userId}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (httpError.code === 'ECONNREFUSED') {
      throw new ServiceLayerException(
        'Cannot connect to analytics engine. Please check if the service is running.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new ServiceLayerException(
      `Failed to retrieve ${operationLabel}: ${getErrorMessage(error)}`,
    );
  }

  private isRetryableTimeoutError(error: unknown): boolean {
    // This app uses node `fetch` (undici), not axios — timeouts surface as
    // AbortError or with "timeout" / "timed out" in the message.
    const message = getErrorMessage(error).toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
  }

  async getPortfolioTrendData(userId: string): Promise<PortfolioTrendResponse> {
    return this.fetchFromAnalytics<PortfolioTrendResponse>(
      `/api/v2/analytics/${userId}/trend`,
      'portfolio trend data',
      userId,
      { baseUrl: this.portfolioTrendsBaseUrl, params: { days: 365 } },
    );
  }

  transformToEmailMetrics(portfolioData: PortfolioResponse): EmailMetrics {
    return transformToEmailMetrics(portfolioData);
  }

  async validateAnalyticsConnection(): Promise<{
    connected: boolean;
    message: string;
  }> {
    try {
      // Try to hit a health endpoint or the base URL
      await this.fetchJson(`${this.analyticsEngineUrl}/health`, {
        timeoutMs: ANALYTICS_CONFIG.HEALTH_CHECK_TIMEOUT_MS,
      });
      return {
        connected: true,
        message: 'Analytics engine connection successful',
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.warn('Analytics engine health check failed:', message);
      return {
        connected: false,
        message: `Analytics engine not available: ${message}`,
      };
    }
  }

  getAnalyticsEngineUrl(): string {
    return this.analyticsEngineUrl;
  }

  private resolvePortfolioTrendsBaseUrl(baseUrl: string): string {
    // `new URL(...)` below is the real guard; previously we double-validated
    // with `isValidHttpUrl` and made the catch unreachable.
    try {
      const url = new URL(UrlValidator.normalizeLoopbackUrl(baseUrl));

      if (url.port === String(ANALYTICS_CONFIG.DEFAULT_BASE_PORT)) {
        url.port = String(ANALYTICS_CONFIG.DEFAULT_TRENDS_PORT);
        return UrlValidator.normalizeLoopbackUrl(url.origin);
      }

      return UrlValidator.normalizeLoopbackUrl(UrlValidator.getOrigin(baseUrl));
    } catch (error) {
      this.logger.warn(
        'Unable to derive analytics trends URL from base; using default',
        getErrorMessage(error),
      );
      return UrlValidator.normalizeLoopbackUrl(
        `http://localhost:${ANALYTICS_CONFIG.DEFAULT_TRENDS_PORT}`,
      );
    }
  }

  private async fetchJson<T>(
    url: string,
    options?: {
      timeoutMs?: number;
      params?: Record<string, unknown>;
    },
  ): Promise<T> {
    const requestUrl = new URL(url);

    for (const [key, value] of Object.entries(options?.params ?? {})) {
      if (value !== undefined && value !== null) {
        requestUrl.searchParams.set(key, this.stringifyQueryValue(value));
      }
    }

    const response = await fetch(requestUrl.toString(), {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(
        options?.timeoutMs ?? ANALYTICS_CONFIG.REQUEST_TIMEOUT_MS,
      ),
    });

    if (!response.ok) {
      const error = new Error(
        `Request failed with status ${response.status}: ${await response.text()}`,
      ) as Error & { response?: { status: number }; code?: string };
      error.response = { status: response.status };
      throw error;
    }

    return (await response.json()) as T;
  }

  private stringifyQueryValue(value: unknown): string {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    /* v8 ignore next -- no current public method passes non-primitive params */
    return JSON.stringify(value);
  }
}
