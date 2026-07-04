import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Base glass surface used across the design (subtle border + faint fill). */
export function Card({ children, className, style }: CardProps) {
  return (
    <View
      className={cn(
        'relative overflow-hidden rounded-3xl border border-line',
        className,
      )}
      style={[{ backgroundColor: 'rgba(255,255,255,.025)' }, style]}
    >
      {children}
    </View>
  );
}
