import { View } from 'react-native';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BottomTabBar, type BottomTabBarProps } from './BottomTabBar';
import { AppDock } from './AppDock';
export function AppTabBar(props: BottomTabBarProps) {
  const { hasSideNav } = useBreakpoint();
  if (hasSideNav) return null;
  return (
    <View className="shrink-0 bg-ground">
      <AppDock />
      <BottomTabBar {...props} />
    </View>
  );
}
