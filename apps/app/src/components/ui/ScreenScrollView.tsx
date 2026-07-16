import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenScrollViewProps {
  children: ReactNode;
  bottomPadding?: number;
}

export function ScreenScrollView({
  children,
  bottomPadding = 24,
}: ScreenScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
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
