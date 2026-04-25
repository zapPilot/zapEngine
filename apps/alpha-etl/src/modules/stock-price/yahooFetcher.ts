/**
 * Yahoo Finance API Fetcher
 *
 * Fetches S&P500 (SPY ETF) daily price data from Yahoo Finance
 *
 * Data Source: Yahoo Finance historical() endpoint
 * No API key required
 */

import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

import {
  type StockPriceData,
  type YahooFinanceHistoricalData,
  YahooFinanceHistoricalSchema,
} from '../../modules/stock-price/schema.js';
import { logger } from '../../utils/logger.js';

export type { StockPriceData } from '../../modules/stock-price/schema.js';

export interface YahooFinanceFetcherConfig {
  rateLimitMs?: number;
}

export class YahooFinanceFetcher {
  private static readonly DEFAULT_SYMBOL = 'SPY';
  private static readonly SOURCE_NAME = 'yahoo-finance';
  private static readonly DEFAULT_RATE_LIMIT_MS = 1000;

  private rateLimitMs: number;

  constructor(config?: YahooFinanceFetcherConfig) {
    this.rateLimitMs = config?.rateLimitMs ?? YahooFinanceFetcher.DEFAULT_RATE_LIMIT_MS;
  }

  async fetchLatestPrice(
    symbol = YahooFinanceFetcher.DEFAULT_SYMBOL,
  ): Promise<{
    date: string;
    priceUsd: number;
    symbol: string;
    source: string;
    timestamp: Date;
  }> {
    try {
      logger.info('Fetching latest stock price from Yahoo Finance', { symbol });

      const quote = await this.rateLimitCall(() => yahooFinance.quote(symbol)) as {
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };

      if (!quote || typeof quote.regularMarketPrice !== 'number') {
        throw new Error(`No quote data for ${symbol}`);
      }

      const priceUsd = quote.regularMarketPrice;
      const ts = quote.regularMarketTime ?? Math.floor(Date.now() / 1000);
      const date = String(new Date(ts * 1000).toISOString().slice(0, 10));

      logger.info('Successfully fetched latest stock price', {
        symbol,
        price: priceUsd,
        date,
      });

      return {
        date,
        priceUsd,
        symbol,
        source: YahooFinanceFetcher.SOURCE_NAME,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to fetch latest stock price', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async fetchFullHistory(
    symbol = YahooFinanceFetcher.DEFAULT_SYMBOL,
    period1?: Date,
  ): Promise<StockPriceData[]> {
    try {
      const startDate = period1 ?? new Date('2000-01-01');
      logger.info('Fetching full stock history from Yahoo Finance', {
        symbol,
        startDate: startDate.toISOString(),
      });

      const result = await this.rateLimitCall(() =>
        yahooFinance.historical(symbol, {
          period1: startDate,
          period2: new Date(),
        }),
      );

      const parsed = YahooFinanceHistoricalSchema.array().safeParse(result);

      if (!parsed.success) {
        logger.error('Failed to parse Yahoo Finance response', {
          symbol,
          error: parsed.error.message,
        });
        throw new Error('Invalid Yahoo Finance response schema');
      }

      const prices: StockPriceData[] = parsed.data.map((day: YahooFinanceHistoricalData) => ({
        priceUsd: day.adjClose,
        timestamp: day.date,
        source: YahooFinanceFetcher.SOURCE_NAME,
        symbol,
      }));

      logger.info('Successfully fetched full stock history', {
        symbol,
        count: prices.length,
      });

      return prices;
    } catch (error) {
      logger.error('Failed to fetch full stock history', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async healthCheck(symbol = YahooFinanceFetcher.DEFAULT_SYMBOL): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    try {
      await this.rateLimitCall(() => YahooFinance.quote(symbol));
      return { status: 'healthy', details: 'Yahoo Finance API accessible' };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async rateLimitCall<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs));
    return fn();
  }
}