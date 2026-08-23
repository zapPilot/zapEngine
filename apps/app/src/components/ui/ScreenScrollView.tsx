import type { ReactNode, Ref } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenScrollViewProps {
  children: ReactNode;
  bottomPadding?: number;
  scrollRef?: Ref<ScrollView>;
}

export function ScreenScrollView({
  children,
  bottomPadding = 24,
  scrollRef,
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
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
