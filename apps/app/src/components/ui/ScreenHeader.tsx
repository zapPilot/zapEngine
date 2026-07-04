import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

interface ScreenHeaderProps {
  title: string;
  right?: ReactNode;
  className?: string;
}

/** Serif page title with an optional trailing action (tab screens). */
export function ScreenHeader({ title, right, className }: ScreenHeaderProps) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between px-5 pt-2',
        className,
      )}
    >
      <Text className="font-serif text-[27px] leading-none text-ink">
        {title}
      </Text>
      {right}
    </View>
  );
}
