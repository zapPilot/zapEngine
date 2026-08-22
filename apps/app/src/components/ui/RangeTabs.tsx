import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

interface RangeTabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange?: (value: T) => void;
  optionLabel?: (value: T) => string;
  optionIcon?: (value: T) => ReactNode;
  accessibilityLabel?: string;
  comfortable?: boolean;
  className?: string;
}

/** Segmented time-range selector (1D / 1W / 1M / 1Y / ALL …). */
export function RangeTabs<T extends string>({
  options,
  value,
  onChange,
  optionLabel,
  optionIcon,
  accessibilityLabel,
  comfortable = false,
  className,
}: RangeTabsProps<T>) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className={cn('flex-row gap-1', className)}
    >
      {options.map((opt) => {
        const active = opt === value;
        const icon = optionIcon?.(opt);
        return (
          <Tap
            key={opt}
            accessibilityLabel={optionLabel?.(opt) ?? opt}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(opt)}
            className={cn(
              'items-center justify-center rounded-full px-[11px]',
              comfortable ? 'min-h-11 min-w-11' : 'py-[5px]',
              active && 'bg-accent-soft',
            )}
          >
            {icon ? (
              <View className="flex-row items-center gap-1.5">
                {icon}
                <Text
                  className={cn(
                    'font-mono text-[11px]',
                    active ? 'text-accent' : 'text-ink-faint',
                  )}
                >
                  {optionLabel?.(opt) ?? opt}
                </Text>
              </View>
            ) : (
              <Text
                className={cn(
                  'font-mono text-[11px]',
                  active ? 'text-accent' : 'text-ink-faint',
                )}
              >
                {optionLabel?.(opt) ?? opt}
              </Text>
            )}
          </Tap>
        );
      })}
    </View>
  );
}
