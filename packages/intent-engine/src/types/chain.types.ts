import {
  CANONICAL_TOKEN_ADDRESSES,
  NATIVE_TOKEN_ADDRESS,
} from '@zapengine/types/shared';
import type { Address } from 'viem';

export const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

// Common tokens for POC (ETH/BTC rotation strategy). Addresses come from the
// canonical registry in @zapengine/types; only Base-bridged USDC is local
// because it is not a canonical asset.
export const TOKENS = {
  [CHAIN_IDS.ETHEREUM]: {
    ETH: NATIVE_TOKEN_ADDRESS,
    WETH: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.ETHEREUM].WETH,
    WBTC: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.ETHEREUM].WBTC,
    USDC: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.ETHEREUM].USDC,
    USDT: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.ETHEREUM].USDT,
  },
  [CHAIN_IDS.BASE]: {
    ETH: NATIVE_TOKEN_ADDRESS,
    WETH: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.BASE].WETH,
    USDC: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.BASE].USDC,
    cbBTC: CANONICAL_TOKEN_ADDRESSES[CHAIN_IDS.BASE].CBBTC,
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address, // Bridged USDC
  },
} as const;
