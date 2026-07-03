import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

interface RangeTabsProps {
  options: readonly string[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

/** Segmented time-range selector (1D / 1W / 1M / 1Y / ALL …). */
export function RangeTabs({
  options,
  value,
  onChange,
  className,
}: RangeTabsProps) {
  return (
    <View className={cn('flex-row gap-1', className)}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Tap
            key={opt}
            onPress={() => onChange?.(opt)}
            className={cn(
              'rounded-full px-[11px] py-[5px]',
              active && 'bg-accent-soft',
            )}
          >
            <Text
              className={cn(
                'font-mono text-[11px]',
                active ? 'text-accent' : 'text-ink-faint',
              )}
            >
              {opt}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
