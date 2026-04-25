/**
 * Yahoo Finance Schemas
 *
 * Zod schemas and TypeScript interfaces for Yahoo Finance API responses
 * Stock price data source: historical() endpoint
 */

import { z } from 'zod';

/**
 * Zod schema for Yahoo Finance historical data point
 */
export const YahooFinanceHistoricalSchema = z
  .object({
    date: z.date(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    adjClose: z.number(),
    volume: z.number(),
    symbol: z.string().optional(),
  })
  .passthrough();

export type YahooFinanceHistoricalData = z.infer<typeof YahooFinanceHistoricalSchema>;

/**
 * Daily stock price data (single day)
 */
export interface DailyStockPrice {
  date: string;
  priceUsd: number;
  symbol: string;
  source: string;
  timestamp: Date;
}

/**
 * Historical stock price data point (for backfill)
 */
export interface StockPriceData {
  priceUsd: number;
  timestamp: Date;
  source: string;
  symbol: string;
}
