/**
 * Yahoo Finance Schemas
 *
 * Zod schemas and TypeScript interfaces for Yahoo Finance API responses
 * Stock price data source: historical() endpoint
 */

import { z } from 'zod';

/**
 * Zod schema for a Yahoo Finance chart() quote (ChartResultArrayQuote shape).
 * Fields are nullable to match Yahoo's chart endpoint (the deprecated historical()
 * endpoint guaranteed numeric values; chart() does not).
 */
export const YahooFinanceChartQuoteSchema = z.object({
  date: z.date(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
  adjclose: z.number().nullable().optional(),
});

export type YahooFinanceChartQuote = z.infer<
  typeof YahooFinanceChartQuoteSchema
>;

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
