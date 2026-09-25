import { tokens } from '@zapengine/design-tokens/tokens';
import { Info } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

export function StrategyHeader() {
  return (
    <View className="flex-row items-start justify-between px-5 pt-2">
      <View>
        <Text className="font-serif text-[27px] leading-[31px] text-ink">
          Zap Strategy
        </Text>
        <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.99px] text-[#9a8f78]">
          Disciplined Portfolio Autopilot
        </Text>
      </View>
      <Tap className="h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.05)]">
        <Info size={17} strokeWidth={1.8} color={tokens.color['ink-dim']} />
      </Tap>
    </View>
  );
}
