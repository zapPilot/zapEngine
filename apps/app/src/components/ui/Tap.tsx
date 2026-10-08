import { tokens } from '@zapengine/design-tokens/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactElement } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';
import { useReducedMotion } from './useReducedMotion';
import type { TapProps } from './Tap.types';
export type { TapProps } from './Tap.types';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function triggerPressHaptic(): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    /* Haptics are best-effort; a failure must never break the press. */
  });
}

export function Tap({
  className,
  style,
  children,
  feedback = 'scale',
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: TapProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (disabled || reducedMotion) scale.setValue(1);
  }, [disabled, reducedMotion, scale]);
  const animate = (pressed: boolean) => {
    if (disabled || reducedMotion || feedback !== 'scale') return;
    Animated.timing(scale, {
      duration: tokens.duration.fast,
      easing: Easing.bezier(...tokens.easing.enter),
      toValue: pressed ? tokens.motion['press-scale'] : 1,
      useNativeDriver: true,
    }).start();
  };
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      className={className ?? ''}
      onPressIn={(event) => {
        animate(true);
        if (!disabled) triggerPressHaptic();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(false);
        onPressOut?.(event);
      }}
      style={({ pressed }) => [
        style,
        feedback === 'scale' ? { transform: [{ scale }] } : undefined,
        pressed && !disabled && feedback === 'opacity'
          ? { opacity: 0.75 }
          : undefined,
        pressed && !disabled && feedback === 'highlight'
          ? { backgroundColor: tokens.mode.night['well'] }
          : undefined,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
