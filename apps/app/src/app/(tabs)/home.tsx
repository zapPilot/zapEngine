import type { ReactElement } from 'react';

import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { HomeScreen } from '@/screens/HomeScreen';

export default function HomeRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="home">
      <HomeScreen />
    </ScreenCrashBoundary>
  );
}
