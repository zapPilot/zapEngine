import type { ImageSourcePropType } from 'react-native';

import type { ChainKey } from '@/data/demo';

export const CHAIN_ICON_SRC_BY_CHAIN: Record<ChainKey, ImageSourcePropType> = {
  ethereum: require('../../assets/chains/ethereum.png'),
  base: require('../../assets/chains/base.png'),
  arbitrum: require('../../assets/chains/arbitrum.png'),
};

// STABLE shipped as an svg on desktop; RN uses the glyph fallback instead.
const TOKEN_ICON_SRC_BY_SYMBOL = {
  USDC: require('../../assets/tokens/usdc.png'),
  USDT: require('../../assets/tokens/usdt.png'),
  ETH: require('../../assets/tokens/eth.png'),
  WETH: require('../../assets/tokens/weth.png'),
  WBTC: require('../../assets/tokens/wbtc.png'),
  CBBTC: require('../../assets/tokens/cbbtc.png'),
  BTC: require('../../assets/tokens/wbtc.png'),
  SPY: require('../../assets/tokens/spyon.png'),
} as const;

export function tokenIconSrcForSymbol(
  symbol: string,
): ImageSourcePropType | undefined {
  return TOKEN_ICON_SRC_BY_SYMBOL[
    symbol as keyof typeof TOKEN_ICON_SRC_BY_SYMBOL
  ];
}
