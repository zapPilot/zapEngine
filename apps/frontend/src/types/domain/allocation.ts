/**
 * Allocation Type Definitions - Single Source of Truth
 *
 * This module consolidates all allocation-related types with Zod schemas.
 * Two distinct allocation types exist for different use cases:
 *
 * 1. AllocationBreakdown - Portfolio/transaction operations (crypto/stable)
 * 2. RegimeAllocationBreakdown - Invest strategy display (spot/stable)
 *
 * @see Phase 8 - Type System Consolidation
 */

import { z } from 'zod';

// ============================================================================
// TRANSACTION ALLOCATION SCHEMA (Portfolio Operations)
// ============================================================================

/**
 * Schema for portfolio transaction allocations
 * Used in: deposit, withdraw, rebalance operations
 * Split: crypto (BTC, ETH, etc.) vs. stablecoins (USDC, USDT)
 */
export const allocationBreakdownSchema = z.object({
  crypto: z.number().min(0).max(100),
  stable: z.number().min(0).max(100),
  simplifiedCrypto: z
    .array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        value: z.number(),
        color: z.string().optional(),
      }),
    )
    .optional(),
});

// ============================================================================
// REGIME ALLOCATION SCHEMA (Strategy Display)
// ============================================================================

/**
 * Schema for regime strategy allocations
 * Used in: regime transitions, strategy visualization
 * Split: spot crypto and stablecoins
 */
export const regimeAllocationBreakdownSchema = z.object({
  spot: z.number().min(0).max(100),
  stable: z.number().min(0).max(100),
});

// ============================================================================
// TYPE INFERENCE FROM SCHEMAS
// ============================================================================

/**
 * Portfolio transaction allocation
 * @public
 */
export type AllocationBreakdown = z.infer<typeof allocationBreakdownSchema>;

/**
 * Regime strategy allocation
 * @public
 */
export type RegimeAllocationBreakdown = z.infer<
  typeof regimeAllocationBreakdownSchema
>;
