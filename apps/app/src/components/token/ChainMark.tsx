import { CHAIN_BRAND, type ChainBrandKey } from '@zapengine/brand-assets';
import { Image } from 'react-native';

import { CHAIN_ICON_SRC } from '@/data/assetIcons';

interface ChainMarkProps {
  chainKey: ChainBrandKey;
  size?: number;
  /** Pass the chain name only when no adjacent text already names it. */
  labelled?: boolean;
}

/**
 * Standalone inline chain mark. A chain is always a qualifier for something
 * else — a token, a funding row, a venue — so this stays small and carries no
 * brand-colored backing plate, which would flatten the marks into each other.
 */
export function ChainMark({
  chainKey,
  size = 16,
  labelled = false,
}: ChainMarkProps) {
  return (
    <Image
      source={CHAIN_ICON_SRC[chainKey]}
      accessible={labelled}
      accessibilityLabel={labelled ? CHAIN_BRAND[chainKey].label : undefined}
      accessibilityIgnoresInvertColors
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
