import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SideNav } from './SideNav.web';
export function AppShell({ children }: { children: ReactNode }) {
  const { hasSideNav } = useBreakpoint();
  const pathname = usePathname();
  return (
    <View className="flex-1 flex-row bg-ground">
      {hasSideNav && pathname !== '/welcome' ? <SideNav /> : null}
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}
