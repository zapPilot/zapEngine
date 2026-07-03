import type { ReactElement } from 'react';
import { ScrollView, Text, View } from 'react-native';

/**
 * NativeWind spike screen exercising the porting-critical class shapes
 * (arbitrary sizes/colors, token colors, per-weight font families). Replaced
 * by the ported HomeScreen in the screen waves.
 */
export default function HomeRoute(): ReactElement {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-5 pb-16 pt-20"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-[11px] font-sans-semibold uppercase tracking-[1.4px] text-ink-faint">
        Net Worth
      </Text>
      <Text className="mt-2 font-serif text-[54px] leading-[58px] text-ink">
        $128,439
      </Text>
      <View className="mt-4 rounded-[15px] border border-line bg-[rgba(255,255,255,.045)] p-4">
        <Text className="text-[12.5px] font-sans-semibold text-success">
          +2.4% today
        </Text>
        <Text className="mt-1 font-mono-semibold text-[13px] text-accent">
          0x12ab…89ef
        </Text>
      </View>
    </ScrollView>
  );
}
