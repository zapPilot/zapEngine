import { cssInterop } from 'nativewind';
import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '@zapengine/design-tokens/tokens';
import { useReducedMotion } from './useReducedMotion';

import { cn } from '@/lib/cn';

// Animated.View is not in NativeWind's default interop set.
cssInterop(Animated.View, { className: 'style' });

interface SkeletonBlockProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Brand-aligned shimmer placeholder for loading states. */
export function SkeletonBlock({ className, style }: SkeletonBlockProps) {
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  // RN replacement for the web `animate-pulse` keyframes (1 → 0.5 → 1, 2s).
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: tokens.duration.slower * 3,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: tokens.duration.slower * 3,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      className={cn('rounded-control bg-line', className)}
      style={[style, { opacity }]}
    />
  );
}
