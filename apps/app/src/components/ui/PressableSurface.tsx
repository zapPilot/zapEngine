import type { ReactElement, ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Tap } from './Tap';

export function PressableSurface({
  children,
  className,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  className: string;
  style?: StyleProp<ViewStyle>;
  onPress: (() => void) | undefined;
  accessibilityLabel: string | undefined;
}): ReactElement {
  return onPress ? (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      className={className}
      style={style}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {children}
    </Tap>
  ) : (
    <View className={className} style={style}>
      {children}
    </View>
  );
}
