/**
 * CoinMarketCap Fear & Greed Index Fetcher
 *
 * Fetches current market sentiment from CoinMarketCap API
 * Rate limited to 10 requests per minute (CoinMarketCap free tier)
 *
 * Data Source: CoinMarketCap API (v3/fear-and-greed/latest)
 */

import { RATE_LIMITS } from '../../config/database.js';
import { BaseApiFetcher } from '../../core/fetchers/baseApiFetcher.js';
import {
  type CoinMarketCapFearGreedResponse,
  type SentimentData,
} from '../../modules/sentiment/schema.js';
import { APIError } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { serializeError } from './errorSerializer.js';
import {
  normalizeSentimentData,
  validateAndExtractSentimentEntry,
} from './responseParser.js';

export type {
  CoinMarketCapFearGreedResponse,
  SentimentData,
} from '../../modules/sentiment/schema.js';

interface FearGreedConfig {
  apiKey?: string;
  apiUrl?: string;
}

export class FearGreedFetcher extends BaseApiFetcher {
  private static readonly BASE_URL = 'https://pro-api.coinmarketcap.com';
  private static readonly ENDPOINT = '/v3/fear-and-greed/latest';
  private static readonly SOURCE_NAME = 'coinmarketcap';
  /* v8 ignore next 3 -- production rate limit path not reachable in test env */
  private static readonly RATE_LIMIT_MS =
    process.env['NODE_ENV'] === 'test'
      ? 0
      : RATE_LIMITS.COINMARKETCAP_DELAY_MS || 6000;

  private readonly apiKey: string;

  constructor(config?: FearGreedConfig) {
    const baseUrl =
      config?.apiUrl ??
      process.env['COINMARKETCAP_API_URL'] ??
      FearGreedFetcher.BASE_URL;
    super(baseUrl, FearGreedFetcher.RATE_LIMIT_MS);

    this.apiKey = config?.apiKey ?? process.env['COINMARKETCAP_API_KEY'] ?? '';

    if (!this.apiKey) {
      logger.warn(
        'FearGreedFetcher initialized without API key - requests will fail',
      );
    } else {
      logger.info('FearGreedFetcher initialized with CoinMarketCap API key');
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      'X-CMC_PRO_API_KEY': this.apiKey,
      Accept: 'application/json',
    };
  }

  async fetchCurrentSentiment(): Promise<SentimentData> {
    try {
      const url = `${this.baseUrl}${FearGreedFetcher.ENDPOINT}`;
      logger.info('Fetching Fear & Greed Index from CoinMarketCap', { url });

      const response =
        await this.fetchWithRetry<CoinMarketCapFearGreedResponse>(
          url,
          { headers: this.buildHeaders() },
          3,
          1000,
        );

      const sentimentEntry = validateAndExtractSentimentEntry(response);
      const normalizedData = normalizeSentimentData(
        sentimentEntry,
        FearGreedFetcher.SOURCE_NAME,
      );

      logger.info('Successfully fetched sentiment data from CoinMarketCap', {
        value: normalizedData.value,
        classification: normalizedData.classification,
        timestamp: new Date(normalizedData.timestamp * 1000).toISOString(),
        creditsUsed: response.status.credit_count,
      });

      return normalizedData;
    } catch (error) {
      return this.handleFetchCurrentSentimentError(error);
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      if (!this.apiKey) {
        return {
          status: 'unhealthy',
          details: 'CoinMarketCap API key not configured',
        };
      }

      const sentimentData = await this.fetchCurrentSentiment();
      const now = Math.floor(Date.now() / 1000);
      const dataAge = now - sentimentData.timestamp;
      const maxAge = 24 * 60 * 60;

      if (dataAge > maxAge) {
        return {
          status: 'unhealthy',
          details: `Sentiment data is stale (${Math.floor(dataAge / 3600)} hours old)`,
        };
      }

      return {
        status: 'healthy',
        details: `Current sentiment: ${sentimentData.value} (${sentimentData.classification}) - Source: CoinMarketCap`,
      };
    });
  }

  async fetchRawResponse(): Promise<CoinMarketCapFearGreedResponse> {
    const url = `${this.baseUrl}${FearGreedFetcher.ENDPOINT}`;
    return this.fetchJson<CoinMarketCapFearGreedResponse>(url, {
      headers: this.buildHeaders(),
    });
  }

  private handleFetchCurrentSentimentError(error: unknown): never {
    if (error instanceof APIError) {
      logger.error('CoinMarketCap API request failed', {
        error: error.message,
        statusCode: error.statusCode,
      });
      throw new Error(`CoinMarketCap API error: ${error.message}`);
    }

    logger.error(
      'Failed to fetch Fear & Greed Index from CoinMarketCap',
      serializeError(error),
    );
    throw error;
  }
}
