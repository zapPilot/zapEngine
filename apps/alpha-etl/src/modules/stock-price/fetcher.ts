/**
 * Alpha Vantage API Fetcher
 *
 * Fetches S&P500 (SPY ETF) daily price data from Alpha Vantage's
 * TIME_SERIES_DAILY_ADJUSTED endpoint.
 *
 * Data Source: Alpha Vantage API (free tier: 5 req/min, 25 req/day)
 * API Key: Required via environment ALPHA_VANTAGE_API_KEY
 */

import { env } from '../../config/environment.js';
import { BaseApiFetcher } from '../../core/fetchers/baseApiFetcher.js';
import {
  type AlphaVantageTimeSeriesResponse,
  AlphaVantageTimeSeriesSchema,
  type DailyStockPrice,
  isAlphaVantageError,
  type StockPriceData,
} from '../../modules/stock-price/schema.js';
import { APIError } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';

export type {
  DailyStockPrice,
  StockPriceData,
} from '../../modules/stock-price/schema.js';

interface AlphaVantageFetcherConfig {
  baseUrl?: string;
  rateLimitMs?: number;
}

export class AlphaVantageFetcher extends BaseApiFetcher {
  private static readonly DEFAULT_BASE_URL =
    'https://www.alphavantage.co/query';
  private static readonly SOURCE_NAME = 'alphavantage';
  private static readonly DEFAULT_SYMBOL = 'SPY';
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 2000;

  private apiKey: string;

  constructor(config?: AlphaVantageFetcherConfig) {
    const baseUrl =
      config?.baseUrl ??
      process.env['ALPHA_VANTAGE_API_URL'] ??
      AlphaVantageFetcher.DEFAULT_BASE_URL;

    const rateLimitMs = config?.rateLimitMs ?? 12000;

    super(baseUrl, rateLimitMs);

    this.apiKey =
      process.env['ALPHA_VANTAGE_API_KEY'] ?? env.ALPHA_VANTAGE_API_KEY ?? '';

    if (!this.apiKey) {
      logger.warn('Alpha Vantage API key not configured');
    }
  }

  async fetchLatestPrice(
    symbol = AlphaVantageFetcher.DEFAULT_SYMBOL,
  ): Promise<DailyStockPrice> {
    const endpoint = this.buildDailyEndpoint(symbol, 'compact');

    try {
      logger.info('Fetching latest stock price from Alpha Vantage', {
        symbol,
        endpoint: this.sanitizeEndpoint(endpoint),
      });

      const response =
        await this.fetchAlphaVantage<AlphaVantageTimeSeriesResponse>(endpoint);
      const priceData = this.parseDailyResponse(response, symbol);

      logger.info('Successfully fetched latest stock price', {
        symbol,
        date: priceData.date,
        price: priceData.priceUsd,
      });

      return priceData;
    } catch (error) {
      return this.handleFetchError(error, {
        symbol,
        endpoint: this.sanitizeEndpoint(endpoint),
        operation: 'latest',
      });
    }
  }

  async fetchFullHistory(
    symbol = AlphaVantageFetcher.DEFAULT_SYMBOL,
  ): Promise<StockPriceData[]> {
    const endpoint = this.buildDailyEndpoint(symbol, 'full');

    try {
      logger.info('Fetching full stock history from Alpha Vantage', {
        symbol,
        endpoint: this.sanitizeEndpoint(endpoint),
      });

      const response =
        await this.fetchAlphaVantage<AlphaVantageTimeSeriesResponse>(endpoint);
      const priceData = this.parseFullResponse(response, symbol);

      logger.info('Successfully fetched full stock history', {
        symbol,
        count: priceData.length,
      });

      return priceData;
    } catch (error) {
      return this.handleFetchError(error, {
        symbol,
        endpoint: this.sanitizeEndpoint(endpoint),
        operation: 'full',
      });
    }
  }

  private buildDailyEndpoint(
    symbol: string,
    outputSize: 'compact' | 'full',
  ): string {
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol,
      outputsize: outputSize,
      apikey: this.apiKey,
    });

    return `${this.baseUrl}?${params.toString()}`;
  }

  private sanitizeEndpoint(endpoint: string): string {
    if (!this.apiKey) {
      return endpoint;
    }
    return endpoint.replace(this.apiKey, 'REDACTED');
  }

  private async fetchAlphaVantage<T>(endpoint: string): Promise<T> {
    return this.fetchWithRetry<T>(
      endpoint,
      {},
      AlphaVantageFetcher.RETRY_ATTEMPTS,
      AlphaVantageFetcher.RETRY_DELAY_MS,
    );
  }

  private parseDailyResponse(
    response: AlphaVantageTimeSeriesResponse,
    symbol: string,
  ): DailyStockPrice {
    const parsed = AlphaVantageTimeSeriesSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error('Invalid Alpha Vantage response schema');
    }

    if (isAlphaVantageError(response)) {
      const errorMsg =
        response['Error Message'] ?? response.Note ?? 'Unknown error';
      throw new Error(`Alpha Vantage API error: ${errorMsg}`);
    }

    const timeSeries = response['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No time series data in Alpha Vantage response');
    }

    const dates = Object.keys(timeSeries).sort().reverse();
    if (dates.length === 0) {
      throw new Error('No data available for symbol');
    }

    const latestDate = dates[0]!;
    const latestData = timeSeries[latestDate]!;

    if (!latestData) {
      throw new Error(`No data for latest date ${latestDate}`);
    }

    const priceUsd = Number.parseFloat(latestData['5. adjusted close']);
    if (Number.isNaN(priceUsd)) {
      throw new Error(
        `Invalid price for ${latestDate}: ${latestData['5. adjusted close']}`,
      );
    }

    return {
      date: latestDate,
      priceUsd,
      symbol,
      source: AlphaVantageFetcher.SOURCE_NAME,
      timestamp: new Date(),
    };
  }

  private parseFullResponse(
    response: AlphaVantageTimeSeriesResponse,
    symbol: string,
  ): StockPriceData[] {
    const parsed = AlphaVantageTimeSeriesSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error('Invalid Alpha Vantage response schema');
    }

    if (isAlphaVantageError(response)) {
      const errorMsg =
        response['Error Message'] ?? response.Note ?? 'Unknown error';
      throw new Error(`Alpha Vantage API error: ${errorMsg}`);
    }

    const timeSeries = response['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No time series data in Alpha Vantage response');
    }

    const prices: StockPriceData[] = [];
    const sortedDates = Object.keys(timeSeries).sort();

    for (const date of sortedDates) {
      const dayData = timeSeries[date];
      if (!dayData) {
        continue;
      }

      const priceUsd = Number.parseFloat(dayData['5. adjusted close']);
      if (Number.isNaN(priceUsd)) {
        logger.warn('Skipping invalid price', {
          date,
          price: dayData['5. adjusted close'],
        });
        continue;
      }

      prices.push({
        priceUsd,
        timestamp: new Date(date),
        source: AlphaVantageFetcher.SOURCE_NAME,
        symbol,
      });
    }

    return prices;
  }

  async healthCheck(
    symbol = AlphaVantageFetcher.DEFAULT_SYMBOL,
  ): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    return wrapHealthCheck(async () => {
      if (!this.apiKey) {
        return {
          status: 'unhealthy',
          details: 'Alpha Vantage API key not configured',
        };
      }

      const priceData = await this.fetchLatestPrice(symbol);

      if (priceData.priceUsd < 100 || priceData.priceUsd > 2000) {
        return {
          status: 'unhealthy',
          details: `${symbol} price ${priceData.priceUsd} seems unrealistic`,
        };
      }

      return {
        status: 'healthy',
        details: `Current ${symbol} price: $${priceData.priceUsd.toFixed(2)} on ${priceData.date}`,
      };
    });
  }

  private handleFetchError(
    error: unknown,
    context: {
      symbol: string;
      endpoint: string;
      operation: 'latest' | 'full';
    },
  ): never {
    if (error instanceof APIError) {
      logger.error('Alpha Vantage API request failed', {
        error: error.message,
        statusCode: error.statusCode,
        symbol: context.symbol,
        operation: context.operation,
      });
      throw new Error(
        `Alpha Vantage API error for ${context.symbol}: ${error.message}`,
      );
    }

    logger.error('Failed to fetch stock price', {
      symbol: context.symbol,
      operation: context.operation,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
