/**
 * Comprehensive Formatting Utilities
 * @module utils/formatters
 */

import { formatCurrency, formatNumber } from './formatting/currencyNumber';
import { formatChartDate } from './formatting/dateChart';
import {
  calculateDataFreshness,
  formatRelativeTime,
} from './formatting/freshness';

export { type AddressFormatOptions, formatAddress } from './formatting/address';
export {
  type CurrencyFormatOptions,
  formatCurrency,
  formatNumber,
  type NumberFormatOptions,
} from './formatting/currencyNumber';
export {
  formatChartAxisDate,
  formatChartDate,
  formatCurrencyAxis,
  formatSentiment,
} from './formatting/dateChart';
export {
  calculateDataFreshness,
  type DataFreshness,
  formatRelativeTime,
  type FreshnessState,
} from './formatting/freshness';

// =============================================================================
// UNIFIED API
// =============================================================================

export const formatters = {
  currency: (value: number) =>
    formatCurrency(Math.round(value), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
  currencyPrecise: formatCurrency,
  percent: (value: number, decimals = 1) => `${value.toFixed(decimals)}%`,
  chartDate: formatChartDate,
  number: formatNumber,
  dataFreshness: calculateDataFreshness,
  relativeTime: formatRelativeTime,
} as const;
