import type { Address } from 'viem';

export const SUPPORTED_CHAINS = {
  ETHEREUM: 1,
  BASE: 8453,
  ARBITRUM: 42161,
} as const;

export const USDC_ADDRESS: Record<number, Address> = {
  [SUPPORTED_CHAINS.ETHEREUM]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  [SUPPORTED_CHAINS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [SUPPORTED_CHAINS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

export const NATIVE_TOKEN: Record<number, Address> = {
  [SUPPORTED_CHAINS.ETHEREUM]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [SUPPORTED_CHAINS.BASE]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [SUPPORTED_CHAINS.ARBITRUM]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
};

export const LIFI_DIAMOND_ADDRESS =
  '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;
