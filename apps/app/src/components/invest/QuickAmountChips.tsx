import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

export type QuickAmountBps = 2_500 | 5_000 | 7_500 | 10_000;

const QUICK_AMOUNT_OPTIONS: readonly {
  label: string;
  bps: QuickAmountBps;
  defaultAccessibilityLabel: string;
}[] = [
  {
    label: '25%',
    bps: 2_500,
    defaultAccessibilityLabel: 'Use 25% of the available amount',
  },
  {
    label: '50%',
    bps: 5_000,
    defaultAccessibilityLabel: 'Use 50% of the available amount',
  },
  {
    label: '75%',
    bps: 7_500,
    defaultAccessibilityLabel: 'Use 75% of the available amount',
  },
  {
    label: 'Max',
    bps: 10_000,
    defaultAccessibilityLabel: 'Use the maximum available amount',
  },
];

interface QuickAmountChipsProps {
  disabled: boolean;
  onSelect: (bps: QuickAmountBps) => void;
  maxAccessibilityLabel?: string;
}

export function QuickAmountChips({
  disabled,
  onSelect,
  maxAccessibilityLabel,
}: QuickAmountChipsProps) {
  return (
    <View className="mt-3 flex-row gap-2">
      {QUICK_AMOUNT_OPTIONS.map((option) => (
        <Tap
          key={option.bps}
          accessibilityRole="button"
          accessibilityLabel={
            option.bps === 10_000
              ? (maxAccessibilityLabel ?? option.defaultAccessibilityLabel)
              : option.defaultAccessibilityLabel
          }
          accessibilityState={{ disabled }}
          className={`min-h-11 flex-1 items-center justify-center rounded-full border border-line bg-[#171719] ${
            disabled ? 'opacity-50' : ''
          }`}
          disabled={disabled}
          onPress={() => onSelect(option.bps)}
        >
          <Text className="font-mono text-[11px] text-ink-dim">
            {option.label}
          </Text>
        </Tap>
      ))}
    </View>
  );
}
