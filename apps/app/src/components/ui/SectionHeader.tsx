import type { ReactNode, ReactElement } from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { cn } from '@/lib/cn';
export function SectionHeader({
  title,
  variant = 'label',
  action,
  className,
}: {
  title: ReactNode;
  variant?: 'label' | 'title';
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <View
      className={cn('flex-row items-center justify-between gap-3', className)}
    >
      <Text
        heading={2}
        variant={variant === 'label' ? 'label' : 'heading'}
        tone={variant === 'label' ? 'muted' : 'default'}
        className="min-w-0 flex-1"
      >
        {title}
      </Text>
      {action}
    </View>
  );
}
