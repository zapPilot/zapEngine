import { Tabs } from 'expo-router';
import type { ReactElement } from 'react';

import { AppTabBar } from '@/components/shell/AppTabBar';
import { DEFAULT_APP_TAB } from '@/integration/navigationModel';

export default function TabsLayout(): ReactElement {
  return (
    <Tabs
      initialRouteName={DEFAULT_APP_TAB}
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="strategy" />
      <Tabs.Screen name="podcast" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
