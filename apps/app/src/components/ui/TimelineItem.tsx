import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './Text';
export function TimelineItem({
  marker,
  eyebrow,
  title,
  children,
}: {
  marker: ReactNode;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="items-center gap-2">
        {marker}
        <View className="w-px flex-1 bg-rule" />
      </View>
      <View className="flex-1 gap-1 pb-5">
        <Text variant="label" tone="muted">
          {eyebrow}
        </Text>
        <Text variant="body-sm">{title}</Text>
        {children}
      </View>
    </View>
  );
}
