import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
export function InvestLineItem({
  icon,
  title,
  subtitle,
  value,
  valueTone,
  trailing,
  divider,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
  value: string;
  valueTone?: 'error' | undefined;
  trailing?: ReactNode;
  divider?: boolean;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 py-3',
        divider ? 'border-t border-rule' : '',
      )}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text className="font-text text-caption text-ink">{title}</Text>
        <Text className="font-mono-medium mt-1 text-label text-ink-2">
          {subtitle}
        </Text>
        {trailing}
      </View>
      <Text
        className={cn(
          'font-mono text-data',
          valueTone === 'error' ? 'text-alert' : 'text-ink',
        )}
      >
        {value}
      </Text>
    </View>
  );
}
