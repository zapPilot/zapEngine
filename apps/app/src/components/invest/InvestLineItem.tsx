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
      className={`flex-row items-center gap-3 py-3 ${divider ? 'border-t border-line' : ''}`}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text className="text-[12px] text-ink">{title}</Text>
        <Text className="mt-1 text-[10px] text-ink-dim">{subtitle}</Text>
        {trailing}
      </View>
      <Text
        className={`font-mono text-[11px] ${valueTone === 'error' ? 'text-error' : 'text-ink'}`}
      >
        {value}
      </Text>
    </View>
  );
}
