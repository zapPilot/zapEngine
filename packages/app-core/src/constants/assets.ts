/**
 * Asset color mapping for consistent visualization across components
 */
import { ALLOCATION_CATEGORIES } from '@core/lib/domain/allocationCategories';

export const ASSET_COLORS = {
  BTC: ALLOCATION_CATEGORIES.btc.color,
  ETH: ALLOCATION_CATEGORIES.eth.color,
  SPY: ALLOCATION_CATEGORIES.spy.color,
  SOL: '#14F195',
  ALT: ALLOCATION_CATEGORIES.alt.color,
  USDC: '#2775CA',
  USDT: '#26A17B',
} as const;
