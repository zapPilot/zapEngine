import { Image, View } from 'react-native';

import { CHAIN_ICON_SRC_BY_CHAIN } from '@/data/assetIcons';
import { type ChainKey, CHAINS } from '@/data/demo';

interface ChainIconStackProps {
  chains: ChainKey[];
  size?: number;
}

/** Overlapping chain dots — the design surfaces chains only as small icons. */
export function ChainIconStack({ chains, size = 14 }: ChainIconStackProps) {
  return (
    <View className="flex-row items-center">
      {chains.map((chain, index) => (
        <Image
          key={chain}
          source={CHAIN_ICON_SRC_BY_CHAIN[chain]}
          className="rounded-full border-[1.5px] border-[#0a0a0a]"
          style={{
            width: size,
            height: size,
            backgroundColor: CHAINS[chain].color,
            marginLeft: index === 0 ? 0 : -5,
          }}
        />
      ))}
    </View>
  );
}
