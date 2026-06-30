import type { ChainKey } from '@/data/demo';

export const CHAIN_ICON_SRC_BY_CHAIN: Record<ChainKey, string> = {
  ethereum: '/chains/ethereum.svg',
  base: '/chains/base.svg',
  arbitrum: '/chains/arbitrum.svg',
};

export const TOKEN_ICON_SRC_BY_SYMBOL = {
  USDC: '/tokens/usdc.svg',
  USDT: '/tokens/usdt.svg',
  ETH: '/tokens/eth.svg',
  WETH: '/tokens/weth.svg',
  WBTC: '/tokens/wbtc.svg',
  CBBTC: '/tokens/wbtc.svg',
  BTC: '/tokens/wbtc.svg',
  SPY: '/tokens/sp500.svg',
  STABLE: '/tokens/stable.svg',
} as const;

export type TokenIconSymbol = keyof typeof TOKEN_ICON_SRC_BY_SYMBOL;

export function tokenIconSrcForSymbol(
  symbol: string | null | undefined,
): string | undefined {
  const normalized = symbol?.trim().toUpperCase() as
    | TokenIconSymbol
    | undefined;
  return normalized ? TOKEN_ICON_SRC_BY_SYMBOL[normalized] : undefined;
}
