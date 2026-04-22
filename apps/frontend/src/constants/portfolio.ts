/**
 * Portfolio Constants
 *
 * Consolidated constants for portfolio management and display configuration.
 * Single source of truth for asset categories, colors, and labels.
 */

import { ALLOCATION_CATEGORIES } from '@/lib/domain/allocationCategories';

/**
 * Asset Category Keys
 * Type-safe keys for all supported asset categories
 */
type AssetCategoryKey = 'btc' | 'eth' | 'stablecoin' | 'altcoin';

/**
 * Asset Category Definition
 * Complete metadata for each asset category
 */
interface AssetCategory {
  /** Unique identifier key */
  key: AssetCategoryKey;
  /** Full display name */
  label: string;
  /** Short display name/symbol */
  shortLabel: string;
  /** Chart-optimized color (hex) - high contrast for data visualization */
  chartColor: string;
  /** Brand/identity color (hex) - matches asset branding */
  brandColor: string;
  /** Tailwind CSS color class for text (e.g., 'text-amber-400') */
  tailwindColor: string;
}

/**
 * Comprehensive Asset Categories
 * Single source of truth for all asset category metadata
 */
export const ASSET_CATEGORIES: Record<AssetCategoryKey, AssetCategory> = {
  btc: {
    key: 'btc',
    label: ALLOCATION_CATEGORIES.btc.label,
    shortLabel: ALLOCATION_CATEGORIES.btc.shortLabel,
    chartColor: ALLOCATION_CATEGORIES.btc.color,
    brandColor: ALLOCATION_CATEGORIES.btc.color,
    tailwindColor: ALLOCATION_CATEGORIES.btc.tailwindColor,
  },
  eth: {
    key: 'eth',
    label: ALLOCATION_CATEGORIES.eth.label,
    shortLabel: ALLOCATION_CATEGORIES.eth.shortLabel,
    chartColor: ALLOCATION_CATEGORIES.eth.color,
    brandColor: ALLOCATION_CATEGORIES.eth.color,
    tailwindColor: ALLOCATION_CATEGORIES.eth.tailwindColor,
  },
  stablecoin: {
    key: 'stablecoin',
    label: ALLOCATION_CATEGORIES.stable.label,
    shortLabel: ALLOCATION_CATEGORIES.stable.shortLabel,
    chartColor: ALLOCATION_CATEGORIES.stable.color,
    brandColor: ALLOCATION_CATEGORIES.stable.color,
    tailwindColor: ALLOCATION_CATEGORIES.stable.tailwindColor,
  },
  altcoin: {
    key: 'altcoin',
    label: ALLOCATION_CATEGORIES.alt.label,
    shortLabel: ALLOCATION_CATEGORIES.alt.shortLabel,
    chartColor: ALLOCATION_CATEGORIES.alt.color,
    brandColor: ALLOCATION_CATEGORIES.alt.color,
    tailwindColor: ALLOCATION_CATEGORIES.alt.tailwindColor,
  },
} as const;

/**
 * Chart-specific color map
 * Optimized colors for data visualization
 */
export const CHART_COLORS: Record<AssetCategoryKey, string> = {
  btc: ASSET_CATEGORIES.btc.chartColor,
  eth: ASSET_CATEGORIES.eth.chartColor,
  stablecoin: ASSET_CATEGORIES.stablecoin.chartColor,
  altcoin: ASSET_CATEGORIES.altcoin.chartColor,
} as const;

// Portfolio Display Configuration
export const PORTFOLIO_CONFIG = {
  // Chart configuration
  DEFAULT_PIE_CHART_SIZE: 250,
  DEFAULT_PIE_CHART_STROKE_WIDTH: 8,

  // Display configuration
  CURRENCY_LOCALE: 'en-US',
  CURRENCY_CODE: 'USD',
  HIDDEN_BALANCE_PLACEHOLDER: '••••••••',
  HIDDEN_NUMBER_PLACEHOLDER: '••••',

  // Animation delays
  ANIMATION_DELAY_STEP: 0.1,
  CATEGORY_ANIMATION_DURATION: 0.3,
} as const;
