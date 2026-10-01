import { useState, type ReactNode, type Ref } from 'react';
import { Platform, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@zapengine/design-tokens/tokens';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { contentWidthFor, pageGutter, type PageWidth } from '@/lib/layout';

import { ContentWidthContext } from './contentWidthContext';

interface ScreenScrollViewProps {
  children: ReactNode;
  width: PageWidth;
  bottomPadding?: number;
  scrollRef?: Ref<ScrollView>;
  refreshControl?: ScrollViewProps['refreshControl'];
}

export function ScreenScrollView({
  children,
  width,
  bottomPadding = 24,
  scrollRef,
  refreshControl,
}: ScreenScrollViewProps) {
  const { width: viewportWidth, hasSideNav } = useBreakpoint();
  const availableWidth = viewportWidth - (hasSideNav ? tokens.size.sidenav : 0);
  const gutter = pageGutter(availableWidth);
  const maximumWidth = contentWidthFor(availableWidth, width) + gutter * 2;
  const [contentWidth, setContentWidth] = useState(0);
  const insets = useSafeAreaInsets();
  const showScrollbar = Platform.OS === 'web';

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-bg"
      contentContainerStyle={{
        alignItems: 'center',
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: bottomPadding,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={showScrollbar}
    >
      <View
        className="w-full"
        style={{ maxWidth: maximumWidth, paddingHorizontal: gutter }}
      >
        <ContentWidthContext.Provider
          value={contentWidth || contentWidthFor(availableWidth, width)}
        >
          <View
            className="w-full"
            onLayout={(event) =>
              setContentWidth(event.nativeEvent.layout.width)
            }
          >
            {children}
          </View>
        </ContentWidthContext.Provider>
      </View>
    </ScrollView>
  );
}
