import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  /**
   * Marks rendered before the label. Separate from `label` because React Native
   * cannot nest a View inside a Text.
   */
  icon?: ReactNode;
  className?: string;
  /** Adds a hairline bottom border between stacked rows. */
  divider?: boolean;
}

/** Label-left / value-right summary row (fees, time, settings, …). */
export function InfoRow({
  label,
  value,
  icon,
  className,
  divider,
}: InfoRowProps) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-3 py-[11px]',
        divider && 'border-b border-line',
        className,
      )}
    >
      {icon ? (
        <View className="min-w-0 shrink flex-row items-center gap-2">
          {icon}
          <Text className="text-[12.5px] text-ink-dim" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : (
        <Text className="text-[12.5px] text-ink-dim">{label}</Text>
      )}
      <Text className="font-mono text-[12.5px] text-ink">{value}</Text>
    </View>
  );
}
