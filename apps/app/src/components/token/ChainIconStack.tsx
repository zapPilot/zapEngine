import type { ChainBrandKey } from '@zapengine/brand-assets';
import { Image, View } from 'react-native';

import { CHAIN_ICON_SRC } from '@/data/assetIcons';

interface ChainIconStackProps {
  chains: readonly ChainBrandKey[];
  size?: number;
}

/** Overlapping chain dots — the design surfaces chains only as small icons. */
export function ChainIconStack({ chains, size = 14 }: ChainIconStackProps) {
  return (
    <View className="flex-row items-center">
      {chains.map((chain, index) => (
        // The #0a0a0a disc and ring match the screen background, so each mark
        // reads as a separate coin instead of bleeding into the one behind it.
        <Image
          key={chain}
          source={CHAIN_ICON_SRC[chain]}
          accessibilityIgnoresInvertColors
          className="rounded-full border-[1.5px] border-[#0a0a0a] bg-[#0a0a0a]"
          style={{
            width: size,
            height: size,
            marginLeft: index === 0 ? 0 : -5,
          }}
        />
      ))}
    </View>
  );
}
