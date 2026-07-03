import { Tabs } from 'expo-router';
import type { ReactElement } from 'react';

export default function TabsLayout(): ReactElement {
  return (
    // The custom BottomTabBar lands with the screen waves; hidden until then.
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
    >
      <Tabs.Screen name="home" />
    </Tabs>
  );
}
