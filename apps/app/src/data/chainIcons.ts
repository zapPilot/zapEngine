import type { ChainBrandKey } from '@zapengine/brand-assets/chains';
import type { ImageSourcePropType } from 'react-native';

export const CHAIN_ICON_SRC: Record<ChainBrandKey, ImageSourcePropType> = {
  ethereum: require('@zapengine/brand-assets/assets/chains/ethereum.png'),
  base: require('@zapengine/brand-assets/assets/chains/base.png'),
  arbitrum: require('@zapengine/brand-assets/assets/chains/arbitrum.png'),
  hyperliquid: require('@zapengine/brand-assets/assets/chains/hyperliquid.png'),
};
