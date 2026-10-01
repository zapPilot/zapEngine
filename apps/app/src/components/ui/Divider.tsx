import type { ReactElement } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
export function Divider({ className }: { className?: string }): ReactElement {
  return <View accessible={false} className={cn('h-px bg-line', className)} />;
}
