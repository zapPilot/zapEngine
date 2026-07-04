import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { ZapLogo } from '@/components/ui/ZapLogo';

/** Home header: brand mark + name on the left, account avatar on the right. */
export function AppHeader() {
  return (
    <View className="flex-row items-center justify-between px-5 pt-1.5">
      <View className="flex-row items-center gap-2.5">
        <View className="h-8 w-8 items-center justify-center rounded-[9px] border border-[rgba(212,197,163,.3)] bg-[#141416]">
          <ZapLogo size={16} />
        </View>
        <Text className="font-sans-semibold text-base tracking-[-0.4px] text-ink">
          Zap Pilot
        </Text>
      </View>
      <LinearGradient
        colors={['#2b2820', '#141416']}
        start={{ x: 0.18, y: 0.12 }}
        end={{ x: 0.82, y: 0.88 }}
        className="h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border border-[rgba(212,197,163,.3)]"
      >
        <Text className="font-sans-semibold text-[13px] text-accent">A</Text>
      </LinearGradient>
    </View>
  );
}
