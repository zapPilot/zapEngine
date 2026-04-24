/**
 * CoinGecko Schemas
 *
 * Zod schemas and TypeScript interfaces for CoinGecko API responses
 */

import { z } from 'zod';

// ============================================================================
// Schemas
// ============================================================================

/**
 * Zod schema for CoinGecko Simple Price API response validation
 */
export const CoinGeckoSimplePriceSchema = z.record(
  z.string(),
  z.object({
    usd: z.number(),
    usd_market_cap: z.number().optional().nullable(),
    usd_24h_vol: z.number().optional().nullable(),
  }),
);

/**
 * Zod schema for CoinGecko Historical Price API response validation
 */
export const CoinGeckoHistoricalSchema = z
  .object({
    id: z.string().optional(),
    symbol: z.string().optional(),
    name: z.string().optional(),
    market_data: z.object({
      current_price: z.object({
        usd: z.number(),
      }),
      market_cap: z
        .object({
          usd: z.number().optional().nullable(),
        })
        .optional(),
      total_volume: z
        .object({
          usd: z.number().optional().nullable(),
        })
        .optional(),
    }),
  })
  .passthrough();

// ============================================================================
// Interfaces
// ============================================================================

/**
 * CoinGecko API Response - Simple Price Endpoint
 * Endpoint: /simple/price?ids={tokenId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true
 *
 * Dynamic response structure where the key is the token ID (e.g., 'bitcoin', 'ethereum', 'solana')
 */
export type CoinGeckoSimplePriceResponse = Record<
  string,
  {
    usd: number;
    usd_market_cap?: number | null;
    usd_24h_vol?: number | null;
  }
>;

/**
 * CoinGecko API Response - Historical Price by Date
 * Endpoint: /coins/bitcoin/history?date=01-12-2024
 */
export interface CoinGeckoHistoricalResponse {
  id: string;
  symbol: string;
  name: string;
  market_data: {
    current_price: { usd: number };
    market_cap?: { usd?: number | null };
    total_volume?: { usd?: number | null };
  };
}

/**
 * Normalized token price data structure
 */
export interface TokenPriceData {
  priceUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  timestamp: Date;
  source: string;
  tokenSymbol: string;
  tokenId: string;
}
