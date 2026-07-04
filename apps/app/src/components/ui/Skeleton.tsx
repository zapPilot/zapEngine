import { cssInterop } from 'nativewind';
import { useEffect, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { cn } from '@/lib/cn';

// Animated.View is not in NativeWind's default interop set.
cssInterop(Animated.View, { className: 'style' });

interface SkeletonBlockProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Brand-aligned shimmer placeholder for loading states. */
export function SkeletonBlock({ className, style }: SkeletonBlockProps) {
  const [opacity] = useState(() => new Animated.Value(1));

  // RN replacement for the web `animate-pulse` keyframes (1 → 0.5 → 1, 2s).
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={cn('rounded-md bg-white/[0.07]', className)}
      style={[style, { opacity }]}
    />
  );
}
