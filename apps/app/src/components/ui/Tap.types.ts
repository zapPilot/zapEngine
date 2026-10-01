import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

export interface TapProps extends Omit<PressableProps, 'style' | 'children'> {
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  feedback?: 'scale' | 'highlight' | 'opacity' | 'none';
}
