import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { wrapTextChildren } from '@/components/ui/textChildren';
import { cn } from '@/lib/cn';

interface PillProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Small rounded label/tag used for statuses and chain chips. */
export function Pill({ children, className, style }: PillProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1',
        className,
      )}
      style={style}
    >
      {/* RN text does not inherit from the container — wrap bare strings. */}
      {wrapTextChildren(children, 'text-xs text-ink')}
    </View>
  );
}
