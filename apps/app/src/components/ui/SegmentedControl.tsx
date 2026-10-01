import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Chip } from './Chip';
import { cn } from '@/lib/cn';
interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string; accessibilityLabel: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  className?: string;
}
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>): ReactElement {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className={cn('flex-row gap-1', className)}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          accessibilityLabel={option.accessibilityLabel}
          accessibilityRole="tab"
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}
