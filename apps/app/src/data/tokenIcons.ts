import type { TokenBrandSymbol } from '@zapengine/brand-assets/tokens';
import type { ImageSourcePropType } from 'react-native';

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
