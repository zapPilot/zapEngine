import type { ProtocolBrandKey } from '@zapengine/brand-assets/protocols';
import type { ImageSourcePropType } from 'react-native';

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
