import { cssInterop } from 'nativewind';
import { tokens } from '@zapengine/design-tokens/tokens';
import { X } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { Tap } from './Tap';
import { Text } from './Text';
import { useReducedMotion } from './useReducedMotion';
import { cn } from '@/lib/cn';
cssInterop(Animated.View, { className: 'style' });

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  dismissible?: boolean;
  children: ReactNode;
}
/** RNW Modal owns Escape, focus trapping and focus restoration. */
export function Sheet({
  visible,
  onClose,
  title,
  closeLabel,
  dismissible = true,
  children,
}: SheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const centered = width >= tokens.breakpoint.medium;
  const [offset] = useState(() => new Animated.Value(0));
  const close = () => {
    if (dismissible) onClose();
  };
  useEffect(() => {
    offset.setValue(visible && !reducedMotion ? tokens.size.hit : 0);
    if (!visible || reducedMotion) return;
    const animation = Animated.spring(offset, {
      ...tokens.motion['enter-spring'],
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reducedMotion, offset]);
  const drag = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          dismissible && !centered && gesture.dy > tokens.size.icon.sm,
        onPanResponderMove: (_, gesture) => {
          if (!reducedMotion) offset.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > tokens.size.hit * 2) onClose();
          Animated.spring(offset, {
            ...tokens.motion['enter-spring'],
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => offset.setValue(0),
      }),
    [dismissible, centered, reducedMotion, offset, onClose],
  );
  return (
    <Modal
      accessibilityLabel={title}
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={close}
    >
      <View
        className={cn(
          'flex-1 bg-scrim',
          centered ? 'items-center justify-center px-8 py-8' : 'justify-end',
        )}
      >
        <Tap
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          feedback="none"
          disabled={!dismissible}
          onPress={close}
          className="absolute inset-0"
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={title}
          className={cn(
            'w-full max-w-reading overflow-hidden border border-line bg-surface-overlay shadow-overlay',
            centered ? 'rounded-sheet' : 'rounded-t-sheet',
          )}
          style={{ transform: [{ translateY: offset }], maxHeight: '90%' }}
        >
          {!centered ? (
            <View
              {...drag.panHandlers}
              accessible={false}
              className="items-center py-3"
            >
              <View className="h-1 w-9 rounded-pill bg-line-hi" />
            </View>
          ) : null}
          <View className="flex-row items-center gap-3 px-5 py-3">
            <Text variant="title-sm" heading={2} className="flex-1">
              {title}
            </Text>
            <IconButton
              icon={X}
              accessibilityLabel={closeLabel}
              onPress={close}
              disabled={!dismissible}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            className="shrink"
            contentContainerStyle={{
              paddingHorizontal: tokens.gutter.compact,
              paddingBottom: Math.max(insets.bottom, tokens.gutter.compact),
            }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
