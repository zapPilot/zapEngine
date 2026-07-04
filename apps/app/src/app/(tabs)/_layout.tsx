import { Tabs } from 'expo-router';
import type { ReactElement } from 'react';

import { BottomTabBar } from '@/components/BottomTabBar';

export default function TabsLayout(): ReactElement {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="portfolio" />
      <Tabs.Screen name="strategy" />
      <Tabs.Screen name="podcast" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
