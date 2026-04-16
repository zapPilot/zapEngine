import { z } from "zod";

import { createValidator } from "@/schemas/schemaUtils";

/**
 * Zod schemas for regime history API responses
 *
 * These schemas provide runtime validation for regime transition data,
 * ensuring type safety and catching malformed data before it causes runtime errors.
 *
 * Regime history provides contextual information about market regime transitions
 * to enable directional portfolio strategy visualization.
 */

// ============================================================================
// REGIME HISTORY SCHEMAS
// ============================================================================

/**
 * Valid regime identifiers
 *
 * - ef: Extreme Fear (0-24)
 * - f: Fear (25-44)
 * - n: Neutral (45-55)
 * - g: Greed (56-75)
 * - eg: Extreme Greed (76-100)
 */
const regimeIdSchema = z.enum(["ef", "f", "n", "g", "eg"]);

/**
 * Direction type indicates the strategy transition pattern
 *
 * - fromLeft: Transitioning from a more bearish regime (lower fear/greed index)
 * - fromRight: Transitioning from a more bullish regime (higher fear/greed index)
 * - default: No clear directional context (first load, invalid data, etc.)
 */
const directionTypeSchema = z.enum(["fromLeft", "fromRight", "default"]);

/**
 * Duration information for time spent in current regime
 */
/**
 * Duration information for time spent in current regime
 */
const durationInfoSchema = z
  .object({
    /** Number of hours in current regime */
    hours: z.number().nonnegative(),
    /** Number of days in current regime */
    days: z.number().nonnegative(),
    /** Human-readable duration string (e.g., "2 days, 5 hours") */
    human_readable: z.string(),
  })
  .nullable();

/**
 * A single regime transition record
 *
 * Tracks when a regime change occurred and what the new regime became.
 */
const regimeTransitionSchema = z.object({
  /** Unique identifier for this transition record */
  id: z.string(),
  /** The regime that this transition moved TO */
  to_regime: regimeIdSchema,
  /** The regime that this transition moved FROM (null for first record) */
  from_regime: regimeIdSchema.nullable().optional(),
  /** ISO 8601 timestamp of when this regime was activated */
  transitioned_at: z.string(),
  /** Optional Fear & Greed Index value at time of transition (0-100) */
  sentiment_value: z.number().int().min(0).max(100).optional(),
  /** Duration of the previous regime in hours */
  duration_hours: z.number().nullable().optional(),
});

/**
 * Complete regime history API response from /api/v2/market/regime/history
 *
 * Provides current regime, previous regime, and transition direction
 * for contextual portfolio strategy visualization.
 */
const regimeHistoryResponseSchema = z.object({
  /** Current active regime transition */
  current: regimeTransitionSchema,
  /** Previous regime transition (null if no history available) */
  previous: regimeTransitionSchema.nullable(),
  /** Computed direction based on regime transition pattern */
  direction: directionTypeSchema,
  /** Duration information for time spent in current regime */
  duration_in_current: durationInfoSchema,
  /** Array of recent regime transitions (includes current and previous) */
  transitions: z.array(regimeTransitionSchema),
  /** ISO 8601 timestamp when this response was generated */
  timestamp: z.string(),
  /** Whether this response was served from cache */
  cached: z.boolean().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type inference from schemas
 * These types are automatically generated from the Zod schemas
 */
export type RegimeId = z.infer<typeof regimeIdSchema>;
export type DirectionType = z.infer<typeof directionTypeSchema>;
export type DurationInfo = z.infer<typeof durationInfoSchema>;
export type RegimeTransition = z.infer<typeof regimeTransitionSchema>;
export type RegimeHistoryResponse = z.infer<typeof regimeHistoryResponseSchema>;

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

export const validateRegimeHistoryResponse = createValidator(
  regimeHistoryResponseSchema
);
