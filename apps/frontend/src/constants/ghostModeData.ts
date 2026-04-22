/**
 * Ghost Mode Preview Data
 *
 * Realistic mock portfolio data shown to unconnected users.
 * Creates an enticing preview of what their dashboard could look like.
 */

import type { AllocationConstituent } from '@/types/portfolio';

/** Shared crypto asset definitions to avoid duplication */
const PREVIEW_CRYPTO_ASSETS: AllocationConstituent[] = [
  {
    asset: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    value: 35,
    color: '#F7931A',
  },
  {
    asset: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    value: 20,
    color: '#627EEA',
  },
];

const PREVIEW_STABLE_ASSETS: AllocationConstituent[] = [
  {
    asset: 'usdt',
    symbol: 'USDT',
    name: 'Tether',
    value: 45,
    color: '#26A17B',
  },
];

/**
 * Preview data for Ghost Mode (unconnected users)
 * Shows realistic values to demonstrate dashboard capabilities
 */
export const GHOST_MODE_PREVIEW = {
  /** Preview balance - appealing but realistic amount */
  balance: 12450.0,

  /** Preview ROI - positive and achievable */
  roi: 18.5,
  roiChange7d: 2.3,
  roiChange30d: 8.7,

  /** Preview allocation - balanced portfolio */
  currentAllocation: {
    crypto: 55,
    stable: 45,
    simplifiedCrypto: PREVIEW_CRYPTO_ASSETS,
    constituents: {
      crypto: PREVIEW_CRYPTO_ASSETS,
      stable: PREVIEW_STABLE_ASSETS,
    },
  },

  /** Preview drift - slight rebalancing needed */
  delta: 3.2,

  /** Preview portfolio stats */
  positions: 4,
  protocols: 3,
  chains: 2,
} as const;
