import {
  type AllocationCategoryKey,
  getAllocationCategoryForToken,
} from '@/lib/domain/allocationCategories';

/**
 * Asset category keys matching portfolio.ts aliases.
 */
export type AssetCategoryKey = 'btc' | 'eth' | 'stablecoin' | 'altcoin';

const ALLOCATION_TO_ASSET_CATEGORY: Record<
  AllocationCategoryKey,
  AssetCategoryKey
> = {
  btc: 'btc',
  eth: 'eth',
  stable: 'stablecoin',
  alt: 'altcoin',
};

// Unused type removed: CategoryFilter

/**
 * Maps a token symbol to its asset category
 *
 * @param symbol - Token symbol (case-insensitive)
 * @returns The asset category key, derived from the shared allocation taxonomy
 *
 * @example
 * getCategoryForToken("WBTC") // "btc"
 * getCategoryForToken("usdc") // "stablecoin"
 * getCategoryForToken("LINK") // "altcoin"
 */
export function getCategoryForToken(symbol: string): AssetCategoryKey {
  return ALLOCATION_TO_ASSET_CATEGORY[getAllocationCategoryForToken(symbol)];
}

// Unused exports removed: filterTokensByCategory, getTokenCountsByCategory
