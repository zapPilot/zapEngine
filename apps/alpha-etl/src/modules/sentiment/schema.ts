/**
 * CoinMarketCap Schemas
 *
 * Zod schemas and TypeScript interfaces for CoinMarketCap API responses
 */

import { z } from 'zod';

import {
  normalizeSentimentClassification,
  SENTIMENT_CLASSIFICATIONS,
} from '../../utils/sentimentUtils.js';

// ============================================================================
// Schemas
// ============================================================================

/**
 * Zod schema for CoinMarketCap API response validation
 */
export const CoinMarketCapFearGreedSchema = z.object({
  status: z.object({
    timestamp: z.string().optional(),
    error_code: z.string(),
    error_message: z.string().nullable(),
    elapsed: z.number().optional(),
    credit_count: z.number().optional(),
  }),
  data: z.unknown().optional(),
});

/**
 * Valid sentiment classifications
 * Re-exported from sentimentUtils for convenience and backward compatibility
 */
export { SENTIMENT_CLASSIFICATIONS } from '../../utils/sentimentUtils.js';

/**
 * Zod schema for sentiment data validation
 */
export const SentimentDataSchema = z.object({
  value: z
    .number()
    .int('Sentiment value must be an integer')
    .min(0, 'Sentiment value must be >= 0')
    .max(100, 'Sentiment value must be <= 100'),
  classification: z
    .string()
    .transform(normalizeSentimentClassification)
    .pipe(
      z.enum(SENTIMENT_CLASSIFICATIONS, {
        error: () => 'Invalid classification value',
      }),
    ),
  timestamp: z
    .number()
    .int('Timestamp must be an integer')
    .positive('Timestamp must be positive'),
  source: z.string().min(1, 'Source is required'),
});

// ============================================================================
// Interfaces
// ============================================================================

/**
 * CoinMarketCap Fear & Greed Index API Response Format
 */
export interface CoinMarketCapFearGreedResponse {
  status: {
    timestamp?: string;
    error_code: string;
    error_message: string | null;
    elapsed?: number;
    credit_count?: number;
  };
  data?: CoinMarketCapFearGreedData | null;
}

export interface CoinMarketCapFearGreedData {
  value?: number | null;
  update_time?: string | null;
  value_classification?: string | null;
}

/**
 * Normalized sentiment data structure
 */
export interface SentimentData {
  value: number;
  classification: string;
  timestamp: number;
  source: string;
}
