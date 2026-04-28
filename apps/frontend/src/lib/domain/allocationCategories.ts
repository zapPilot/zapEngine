import { ASSET_SYMBOL_SETS } from '@/constants/assetSymbols';

export type AllocationCategoryKey = 'btc' | 'eth' | 'spy' | 'stable' | 'alt';

interface AllocationCategoryMeta {
  key: AllocationCategoryKey;
  label: string;
  shortLabel: string;
  color: string;
  tailwindColor: string;
}

export const ALLOCATION_CATEGORIES: Record<
  AllocationCategoryKey,
  AllocationCategoryMeta
> = {
  btc: {
    key: 'btc',
    label: 'Bitcoin',
    shortLabel: 'BTC',
    color: '#F7931A',
    tailwindColor: 'text-orange-400',
  },
  eth: {
    key: 'eth',
    label: 'Ethereum',
    shortLabel: 'ETH',
    color: '#627EEA',
    tailwindColor: 'text-indigo-400',
  },
  spy: {
    key: 'spy',
    label: 'S&P 500',
    shortLabel: 'SPY',
    color: '#16A34A',
    tailwindColor: 'text-green-500',
  },
  stable: {
    key: 'stable',
    label: 'Stablecoins',
    shortLabel: 'STABLE',
    color: '#2775CA',
    tailwindColor: 'text-blue-400',
  },
  alt: {
    key: 'alt',
    label: 'Altcoins',
    shortLabel: 'ALT',
    color: '#6B7280',
    tailwindColor: 'text-gray-400',
  },
} as const;

export function getAllocationCategoryForToken(
  symbol: string,
): AllocationCategoryKey {
  const normalized = symbol.toLowerCase();

  if (ASSET_SYMBOL_SETS.btc.has(normalized)) {
    return 'btc';
  }

  if (ASSET_SYMBOL_SETS.eth.has(normalized)) {
    return 'eth';
  }

  if (ASSET_SYMBOL_SETS.stablecoins.has(normalized)) {
    return 'stable';
  }

  return 'alt';
}
