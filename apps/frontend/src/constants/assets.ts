/**
 * Asset color mapping for consistent visualization across components
 */
import { ALLOCATION_CATEGORIES } from "@/lib/domain/allocationCategories";

export const ASSET_COLORS = {
  BTC: ALLOCATION_CATEGORIES.btc.color,
  ETH: ALLOCATION_CATEGORIES.eth.color,
  SOL: "#14F195",
  ALT: ALLOCATION_CATEGORIES.alt.color,
  USDC: "#2775CA",
  USDT: "#26A17B",
} as const;

/**
 * Unified 4-category color scheme for allocation bars.
 *
 * This provides a consistent color palette across all allocation visualizations:
 * - Dashboard (PortfolioComposition)
 * - Strategy (AllocationComparison)
 * - Backtesting (BacktestTooltip)
 */
export const UNIFIED_COLORS = {
  BTC: ALLOCATION_CATEGORIES.btc.color,
  ETH: ALLOCATION_CATEGORIES.eth.color,
  STABLE: ALLOCATION_CATEGORIES.stable.color,
  ALT: ALLOCATION_CATEGORIES.alt.color,
} as const;

/**
 * Bar opacity settings for allocation visualizations.
 * High opacity ensures vibrant colors on dark backgrounds.
 */
const BAR_OPACITY = {
  TOP: "E6", // 90% - Top of gradient
  BOTTOM: "BF", // 75% - Bottom of gradient
  BORDER: "4D", // 30% - Subtle border
} as const;

interface BarStyle {
  background: string;
  borderColor: string;
  boxShadow: string;
}

/**
 * Generate inline styles for allocation bar segments.
 * Creates a "glass" effect with vertical gradient and subtle bevel.
 * @param color - Base color hex (e.g., ASSET_COLORS.BTC)
 */
export function getBarStyle(color: string): BarStyle {
  return {
    background: `linear-gradient(180deg, ${color}${BAR_OPACITY.TOP} 0%, ${color}${BAR_OPACITY.BOTTOM} 100%)`,
    borderColor: `${color}${BAR_OPACITY.BORDER}`,
    // Subtle inner highlight for 3D depth
    boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.15)`,
  };
}
