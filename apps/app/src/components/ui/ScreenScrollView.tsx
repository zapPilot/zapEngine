import type { ReactNode, Ref } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenScrollViewProps {
  children: ReactNode;
  bottomPadding?: number;
  scrollRef?: Ref<ScrollView>;
  refreshControl?: ScrollViewProps['refreshControl'];
}

export function ScreenScrollView({
  children,
  bottomPadding = 24,
  scrollRef,
  refreshControl,
}: ScreenScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-bg"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: bottomPadding,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
