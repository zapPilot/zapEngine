import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

interface ScreenHeaderProps {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

/** Serif page title with optional leading/trailing actions (tab screens). */
export function ScreenHeader({
  title,
  left,
  right,
  className,
}: ScreenHeaderProps) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between px-5 pt-2',
        className,
      )}
    >
      <View className="flex-row items-center gap-3">
        {left}
        <Text className="font-serif text-[27px] leading-none text-ink">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
