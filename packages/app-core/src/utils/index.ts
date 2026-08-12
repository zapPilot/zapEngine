/**
 * Utility Functions Public API
 *
 * Centralized barrel export for all utility functions.
 * Import utilities from this file for cleaner imports:
 *
 * @example
 * ```typescript
 * import { formatCurrency, formatAddress, logger } from '@core/utils';
 * ```
 */

// ============================================================================
// FORMATTERS
// ============================================================================

export {
  calculateDataFreshness,
  type CompactTokenAmountOptions,
  type DataFreshness,
  formatAddress,
  formatChartAxisDate,
  formatChartDate,
  formatCompactTokenAmount,
  formatCurrency,
  formatCurrencyAxis,
  formatNumber,
  formatRelativeTime,
  formatSentiment,
  formatters,
  type FreshnessState,
} from './formatters';

// ============================================================================
// LOGGING
// ============================================================================

export { logger, walletLogger } from './logger';

// ============================================================================
// VALIDATION
// ============================================================================

export { validateEmail, validateNewWallet } from './walletValidation';

// ============================================================================
// MATH UTILITIES
// ============================================================================

export * from './mathUtils';

// ============================================================================
// ERROR UTILITIES
// ============================================================================

export { extractErrorMessage } from '@core/lib/errors';

// ============================================================================
// CHART UTILITIES
// ============================================================================

export * from './chartHoverUtils';
