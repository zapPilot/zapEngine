import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Text, type TextProps } from './Text';
import { useReducedMotion } from './useReducedMotion';
export function KineticText({ children, ...props }: TextProps) {
  const reducedMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    progress.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: tokens.duration.slow,
      easing: Easing.bezier(...tokens.easing.enter),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [children, reducedMotion, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [tokens.space[2], 0],
            }),
          },
        ],
      }}
    >
      <Text {...props}>{children}</Text>
    </Animated.View>
  );
}
