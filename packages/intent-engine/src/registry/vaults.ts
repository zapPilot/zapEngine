import type { Address } from 'viem';

import { SUPPORTED_CHAINS, USDC_ADDRESS } from './chains.js';

export type Bucket = 'btc' | 'eth' | 'spy' | 'stable' | 'alt';

export interface VaultEntry {
  protocol: 'morpho' | 'gmx-v2';
  vault: Address;
  asset: Address;
}

type BucketRegistry = Record<Bucket, VaultEntry | null>;

export const VAULT_REGISTRY: Record<number, BucketRegistry> = {
  [SUPPORTED_CHAINS.BASE]: {
    stable: {
      protocol: 'morpho',
      vault: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
      asset: USDC_ADDRESS[SUPPORTED_CHAINS.BASE]!,
    },
    btc: null,
    eth: null,
    spy: null,
    alt: null,
  },
  [SUPPORTED_CHAINS.ETHEREUM]: {
    stable: null,
    btc: null,
    eth: null,
    spy: null,
    alt: null,
  },
  [SUPPORTED_CHAINS.ARBITRUM]: {
    stable: null,
    btc: null,
    eth: null,
    spy: null,
    alt: null,
  },
};

export function getVaultForBucket(
  chainId: number,
  bucket: Bucket,
): VaultEntry | null {
  return VAULT_REGISTRY[chainId]?.[bucket] ?? null;
}
