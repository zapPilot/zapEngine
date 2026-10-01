import { View } from 'react-native';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BottomTabBar, type BottomTabBarProps } from './BottomTabBar';
import { NowPlayingBarHost } from './NowPlayingBarHost';
export function AppTabBar(props: BottomTabBarProps) {
  const { hasSideNav } = useBreakpoint();
  if (hasSideNav) return null;
  return (
    <View className="shrink-0 bg-bg">
      <NowPlayingBarHost />
      <BottomTabBar {...props} />
    </View>
  );
}
