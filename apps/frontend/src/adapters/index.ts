/**
 * Data Adapters Public API
 *
 * Adapters transform raw API data into domain models.
 * Import adapters from this file for cleaner imports:
 *
 * @example
 * ```typescript
 * import { adaptWalletPortfolioData, adaptAllocationData } from '@/adapters';
 * ```
 */

// ============================================================================
// WALLET & PORTFOLIO ADAPTERS
// ============================================================================

export * from "./walletPortfolioDataAdapter";

// ============================================================================
// PORTFOLIO SUB-ADAPTERS
// ============================================================================

export * from "./portfolio/allocationAdapter";
export * from "./portfolio/regimeAdapter";
export * from "./portfolio/sentimentAdapter";
