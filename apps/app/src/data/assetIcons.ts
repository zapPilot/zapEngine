import type {
  ChainBrandKey,
  ProtocolBrandKey,
  TokenBrandSymbol,
} from '@zapengine/brand-assets';
import type { ImageSourcePropType } from 'react-native';

/**
 * Metro-side half of the shared brand registry. `@zapengine/brand-assets` owns
 * the identifiers and metadata; only this file knows how to turn one into an
 * image, because `require` returns a Metro asset reference that no other
 * bundler produces.
 *
 * Each map is a total `Record`, so adding a registry key without shipping its
 * artwork fails type-check here instead of silently degrading in the UI.
 */

export const CHAIN_ICON_SRC: Record<ChainBrandKey, ImageSourcePropType> = {
  ethereum: require('@zapengine/brand-assets/assets/chains/ethereum.png'),
  base: require('@zapengine/brand-assets/assets/chains/base.png'),
  arbitrum: require('@zapengine/brand-assets/assets/chains/arbitrum.png'),
  hyperliquid: require('@zapengine/brand-assets/assets/chains/hyperliquid.png'),
};

export const TOKEN_ICON_SRC: Record<TokenBrandSymbol, ImageSourcePropType> = {
  USDC: require('@zapengine/brand-assets/assets/tokens/usdc.png'),
  USDT: require('@zapengine/brand-assets/assets/tokens/usdt.png'),
  ETH: require('@zapengine/brand-assets/assets/tokens/eth.png'),
  WETH: require('@zapengine/brand-assets/assets/tokens/weth.png'),
  WBTC: require('@zapengine/brand-assets/assets/tokens/wbtc.png'),
  CBBTC: require('@zapengine/brand-assets/assets/tokens/cbbtc.png'),
  BTC: require('@zapengine/brand-assets/assets/tokens/btc.png'),
  SPY: require('@zapengine/brand-assets/assets/tokens/spy.png'),
  ALT: require('@zapengine/brand-assets/assets/tokens/alt.png'),
};

export const PROTOCOL_ICON_SRC: Record<ProtocolBrandKey, ImageSourcePropType> =
  {
    morpho: require('@zapengine/brand-assets/assets/protocols/morpho.png'),
    'gmx-v2': require('@zapengine/brand-assets/assets/protocols/gmx-v2.png'),
    hyperliquid: require('@zapengine/brand-assets/assets/protocols/hyperliquid.png'),
    ondo: require('@zapengine/brand-assets/assets/protocols/ondo.png'),
    aave: require('@zapengine/brand-assets/assets/protocols/aave.png'),
    lido: require('@zapengine/brand-assets/assets/protocols/lido.png'),
    'eth-staking': require('@zapengine/brand-assets/assets/chains/ethereum.png'),
  };
