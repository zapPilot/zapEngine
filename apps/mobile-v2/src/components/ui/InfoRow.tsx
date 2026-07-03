import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  /** Adds a hairline bottom border between stacked rows. */
  divider?: boolean;
}

/** Label-left / value-right summary row (fees, time, settings, …). */
export function InfoRow({ label, value, className, divider }: InfoRowProps) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between py-[11px]',
        divider && 'border-b border-line',
        className,
      )}
    >
      <Text className="text-[12.5px] text-ink-dim">{label}</Text>
      <Text className="font-mono text-[12.5px] text-ink">{value}</Text>
    </View>
  );
}
