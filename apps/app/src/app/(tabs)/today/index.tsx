import type { ReactElement } from 'react';

import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { TodayScreen } from '@/screens/TodayScreen';

export default function TodayRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="today">
      <TodayScreen />
    </ScreenCrashBoundary>
  );
}
