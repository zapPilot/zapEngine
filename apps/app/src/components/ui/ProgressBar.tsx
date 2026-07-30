import { cssInterop } from 'nativewind';
import { useEffect, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, View } from 'react-native';

import { useReducedMotion } from '@/components/ui/useReducedMotion';
import { cn } from '@/lib/cn';

// Animated.View is not in NativeWind's default interop set.
cssInterop(Animated.View, { className: 'style' });

interface ProgressBarProps {
  /** 0-100. Clamped defensively; drives both the fill and the a11y value. */
  value: number;
  accessibilityLabel: string;
  height?: number;
  /** Track-level overrides such as width or margin. */
  className?: string;
}

const ANIMATION_DURATION_MS = 400;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Determinate progress bar for web and native.
 *
 * The fill animates a **measured pixel width**, not a percentage string. That
 * avoids two platform traps at once: string-output interpolation on
 * react-native-web, and Yoga's handling of a percentage width inside an
 * auto-sized parent — the likeliest way a bar like this ships invisible on
 * native only.
 */
export function ProgressBar({
  value,
  accessibilityLabel,
  height = 6,
  className,
}: ProgressBarProps) {
  const [progress] = useState(() => new Animated.Value(clampPercent(value)));
  const [trackWidth, setTrackWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  const percent = clampPercent(value);
  const now = Math.round(percent);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(percent);
      return;
    }
    // Width is neither a transform nor an opacity, so the native driver cannot
    // carry it. One JS-driven tween on an otherwise idle placeholder is fine.
    const animation = Animated.timing(progress, {
      toValue: percent,
      duration: ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [percent, progress, reduceMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
      onLayout={onLayout}
      className={cn('w-full overflow-hidden rounded-pill bg-line', className)}
      style={{ height }}
    >
      <Animated.View
        className="h-full rounded-pill bg-accent"
        style={{
          width: progress.interpolate({
            inputRange: [0, 100],
            outputRange: [0, trackWidth],
          }),
        }}
      />
    </View>
  );
}
