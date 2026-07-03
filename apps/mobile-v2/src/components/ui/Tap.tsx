import type { ReactElement, ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface TapProps extends Omit<PressableProps, 'style' | 'children'> {
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * Pressable with the desktop `.zp-tap` press feedback (scale 0.975 + dim).
 */
export function Tap({
  className,
  style,
  children,
  ...rest
}: TapProps): ReactElement {
  return (
    <Pressable
      className={className ?? ''}
      style={({ pressed }) => [
        style,
        pressed ? { transform: [{ scale: 0.975 }], opacity: 0.9 } : null,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
