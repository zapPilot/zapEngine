import type { ChainBrandKey } from '@zapengine/brand-assets';
import { ChevronDown } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { TokenIcon } from '@/components/token/TokenIcon';
import { Tap } from '@/components/ui/Tap';

interface TokenSelectorPillProps {
  symbol: string;
  /** Adds the chain badge, so the pill names the asset and its network at once. */
  chainKey?: ChainBrandKey;
  accessibilityLabel: string;
  onPress?: (() => void) | undefined;
}

const PILL_CLASS =
  'min-h-11 flex-row items-center gap-2 rounded-full border border-line bg-[#242427] py-2 pl-2 pr-3';

export function TokenSelectorPill({
  symbol,
  chainKey,
  accessibilityLabel,
  onPress,
}: TokenSelectorPillProps) {
  const content = (
    <>
      <TokenIcon
        symbol={symbol}
        size={28}
        alt=""
        {...(chainKey && { chainKey })}
      />
      <Text className="font-sans-semibold text-[13px] text-ink">{symbol}</Text>
    </>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} className={PILL_CLASS}>
        {content}
      </View>
    );
  }

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={PILL_CLASS}
      onPress={onPress}
    >
      {content}
      <ChevronDown size={15} color="#a1a1aa" />
    </Tap>
  );
}
