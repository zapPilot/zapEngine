import { z } from "zod";

import { createValidator } from "@/schemas/schemaUtils";

/**
 * Zod schemas for market sentiment API responses
 *
 * These schemas provide runtime validation for sentiment-related API responses,
 * ensuring type safety and catching malformed data before it causes runtime errors.
 */

// ============================================================================
// MARKET SENTIMENT SCHEMAS
// ============================================================================

/**
 * Schema for sentiment API response from /api/v2/market/sentiment
 *
 * The Fear & Greed Index ranges from 0-100:
 * - 0-24: Extreme Fear
 * - 25-44: Fear
 * - 45-55: Neutral
 * - 56-75: Greed
 * - 76-100: Extreme Greed
 */
export const sentimentApiResponseSchema = z.object({
  value: z.number().int().min(0).max(100),
  status: z.string(),
  timestamp: z.string(),
  source: z.string(),
  cached: z.boolean().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type inference from schemas
 * These types are automatically generated from the Zod schemas
 */
export type SentimentApiResponse = z.infer<typeof sentimentApiResponseSchema>;

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

export const validateSentimentApiResponse = createValidator(
  sentimentApiResponseSchema
);
