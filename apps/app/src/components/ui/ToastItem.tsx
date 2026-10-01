import { cssInterop } from 'nativewind';
import { tokens } from '@zapengine/design-tokens/tokens';
import type { Toast } from '@zapengine/app-core/providers/toastTypes';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { Tap } from './Tap';
import { Text } from './Text';
import { Icon } from './Icon';
import { useReducedMotion } from './useReducedMotion';
import { cn } from '@/lib/cn';
const borders = {
  success: 'border-success-line',
  error: 'border-danger-line',
  warning: 'border-warning-line',
  info: 'border-accent-line',
} as const;
cssInterop(Animated.View, { className: 'style' });

export function ToastItem({
  toast,
  onPress,
}: {
  toast: Toast;
  onPress: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: tokens.duration.slow,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion]);
  const tone =
    toast.type === 'error'
      ? 'danger'
      : toast.type === 'info'
        ? 'accent'
        : toast.type;
  return (
    <Animated.View
      className="w-full max-w-narrow"
      style={{
        opacity,
        transform: [
          {
            translateY: opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [-tokens.size.icon.md, 0],
            }),
          },
        ],
      }}
    >
      <Tap
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          toast.action?.label ?? toast.link?.text ?? toast.title
        }
        className={cn(
          'flex-row gap-3 rounded-card border bg-surface-elevated p-4 shadow-raised',
          borders[toast.type],
        )}
      >
        <Icon
          icon={
            toast.type === 'success'
              ? CircleCheck
              : toast.type === 'info'
                ? Info
                : TriangleAlert
          }
          tone={tone}
        />
        <View
          className="min-w-0 flex-1"
          accessibilityLiveRegion={
            toast.type === 'error' ? 'assertive' : 'polite'
          }
        >
          <Text variant="subheading" tone={tone}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text variant="body-sm" tone="secondary" className="mt-1">
              {toast.message}
            </Text>
          ) : null}
          {toast.action || toast.link ? (
            <Text variant="label" tone="accent" className="mt-2">
              {toast.action?.label ?? toast.link?.text}
            </Text>
          ) : null}
        </View>
      </Tap>
    </Animated.View>
  );
}
