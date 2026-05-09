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
  type YahooFinanceChartQuote,
  YahooFinanceChartQuoteSchema,
  type YahooFinanceQuote,
  YahooFinanceQuoteSchema,
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
    this.rateLimitMs =
      config?.rateLimitMs ?? YahooFinanceFetcher.DEFAULT_RATE_LIMIT_MS;
  }

  async fetchLatestPrice(symbol = YahooFinanceFetcher.DEFAULT_SYMBOL): Promise<{
    date: string;
    priceUsd: number;
    symbol: string;
    source: string;
    timestamp: Date;
  }> {
    try {
      logger.info('Fetching latest stock price from Yahoo Finance', { symbol });

      const raw = await this.rateLimitCall(() => yahooFinance.quote(symbol));
      const parsed = YahooFinanceQuoteSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`No quote data for ${symbol}: ${parsed.error.message}`);
      }

      const quote: YahooFinanceQuote = parsed.data;
      const { regularMarketPrice: priceUsd, regularMarketTime } = quote;
      let marketDate = new Date();
      if (regularMarketTime instanceof Date) {
        marketDate = regularMarketTime;
      } else if (typeof regularMarketTime === 'number') {
        marketDate = new Date(regularMarketTime * 1000);
      }
      const date = marketDate.toISOString().slice(0, 10);

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
      this.logAndRethrow('Failed to fetch latest stock price', symbol, error);
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
        yahooFinance.chart(symbol, {
          period1: startDate,
          period2: new Date(),
          interval: '1d',
        }),
      );

      const parsed = YahooFinanceChartQuoteSchema.array().safeParse(
        result.quotes,
      );

      if (!parsed.success) {
        logger.error('Failed to parse Yahoo Finance response', {
          symbol,
          error: parsed.error.message,
        });
        throw new Error('Invalid Yahoo Finance response schema');
      }

      const prices: StockPriceData[] = parsed.data.flatMap(
        (day: YahooFinanceChartQuote) => {
          const price = day.adjclose ?? day.close;
          if (price === null) {
            return [];
          }
          return [
            {
              priceUsd: price,
              timestamp: day.date,
              source: YahooFinanceFetcher.SOURCE_NAME,
              symbol,
            },
          ];
        },
      );

      logger.info('Successfully fetched full stock history', {
        symbol,
        count: prices.length,
      });

      return prices;
    } catch (error) {
      this.logAndRethrow('Failed to fetch full stock history', symbol, error);
    }
  }

  async healthCheck(symbol = YahooFinanceFetcher.DEFAULT_SYMBOL): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    try {
      await this.rateLimitCall(() => yahooFinance.quote(symbol));
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

  private logAndRethrow(
    message: string,
    symbol: string,
    error: unknown,
  ): never {
    logger.error(message, {
      symbol,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
