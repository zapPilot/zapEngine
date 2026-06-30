import type { ChainKey } from '@/data/demo';

export const CHAIN_ICON_SRC_BY_CHAIN: Record<ChainKey, string> = {
  ethereum: '/chains/ethereum.png',
  base: '/chains/base.png',
  arbitrum: '/chains/arbitrum.png',
};

export const TOKEN_ICON_SRC_BY_SYMBOL = {
  USDC: '/tokens/usdc.png',
  USDT: '/tokens/usdt.png',
  ETH: '/tokens/eth.png',
  WETH: '/tokens/weth.png',
  WBTC: '/tokens/wbtc.png',
  CBBTC: '/tokens/cbbtc.png',
  BTC: '/tokens/wbtc.png',
  SPY: '/tokens/spyon.png',
  STABLE: '/tokens/stable.svg',
} as const;
