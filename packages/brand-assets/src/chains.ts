export type ChainBrandKey = 'ethereum' | 'base' | 'arbitrum' | 'hyperliquid';

export interface ChainBrand {
  readonly label: string;
  readonly color: string;
  readonly chainId: number;
}

export const CHAIN_BRAND: Record<ChainBrandKey, ChainBrand> = {
  ethereum: { label: 'Ethereum', color: '#627eea', chainId: 1 },
  base: { label: 'Base', color: '#0052ff', chainId: 8453 },
  arbitrum: { label: 'Arbitrum', color: '#12aaff', chainId: 42161 },
  hyperliquid: { label: 'Hyperliquid', color: '#50d2c1', chainId: 1337 },
};

const CHAIN_BRAND_KEY_BY_CHAIN_ID = new Map<number, ChainBrandKey>(
  (Object.keys(CHAIN_BRAND) as ChainBrandKey[]).map((key) => [
    CHAIN_BRAND[key].chainId,
    key,
  ]),
);

export function chainBrandKeyForChainId(
  chainId: number,
): ChainBrandKey | undefined {
  return CHAIN_BRAND_KEY_BY_CHAIN_ID.get(chainId);
}
