import { Tabs } from 'expo-router';
import type { ReactElement } from 'react';

import { Platform } from 'react-native';
import { AppTabBar } from '@/components/shell/AppTabBar';
import { defaultTabFor } from '@/integration/navigationModel';

const BACK_BEHAVIOR = 'history' as const;

export default function TabsLayout(): ReactElement {
  return (
    <Tabs
      initialRouteName={defaultTabFor(Platform.OS)}
      backBehavior={BACK_BEHAVIOR}
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="listen" />
      <Tabs.Screen name="runtime" />
    </Tabs>
  );
}
