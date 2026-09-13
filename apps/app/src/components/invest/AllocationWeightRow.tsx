import { Text, TextInput, View } from 'react-native';

interface AllocationWeightRowProps {
  title: string;
  detail: string;
  /** Raw editor text, so a half-typed `"12."` survives a re-render. */
  percentInput: string;
  onChangePercent: (value: string) => void;
}

/** One destination's target weight in the allocation editor. */
export function AllocationWeightRow({
  title,
  detail,
  percentInput,
  onChangePercent,
}: AllocationWeightRowProps) {
  return (
    <View className="flex-row items-center justify-between border-t border-line py-3">
      <View className="min-w-0 flex-1 pr-4">
        <Text className="font-sans-semibold text-[12px] text-ink">{title}</Text>
        <Text className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
          {detail}
        </Text>
      </View>
      <View className="flex-row items-center rounded-xl border border-line bg-[#171719] px-2.5 py-1.5">
        <TextInput
          accessibilityLabel={`${title} allocation percentage`}
          className="w-12 text-right font-mono-semibold text-[12px] text-accent"
          keyboardType="decimal-pad"
          value={percentInput}
          onChangeText={onChangePercent}
        />
        <Text className="ml-1 font-mono-semibold text-[12px] text-accent">
          %
        </Text>
      </View>
    </View>
  );
}
